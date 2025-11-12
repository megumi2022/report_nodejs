import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase-client.ts";

export interface ProjectMetricInput {
    projectId: string;
    metricName: string;
    metricValue: any;
    scope?: "project" | "asset" | "section";
    targetId?: string;
    metadata?: Record<string, any>;
}

export class ProjectMetricService {
    constructor(private readonly supabase: SupabaseClient = getSupabaseClient()) {}

    async upsertMetric(input: ProjectMetricInput): Promise<void> {
        const payload = {
            project_id: input.projectId,
            metric_name: input.metricName,
            metric_value: input.metricValue,
            scope: input.scope ?? "project",
            target_id: input.targetId ?? null,
            metadata: input.metadata ?? {},
        };

        const { error } = await this.supabase.from("project_metrics").insert(payload);
        if (error) {
            throw new Error(`记录指标失败: ${error.message}`);
        }
    }
}
