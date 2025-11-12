import { Queue } from "bullmq";
import { TaskDag, TaskNode } from "../agents/planner-agent.ts";
import { TaskStateStore, TaskRecord } from "../services/task-state-store.ts";
import { getQueue } from "./queue-factory.ts";
import { QueueNames } from "./queue-names.ts";

export interface EnqueueOptions {
    removeOnComplete?: number | boolean;
    removeOnFail?: number | boolean;
}

const defaultEnqueueOptions: EnqueueOptions = {
    removeOnComplete: 1000,
    removeOnFail: 5000,
};

export interface WorkerResultEvent {
    projectId: string;
    nodeId: string;
    type: TaskNode["type"] | "autofix";
    result?: any;
    error?: string;
}

export interface WorkerProgressEvent {
    projectId: string;
    nodeId: string;
    type: TaskNode["type"] | "autofix";
    status: "running" | "failed" | "retrying";
    error?: string;
}

export class TaskDispatcher {
    constructor(
        private readonly stateStore = new TaskStateStore(),
        private readonly options: { enqueue?: EnqueueOptions } = {}
    ) { }

    async schedule(projectId: string, dag: TaskDag, { reset = true }: { reset?: boolean } = {}): Promise<void> {
        if (reset) {
            await this.stateStore.clearProject(projectId);
        }

        await this.stateStore.persistDag(projectId, dag);
        await this.enqueueReadyTasks(projectId);
    }

    async enqueueReadyTasks(projectId: string): Promise<void> {
        const readyTasks = await this.stateStore.listReadyTasks(projectId);
        for (const task of readyTasks) {
            await this.enqueueTask(projectId, task);
        }
    }

    async handleWorkerProgress(event: WorkerProgressEvent): Promise<void> {
        if (event.type === "autofix") {
            if (event.status === "failed") {
                await this.handleAutofixFailure({
                    projectId: event.projectId,
                    nodeId: event.nodeId,
                    type: "autofix",
                    error: event.error,
                });
            }
            return;
        }

        if (event.status === "running") {
            await this.stateStore.updateStatus(event.projectId, event.nodeId, "running");
        } else if (event.status === "failed") {
            await this.stateStore.updateStatus(event.projectId, event.nodeId, "failed", {
                error: event.error,
            });
            await this.blockDependentsOnFailure(event.projectId, event.nodeId);
        }
    }

    async handleWorkerResult(event: WorkerResultEvent): Promise<void> {
        if (event.type === "autofix") {
            if (event.error) {
                await this.handleAutofixFailure(event);
            } else {
                await this.handleAutofixSuccess(event);
            }
            return;
        }

        if (event.error) {
            await this.stateStore.updateStatus(event.projectId, event.nodeId, "failed", {
                error: event.error,
            });
            await this.blockDependentsOnFailure(event.projectId, event.nodeId);
            return;
        }

        if (event.type === "verify" && event.result?.status) {
            await this.handleVerifyResult(event);
            return;
        }

        await this.stateStore.updateStatus(event.projectId, event.nodeId, "completed", {
            result: event.result,
        });

        await this.enqueueReadyTasks(event.projectId);
    }

    private async blockDependentsOnFailure(projectId: string, nodeId: string): Promise<void> {
        const record = await this.stateStore.getTask(projectId, nodeId);
        if (!record || record.dependents.length === 0) return;
        await this.stateStore.markBlocked(projectId, record.dependents);
    }

    private async enqueueTask(projectId: string, task: TaskRecord): Promise<void> {
        const queue = this.resolveQueue(task.type);
        const payload = await this.buildJobPayload(projectId, task);
        const options = { ...defaultEnqueueOptions, ...(this.options.enqueue ?? {}) };

        await queue.add(`${projectId}:${task.nodeId}`, payload, options);
        await this.stateStore.updateStatus(projectId, task.nodeId, "running");
    }

    private async handleVerifyResult(event: WorkerResultEvent): Promise<void> {
        const verifyResult = event.result;
        if (!verifyResult) {
            await this.stateStore.updateStatus(event.projectId, event.nodeId, "completed");
            await this.enqueueReadyTasks(event.projectId);
            return;
        }

        if (verifyResult.status === "accept") {
            await this.stateStore.updateStatus(event.projectId, event.nodeId, "completed", {
                result: verifyResult.draft,
            });
            await this.enqueueReadyTasks(event.projectId);
            return;
        }

        if (verifyResult.status === "hard_fail") {
            await this.stateStore.updateStatus(event.projectId, event.nodeId, "failed", {
                error: "Verifier hard fail",
                result: verifyResult.draft,
            });
            await this.blockDependentsOnFailure(event.projectId, event.nodeId);
            return;
        }

        if (verifyResult.status === "soft_fail") {
            const task = await this.stateStore.getTask(event.projectId, event.nodeId);
            if (!task) return;

            const metadata = {
                ...task.metadata,
                draft: verifyResult.draft,
                pendingPatches: verifyResult.patches,
                violations: verifyResult.violations,
            };

            await this.stateStore.updateStatus(event.projectId, event.nodeId, "blocked", {
                metadata,
                result: verifyResult.draft,
            });

            const queue = getQueue("autofixer");
            await queue.add(
                `${event.projectId}:${event.nodeId}:autofix`,
                {
                    projectId: event.projectId,
                    nodeId: event.nodeId,
                    draft: verifyResult.draft,
                    patches: verifyResult.patches ?? [],
                },
                defaultEnqueueOptions
            );
        }
    }

