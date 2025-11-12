import { AssetIndexRecord, AssetRegistryService, AssetType } from "./asset-registry-service.ts";
import {
    PreprocessJobPayload,
    PreprocessQueueAdapter,
    PreprocessTaskType,
} from "./preprocess-types.ts";
import { BullMQPreprocessQueueAdapter } from "../queue/preprocess-queue-adapter.ts";

class LoggingPreprocessQueue implements PreprocessQueueAdapter {
    async enqueue(taskType: PreprocessTaskType, payload: PreprocessJobPayload): Promise<void> {
        console.log(`[PreprocessQueue] Enqueue ${taskType} job`, {
            taskType,
            assetId: payload.assetId,
            projectId: payload.projectId,
            storagePath: payload.storagePath,
        });
    }
}

export interface OrchestratorOptions {
    queue?: PreprocessQueueAdapter;
}

export class PreprocessOrchestrator {
    private queue: PreprocessQueueAdapter;

    constructor(
        private readonly registry: AssetRegistryService,
        options: OrchestratorOptions = {}
    ) {
        this.queue = options.queue ?? new BullMQPreprocessQueueAdapter();
    }

    async handleNewAsset(asset: AssetIndexRecord): Promise<void> {
        const taskType = this.mapAssetTypeToTask(asset.asset_type);

        if (!taskType) {
            console.log(`资产 ${asset.id} 类型 ${asset.asset_type} 不需要预处理，标记为 ready`);
            await this.registry.markCompleted(asset.id);
            return;
        }

        await this.registry.updateStatus({ assetId: asset.id, status: "processing" });

        await this.queue.enqueue(taskType, {
            assetId: asset.id,
            projectId: asset.project_id,
            assetType: asset.asset_type,
            storagePath: asset.storage_path,
            storageBucket: asset.storage_bucket ?? undefined,
            filename: asset.filename,
            metadata: asset.metadata ?? {},
        });
    }

    async schedulePendingAssets(projectId: string): Promise<void> {
        const assets = await this.registry.listAssetsByProject(projectId);
        const pendingAssets = assets.filter(asset => asset.status === "pending");

        for (const asset of pendingAssets) {
            await this.handleNewAsset(asset);
        }
    }

    async markPreprocessResult(
        assetId: string,
        result: {
            embedReady?: boolean;
            tableReady?: boolean;
            status?: "processing" | "ready" | "error";
            errorMessage?: string | null;
            metadata?: Record<string, any>;
        }
    ): Promise<void> {
        await this.registry.updateStatus({
            assetId,
            embedReady: result.embedReady,
            tableReady: result.tableReady,
            status: result.status,
            errorMessage: result.errorMessage,
            metadata: result.metadata,
        });
    }

    private mapAssetTypeToTask(assetType: AssetType): PreprocessTaskType | null {
        switch (assetType) {
            case "pdf":
            case "word":
                return "text";
            case "image":
                return "image";
            case "excel":
                return "excel";
            case "json":
                return "json";
            default:
                return null;
        }
    }
}
