import { Worker } from "bullmq";
import { QueueNames } from "../queue/queue-names.ts";
import { createBullMQConnection } from "../services/redis-service.ts";
import { SpecializedAgents } from "../agents/specialized-agents.ts";
import { RetrievalService } from "../services/retrieval-service.ts";
import { RenderService } from "../services/render-service.ts";
import { ProjectMetricService } from "../services/project-metric-service.ts";
import {
    PlannerJobData,
    PlannerJobResult,
    RetrieverJobData,
    RetrieverJobResult,
    WriterJobData,
    WriterJobResult,
    VerifierJobData,
    VerifierJobResult,
    AssemblerJobData,
    AssemblerJobResult,
    MaterializerJobData,
    MaterializerJobResult,
    AutoFixerJobData,
    AutoFixerJobResult,
} from "./types.ts";

function createWorker<Data, Result>(
    queueName: string,
    handler: (data: Data) => Promise<Result>,
    concurrency = 2
): Worker<Data, Result> {
    return new Worker(queueName, async (job) => handler(job.data), {
        connection: createBullMQConnection(),
        concurrency,
    });
}

let sharedAgents: SpecializedAgents | null = null;
let agentsInitialized = false;
async function getAgents(): Promise<SpecializedAgents> {
    if (!sharedAgents) {
        sharedAgents = new SpecializedAgents();
    }
    if (!agentsInitialized) {
        await sharedAgents.initialize();
        agentsInitialized = true;
    }
    return sharedAgents;
}

let sharedRetrieval: RetrievalService | null = null;
let retrievalInitialized = false;
async function getRetrievalService(): Promise<RetrievalService> {
    if (!sharedRetrieval) {
        sharedRetrieval = new RetrievalService();
    }
    if (!retrievalInitialized) {
        await sharedRetrieval.initialize();
        retrievalInitialized = true;
    }
    return sharedRetrieval;
}

const renderService = new RenderService();
const metricService = new ProjectMetricService();

export function createPlannerWorker(): Worker<PlannerJobData, PlannerJobResult> {
    return createWorker(QueueNames.planner, async (data) => {
        const agents = await getAgents();
        const result = await agents.generateInstruction(
            {
                chapter_number: data.outlineNode.chapter_number,
                title: data.outlineNode.title,
                govern_standard: data.outlineNode.govern_standard,
            },
            data.projectContext
        );

        const plannerResult = {
            prompts: {
                user_prompt_text: result.user_prompt_text,
                user_prompt_table: result.user_prompt_table ?? null,
                user_prompt_image: result.user_prompt_image ?? null,
            },
            queries: result.queries,
        };

        return plannerResult as PlannerJobResult;
    });
}

export function createRetrieverWorker(): Worker<RetrieverJobData, RetrieverJobResult> {
    return createWorker(QueueNames.retriever, async (data) => {
        const retrieval = await getRetrievalService();
        const results: RetrieverJobResult["contextPack"] = [];

        for (const query of data.queries) {
            if (!query) continue;
            const vector = await retrieval.retrieveFromVector(query, data.limit ?? 5);
            results.push({
                source: "vector",
                type: "vector",
                payload: vector,
            });
        }

        return {
            contextPack: results,
        };
    });
}

export function createWriterWorker(): Worker<WriterJobData, WriterJobResult> {
    return createWorker(QueueNames.writer, async (data) => {
        const agents = await getAgents();
        const draft = await agents.generateSectionContent(
            data.title,
            data.prompt,
            data.contextPack?.map((item) => item.payload?.data || item.payload) ?? []
        );

        const references = collectReferences(data.contextPack);

        if (draft && typeof draft === "object") {
            (draft as any).references = references;
        }

        const draftText = extractDraftText(draft);
        await metricService.upsertMetric({
            projectId: data.projectId,
            metricName: "draft_word_count",
            metricValue: {
                nodeId: data.nodeId,
                wordCount: countWords(draftText),
            },
            scope: "section",
            targetId: data.nodeId,
        });

        return {
            draft,
            references,
        } as WriterJobResult;
    });
}