    private async handleAutofixSuccess(event: WorkerResultEvent): Promise<void> {
        const task = await this.stateStore.getTask(event.projectId, event.nodeId);
        if (!task) return;

        const metadata = {
            ...task.metadata,
            draft: event.result?.draft ?? task.metadata?.draft,
        };
        delete (metadata as any).pendingPatches;
        delete (metadata as any).violations;

        await this.stateStore.updateStatus(event.projectId, event.nodeId, "pending", {
            metadata,
            result: event.result?.draft,
        });

        const refreshed = await this.stateStore.getTask(event.projectId, event.nodeId);
        if (refreshed) {
            await this.enqueueTask(event.projectId, refreshed);
        }
    }

    private async handleAutofixFailure(event: WorkerResultEvent): Promise<void> {
        await this.stateStore.updateStatus(event.projectId, event.nodeId, "failed", {
            error: event.error ?? "AutoFix failed",
        });
        await this.blockDependentsOnFailure(event.projectId, event.nodeId);
    }

    private resolveQueue(type: TaskNode["type"]): Queue {
        switch (type) {
            case "materialize_fixed":
                return getQueue("materializer");
            case "prepare":
                return getQueue("planner");
            case "retrieve":
                return getQueue("retriever");
            case "write":
                return getQueue("writer");
            case "verify":
                return getQueue("verifier");
            case "assemble":
                return getQueue("assembler");
            default:
                throw new Error(`未知的任务类型: ${type}`);
        }
    }

    private async buildJobPayload(projectId: string, task: TaskRecord): Promise<any> {
        const dependencies = await this.stateStore.getTasks(projectId, task.dependencies);

        const findResult = (nodeId: string) => dependencies.find((dep) => dep.nodeId === nodeId)?.result;

        switch (task.type) {
            case "materialize_fixed":
                return {
                    projectId,
                    nodeId: task.nodeId,
                    fixedContent: task.metadata.fixedContent ?? task.metadata.fixed_content,
                    bindings: task.metadata.bindings,
                };
            case "prepare":
                return {
                    projectId,
                    nodeId: task.nodeId,
                    outlineNode: task.metadata.outlineNode ?? task.metadata.outline_node,
                    projectContext: task.metadata.projectContext ?? task.metadata.project_context ?? {},
                    assetsAvailability: task.metadata.assetsAvailability ?? {
                        embedReady: task.metadata.embedReady ?? false,
                        tableReady: task.metadata.tableReady ?? false,
                    },
                };
            case "retrieve": {
                const prepareResult = findResult(task.dependencies[0] ?? "");
                const queries = prepareResult?.queries ?? task.metadata.queries ?? [];
                return {
                    projectId,
                    nodeId: task.nodeId,
                    queries,
                    limit: task.metadata.limit ?? 5,
                };
            }
            case "write": {
                const prepareResult = findResult(task.dependencies.find((id) => id.startsWith("prepare")) ?? "");
                const retrieveResult = findResult(task.dependencies.find((id) => id.startsWith("retrieve")) ?? "");
                return {
                    projectId,
                    nodeId: task.nodeId,
                    title: task.metadata.title ?? task.metadata.outlineTitle ?? task.metadata.label ?? task.nodeId,
                    prompt: prepareResult?.prompts?.user_prompt_text ?? task.metadata.prompt ?? "",
                    contextPack: retrieveResult?.contextPack ?? [],
                    metrics: task.metadata.metrics,
                    writingJournal: task.metadata.writingJournal,
                };
            }
            case "verify": {
                const writeResult = findResult(task.dependencies.find((id) => id.startsWith("write")) ?? "");
                return {
                    projectId,
                    nodeId: task.nodeId,
                    draft: writeResult?.draft ?? task.metadata.draft,
                    metrics: task.metadata.metrics,
                    evidenceMap: task.metadata.evidenceMap,
                };
            }
            case "assemble": {
                const materialized = findResult(task.dependencies.find((id) => id.startsWith("materialize")) ?? "");
                const verified = findResult(task.dependencies.find((id) => id.startsWith("verify")) ?? "");
                return {
                    projectId,
                    nodeId: task.nodeId,
                    fixedBlocks: materialized ? [materialized.renderedBlock] : task.metadata.fixedBlocks,
                    draft: verified?.draft ?? task.metadata.draft,
                    children: task.dependents,
                };
            }
            default:
                return {
                    projectId,
                    nodeId: task.nodeId,
                    metadata: task.metadata,
                };
        }
    }
}
