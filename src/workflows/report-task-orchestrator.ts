import { AssetRegistryService } from "../services/asset-registry-service.ts";
import { TaskDispatcher } from "../queue/task-dispatcher.ts";
import { PlannerAgent, PlannerContext, TaskDag } from "../agents/planner-agent.ts";

export interface ScheduleOptions {
    projectContext: Record<string, any>;
    metrics?: any;
    writingJournal?: any;
    evidenceMap?: any;
}

export class ReportTaskOrchestrator {
    constructor(
        private readonly registry = new AssetRegistryService(),
        private readonly dispatcher = new TaskDispatcher(),
        private readonly planner = new PlannerAgent()
    ) {}

    async schedule(projectId: string, outline: PlannerContext["outline"], options: ScheduleOptions): Promise<TaskDag> {
        const assets = await this.registry.listAssetsByProject(projectId);

        const context: PlannerContext = {
            projectId,
            outline,
            assetsIndex: assets,
            projectContext: options.projectContext,
            metrics: options.metrics,
            writingJournal: options.writingJournal,
            evidenceMap: options.evidenceMap,
        };

        const dag = this.planner.buildDag(context);
        await this.dispatcher.schedule(projectId, dag);
        return dag;
    }

    async resume(projectId: string): Promise<void> {
        await this.dispatcher.enqueueReadyTasks(projectId);
    }
}