export function createVerifierWorker(): Worker<VerifierJobData, VerifierJobResult> {
    return createWorker(QueueNames.verifier, async (data) => {
        const draftText = extractDraftText(data.draft);
        const wordCount = countWords(draftText);
        const violations: any[] = [];
        const patches: any[] = [];

        const requiredWordCount = data.metrics?.minWordCount ?? 80;

        if (wordCount < 80) {
            violations.push({
                code: "WORD_COUNT_LOW",
                message: `正文字数过少 (当前 ${wordCount} 字)`,
                expected: `>= ${requiredWordCount}`,
            });
            patches.push({
                type: "append",
                path: "/text",
                value: "（请补充更详细的分析与数据支撑。）",
            });
        }

        const hasReferences = Array.isArray((data.draft as any)?.references) && (data.draft as any).references.length > 0;
        if (!hasReferences) {
            violations.push({
                code: "MISSING_REFERENCES",
                message: "缺少引用信息",
            });
        }

        const requiredTerms: string[] = Array.isArray(data.metrics?.requiredTerms)
            ? data.metrics.requiredTerms
            : [];
        const missingTerms = requiredTerms.filter((term) => !draftText.includes(term));
        if (missingTerms.length > 0) {
            violations.push({
                code: "MISSING_TERMS",
                message: `缺少关键术语: ${missingTerms.join(", ")}`,
                severity: "hard",
            });
        }

        if (data.metrics?.numericExpectations) {
            for (const expectation of data.metrics.numericExpectations as Array<{ name: string; min?: number; max?: number }>) {
                const regex = new RegExp(`${expectation.name}\\s*[:：]?\\s*(\\d+(?:\\.\\d+)?)`, "i");
                const match = draftText.match(regex);
                if (!match) {
                    violations.push({
                        code: "MISSING_NUMERIC_METRIC",
                        message: `未提及指标 ${expectation.name}`,
                        severity: "hard",
                    });
                    continue;
                }

                const value = Number(match[1]);
                if (!Number.isNaN(value)) {
                    if (expectation.min !== undefined && value < expectation.min) {
                        violations.push({
                            code: "METRIC_BELOW_MIN",
                            message: `${expectation.name} 数值 (${value}) 低于阈值 ${expectation.min}`,
                            severity: "hard",
                        });
                    }
                    if (expectation.max !== undefined && value > expectation.max) {
                        violations.push({
                            code: "METRIC_ABOVE_MAX",
                            message: `${expectation.name} 数值 (${value}) 高于阈值 ${expectation.max}`,
                            severity: "hard",
                        });
                    }
                }
            }
        }

        if (violations.length === 0) {
            return {
                status: "accept",
                draft: data.draft,
            };
        }

        if (violations.some((v) => v.severity === "hard")) {
            return {
                status: "hard_fail",
                draft: data.draft,
                violations,
            };
        }

        if (violations.some((v) => v.code === "WORD_COUNT_LOW" || v.code === "MISSING_REFERENCES")) {
            return {
                status: "soft_fail",
                draft: data.draft,
                violations,
                patches,
            };
        }

        return {
            status: "accept",
            draft: data.draft,
        };
    });
}

export function createAssemblerWorker(): Worker<AssemblerJobData, AssemblerJobResult> {
    return createWorker(QueueNames.assembler, async (data) => {
        const content: any = {
            fixedBlocks: data.fixedBlocks ?? [],
            draft: data.draft ?? null,
        };

        const assembled = {
            sectionId: data.nodeId,
            content,
            artifacts: {
                markdown: renderService.renderToMarkdown({
                    sections: [
                        {
                            id: data.nodeId,
                            title: "",
                            content: content,
                        },
                    ],
                    metadata: {
                        title: data.nodeId,
                        projectId: data.projectId,
                        templateKey: "",
                        generatedAt: new Date().toISOString(),
                    },
                }),
            },
        };

        return assembled as AssemblerJobResult;
    });
}

export function createMaterializerWorker(): Worker<MaterializerJobData, MaterializerJobResult> {
    return createWorker(QueueNames.materializer, async (data) => {
        const renderedText = renderFixedContent(data.fixedContent, data.bindings ?? {});

        return {
            nodeId: data.nodeId,
            renderedBlock: {
                text: renderedText,
                bindings: data.bindings ?? {},
            },
        } as MaterializerJobResult;
    });
}

export function createAutoFixerWorker(): Worker<AutoFixerJobData, AutoFixerJobResult> {
    return createWorker(QueueNames.autofixer, async (data) => {
        let draft = data.draft;

        if (Array.isArray(data.patches)) {
            for (const patch of data.patches) {
                draft = applyPatch(draft, patch);
            }
        }

        return {
            draft,
            appliedPatches: data.patches?.length ?? 0,
        };
    });
}

function collectReferences(
    contextPack: RetrieverJobResult["contextPack"] | undefined
): any[] {
    if (!contextPack) return [];
    const refs: any[] = [];
    for (const item of contextPack) {
        const citations = item.payload?.citations;
        if (Array.isArray(citations)) {
            refs.push(...citations);
        }
        const metadataRefs = item.payload?.metadata?.citations;
        if (Array.isArray(metadataRefs)) {
            refs.push(...metadataRefs);
        }
    }
    return refs;
}

function extractDraftText(draft: any): string {
    if (!draft) return "";
    if (typeof draft === "string") return draft;
    if (draft.text) return draft.text;
    if (draft.content) return String(draft.content);
    return JSON.stringify(draft);
}

function countWords(text: string): number {
    return text ? text.split(/\s+/).filter(Boolean).length : 0;
}

function applyPatch(draft: any, patch: any): any {
    if (!patch || typeof patch.path !== "string") {
        return draft;
    }

    const pathSegments = patch.path.replace(/^\//, "").split("/");
    let target = draft;

    for (let i = 0; i < pathSegments.length - 1; i++) {
        const key = pathSegments[i];
        if (typeof target[key] !== "object" || target[key] === null) {
            target[key] = {};
        }
        target = target[key];
    }

    const lastKey = pathSegments[pathSegments.length - 1];
    const currentValue = target[lastKey];

    switch (patch.type) {
        case "append":
            if (Array.isArray(currentValue)) {
                currentValue.push(patch.value);
            } else if (typeof currentValue === "string") {
                target[lastKey] = `${currentValue}${patch.value}`;
            } else if (currentValue === undefined) {
                target[lastKey] = [patch.value];
            } else {
                target[lastKey] = patch.value;
            }
            break;
        case "replace":
        case "set":
        default:
            target[lastKey] = patch.value;
            break;
    }

    return draft;
}

function renderFixedContent(template: string, bindings: Record<string, any>): string {
    if (!template) return "";
    return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_match, key) => {
        const value = bindings[key.trim()];
        if (value === undefined || value === null) {
            return "";
        }
        if (typeof value === "number") {
            return Number.isFinite(value) ? value.toString() : "";
        }
        if (typeof value === "object") {
            return JSON.stringify(value);
        }
        return String(value);
    });
}
