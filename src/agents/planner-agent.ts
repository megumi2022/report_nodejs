import { OutlineNode } from "../tools/outline-parser.ts";
import { AssetIndexRecord } from "../services/asset-registry-service.ts";

export type TaskType =
    | "materialize_fixed"
    | "prepare"
    | "retrieve"
    | "write"
    | "verify"
    | "assemble";

export interface TaskNode {
    id: string;
    type: TaskType;
    label: string;
    outlineId?: string;
    dependencies: string[];
    metadata?: Record<string, any>;
}

export interface TaskEdge {
    from: string;
    to: string;
    reason?: string;
}

export interface TaskDag {
    nodes: TaskNode[];
    edges: TaskEdge[];
    summary: {
        total: number;
        byType: Record<TaskType, number>;
    };
}

export interface PlannerContext {
    projectId: string;
    outline: OutlineNode[];
    assetsIndex: AssetIndexRecord[];
    projectContext: Record<string, any>;
    metrics?: any;
    writingJournal?: any;
    evidenceMap?: any;
}

interface FlattenedOutlineNode {
    node: OutlineNode;
    parentId?: string;
}

export class PlannerAgent {
    buildDag(context: PlannerContext): TaskDag {
        const flattened = this.flattenOutline(context.outline);
        const nodes: TaskNode[] = [];
        const edges: TaskEdge[] = [];
        const index = new Map<string, TaskNode>();

        const hasEmbedReady = context.assetsIndex.some(asset => asset.embed_ready);
        const hasTableReady = context.assetsIndex.some(asset => asset.table_ready);

        for (const entry of flattened) {
            const outlineNode = entry.node;
            const outlineId = outlineNode.chapter_number;
            const baseLabel = `${outlineNode.chapter_number} ${outlineNode.title}`;
            const baseMetadata = {
                outlineId,
                title: outlineNode.title,
                outlineNode,
                parentId: entry.parentId,
            };

            if (outlineNode.fixed_content) {
                const materializeId = `materialize:${outlineId}`;
                const assembleId = `assemble:${outlineId}`;

                this.addNode(nodes, index, {
                    id: materializeId,
                    type: "materialize_fixed",
                    label: `渲染固定内容 ${baseLabel}`,
                    outlineId,
                    dependencies: [],
                    metadata: {
                        ...baseMetadata,
                        fixed: true,
                        fixedContent: outlineNode.fixed_content,
                    },
                });

                this.addNode(nodes, index, {
                    id: assembleId,
                    type: "assemble",
                    label: `装配章节 ${baseLabel}`,
                    outlineId,
                    dependencies: [materializeId],
                    metadata: {
                        ...baseMetadata,
                        from: "fixed",
                    },
                });

                edges.push({ from: materializeId, to: assembleId, reason: "固定章节装配" });
                continue;
            }

            const prepareId = `prepare:${outlineId}`;
            const retrieveId = `retrieve:${outlineId}`;
            const writeId = `write:${outlineId}`;
            const verifyId = `verify:${outlineId}`;
            const assembleId = `assemble:${outlineId}`;

            this.addNode(nodes, index, {
                id: prepareId,
                type: "prepare",
                label: `准备提示词 ${baseLabel}`,
                outlineId,
                dependencies: [],
                metadata: {
                    ...baseMetadata,
                    contextKeys: Object.keys(context.projectContext || {}),
                    projectContext: context.projectContext,
                    assetsAvailability: {
                        embedReady: hasEmbedReady,
                        tableReady: hasTableReady,
                    },
                },
            });

            const shouldCreateRetrieve = hasEmbedReady || hasTableReady;
            let lastDependency = prepareId;

            if (shouldCreateRetrieve) {
                const requirements: string[] = [];
                if (hasEmbedReady) requirements.push("embed_ready");
                if (hasTableReady) requirements.push("table_ready");

                this.addNode(nodes, index, {
                    id: retrieveId,
                    type: "retrieve",
                    label: `检索资料 ${baseLabel}`,
                    outlineId,
                    dependencies: [prepareId],
                    metadata: {
                        ...baseMetadata,
                        requirements,
                        assetsReady: {
                            embed: hasEmbedReady,
                            table: hasTableReady,
                        },
                    },
                });

                edges.push({ from: prepareId, to: retrieveId, reason: "检索前置" });
                lastDependency = retrieveId;
            }

            this.addNode(nodes, index, {
                id: writeId,
                type: "write",
                label: `写作章节 ${baseLabel}`,
                outlineId,
                dependencies: [lastDependency],
                metadata: {
                    ...baseMetadata,
                    promptSource: prepareId,
                    retrievalSource: shouldCreateRetrieve ? retrieveId : undefined,
                    metricsRef: context.metrics?.[outlineId],
                    writingJournalRef: context.writingJournal?.[outlineId],
                },
            });

            edges.push({ from: lastDependency, to: writeId, reason: "写作依赖" });

            this.addNode(nodes, index, {
                id: verifyId,
                type: "verify",
                label: `校验章节 ${baseLabel}`,
                outlineId,
                dependencies: [writeId],
                metadata: {
                    ...baseMetadata,
                    journalRef: context.writingJournal?.[outlineId],
                    metricsRef: context.metrics?.[outlineId],
                    evidenceRef: context.evidenceMap?.[outlineId],
                },
            });

            edges.push({ from: writeId, to: verifyId, reason: "校验前置" });

            this.addNode(nodes, index, {
                id: assembleId,
                type: "assemble",
                label: `装配章节 ${baseLabel}`,
                outlineId,
                dependencies: [verifyId],
                metadata: {
                    ...baseMetadata,
                    evidenceRef: context.evidenceMap?.[outlineId],
                },
            });

            edges.push({ from: verifyId, to: assembleId, reason: "装配前置" });
        }

        const assembleNodes = nodes.filter(node => node.type === "assemble");
        if (assembleNodes.length > 0) {
            const finalAssembleId = "assemble:document";
            this.addNode(nodes, index, {
                id: finalAssembleId,
                type: "assemble",
                label: "汇总装配整份报告",
                dependencies: assembleNodes.map(node => node.id),
                metadata: {
                    stage: "final",
                    title: "整份报告",
                    outlineId: "document",
                },
            });

            for (const node of assembleNodes) {
                edges.push({ from: node.id, to: finalAssembleId, reason: "章节合并" });
            }
        }

        const summary = this.buildSummary(nodes);

        return {
            nodes,
            edges,
            summary,
        };
    }

    private buildSummary(nodes: TaskNode[]): TaskDag["summary"] {
        const result: TaskDag["summary"] = {
            total: nodes.length,
            byType: {
                materialize_fixed: 0,
                prepare: 0,
                retrieve: 0,
                write: 0,
                verify: 0,
                assemble: 0,
            },
        };

        for (const node of nodes) {
            result.byType[node.type] += 1;
        }

        result.total = nodes.length;
        return result;
    }

    private addNode(nodes: TaskNode[], index: Map<string, TaskNode>, node: TaskNode): void {
        if (index.has(node.id)) return;
        nodes.push(node);
        index.set(node.id, node);
    }

    private flattenOutline(outline: OutlineNode[]): FlattenedOutlineNode[] {
        const result: FlattenedOutlineNode[] = [];

        const walk = (nodes: OutlineNode[], parent?: string) => {
            for (const node of nodes) {
                result.push({ node, parentId: parent });
                if (node.outline_structure) {
                    walk(node.outline_structure, node.chapter_number);
                }
            }
        };

        walk(outline);
        return result;
    }
}
