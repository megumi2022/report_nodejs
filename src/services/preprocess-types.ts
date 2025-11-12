import { AssetType } from "./asset-registry-service.ts";

export type PreprocessTaskType = "text" | "image" | "excel" | "json";

export interface PreprocessJobPayload {
    assetId: string;
    projectId: string;
    assetType: AssetType;
    storagePath: string;
    storageBucket?: string | null;
    filename: string;
    metadata: Record<string, any>;
}

export interface PreprocessQueueAdapter {
    enqueue(taskType: PreprocessTaskType, payload: PreprocessJobPayload): Promise<void>;
}
