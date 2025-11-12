import { AssetIndexRecord, AssetRegistryService } from "./asset-registry-service.ts";
import { ProjectMetricService } from "./project-metric-service.ts";

export class JsonPreprocessService {
    constructor(
        private readonly metricService = new ProjectMetricService(),
        private readonly registry = new AssetRegistryService()
    ) {}

    async process(asset: AssetIndexRecord, buffer: Buffer): Promise<void> {
        let parsed: any;
        try {
            parsed = JSON.parse(buffer.toString("utf-8"));
        } catch (error: any) {
            throw new Error(`JSON 解析失败: ${error.message}`);
        }

        await this.metricService.upsertMetric({
            projectId: asset.project_id,
            metricName: "project_context",
            metricValue: parsed,
            scope: "asset",
            targetId: asset.id,
        });

        const metadata = {
            ...asset.metadata,
            project_context_snapshot: parsed,
        };
        await this.registry.updateStatus({ assetId: asset.id, metadata });
    }
}
