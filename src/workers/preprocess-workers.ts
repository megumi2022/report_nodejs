import { Worker } from "bullmq";
import { QueueNames } from "../queue/queue-names.ts";
import { createBullMQConnection } from "../services/redis-service.ts";
import { AssetRegistryService } from "../services/asset-registry-service.ts";
import { PreprocessJobPayload } from "../services/preprocess-types.ts";
import { AssetStorageService } from "../services/asset-storage-service.ts";
import { TextPreprocessService } from "../services/text-preprocess-service.ts";
import { ExcelPreprocessService } from "../services/excel-preprocess-service.ts";
import { ImagePreprocessService } from "../services/image-preprocess-service.ts";
import { JsonPreprocessService } from "../services/json-preprocess-service.ts";
import { PreprocessJobResult } from "./types.ts";

function createWorker(
    queueName: string,
    handler: (job: { data: PreprocessJobPayload }) => Promise<PreprocessJobResult>,
    concurrency = 2
): Worker<PreprocessJobPayload, PreprocessJobResult> {
    return new Worker(queueName, async (job) => handler({ data: job.data }), {
        connection: createBullMQConnection(),
        concurrency,
    });
}

export function createPreprocessTextWorker(): Worker<PreprocessJobPayload, PreprocessJobResult> {
    const registry = new AssetRegistryService();
    const storage = new AssetStorageService();
    const textPreprocess = new TextPreprocessService();
    return createWorker(QueueNames.preprocessText, async ({ data }) => {
        try {
            const asset = await registry.getAsset(data.assetId);
            if (!asset) {
                throw new Error(`资产不存在: ${data.assetId}`);
            }

            const localPath = await storage.getLocalPath(asset);
            const chunkCount = await textPreprocess.process(asset, localPath);

            await registry.updateStatus({
                assetId: data.assetId,
                embedReady: true,
                status: "processing",
                metadata: {
                    ...asset.metadata,
                    preprocess: {
                        type: "text",
                        chunkCount,
                    },
                },
            });

            return {
                assetId: data.assetId,
                status: "completed",
                meta: {
                    type: "text",
                    chunkCount,
                },
            };
        } catch (error: any) {
            await registry.markError(data.assetId, error.message ?? String(error));
            throw error;
        }
    });
}

export function createPreprocessImageWorker(): Worker<PreprocessJobPayload, PreprocessJobResult> {
    const registry = new AssetRegistryService();
    const storage = new AssetStorageService();
    const imagePreprocess = new ImagePreprocessService();
    return createWorker(QueueNames.preprocessImage, async ({ data }) => {
        try {
            const asset = await registry.getAsset(data.assetId);
            if (!asset) {
                throw new Error(`资产不存在: ${data.assetId}`);
            }

            const buffer = await storage.readBuffer(asset);
            const chunkCount = await imagePreprocess.process(asset, buffer);

            await registry.updateStatus({
                assetId: data.assetId,
                embedReady: true,
                status: "processing",
                metadata: {
                    ...asset.metadata,
                    preprocess: {
                        type: "image",
                        chunkCount,
                    },
                },
            });

            return {
                assetId: data.assetId,
                status: "completed",
                meta: {
                    type: "image",
                    chunkCount,
                },
            };
        } catch (error: any) {
            await registry.markError(data.assetId, error.message ?? String(error));
            throw error;
        }
    });
}

export function createPreprocessExcelWorker(): Worker<PreprocessJobPayload, PreprocessJobResult> {
    const registry = new AssetRegistryService();
    const storage = new AssetStorageService();
    const excelPreprocess = new ExcelPreprocessService();
    return createWorker(QueueNames.preprocessExcel, async ({ data }) => {
        try {
            const asset = await registry.getAsset(data.assetId);
            if (!asset) {
                throw new Error(`资产不存在: ${data.assetId}`);
            }

            const buffer = await storage.readBuffer(asset);
            const tableCount = await excelPreprocess.process(asset, buffer);

            await registry.updateStatus({
                assetId: data.assetId,
                tableReady: true,
                status: "processing",
                metadata: {
                    ...asset.metadata,
                    preprocess: {
                        type: "excel",
                        tableCount,
                    },
                },
            });

            return {
                assetId: data.assetId,
                status: "completed",
                meta: {
                    type: "excel",
                    tableCount,
                },
            };
        } catch (error: any) {
            await registry.markError(data.assetId, error.message ?? String(error));
            throw error;
        }
    });
}

export function createPreprocessJsonWorker(): Worker<PreprocessJobPayload, PreprocessJobResult> {
    const registry = new AssetRegistryService();
    const storage = new AssetStorageService();
    const jsonPreprocess = new JsonPreprocessService();
    return createWorker(QueueNames.preprocessJson, async ({ data }) => {
        try {
            const asset = await registry.getAsset(data.assetId);
            if (!asset) {
                throw new Error(`资产不存在: ${data.assetId}`);
            }

            const buffer = await storage.readBuffer(asset);
            await jsonPreprocess.process(asset, buffer);

            await registry.updateStatus({
                assetId: data.assetId,
                status: "ready",
                metadata: {
                    ...asset.metadata,
                    preprocess: {
                        type: "json",
                    },
                },
            });

            return {
                assetId: data.assetId,
                status: "completed",
                meta: {
                    type: "json",
                },
            };
        } catch (error: any) {
            await registry.markError(data.assetId, error.message ?? String(error));
            throw error;
        }
    });
}
