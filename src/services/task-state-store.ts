import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase-client.ts";
import { TaskDag, TaskNode } from "../agents/planner-agent.ts";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "cancelled" | "blocked";

export interface TaskRecord {
    projectId: string;
    nodeId: string;
    type: TaskNode["type"];
    status: TaskStatus;
    dependencies: string[];
    dependents: string[];
    metadata: Record<string, any>;
    result?: Record<string, any>;
    error?: string | null;
    retries: number;
    updatedAt: string;
}

export class TaskStateStore {
    private readonly supabase: SupabaseClient;

    constructor(client: SupabaseClient = getSupabaseClient()) {
        this.supabase = client;
    }

    async persistDag(projectId: string, dag: TaskDag): Promise<void> {
        const payload = dag.nodes.map((node) => ({
            project_id: projectId,
            node_id: node.id,
            type: node.type,
            status: "pending",
            dependencies: node.dependencies,
            metadata: node.metadata ?? {},
        }));

        const { error } = await this.supabase.from("task_state").insert(payload);
        if (error) {
            throw new Error(`保存任务图失败: ${error.message}`);
        }

        for (const edge of dag.edges) {
            await this.addDependent(projectId, edge.from, edge.to);
        }
    }

    async addDependent(projectId: string, fromNode: string, toNode: string): Promise<void> {
        const { data, error } = await this.supabase
            .from("task_state")
            .select("dependents")
            .eq("project_id", projectId)
            .eq("node_id", fromNode)
            .maybeSingle();

        if (error) {
            throw new Error(`添加依赖失败: ${error.message}`);
        }

        const dependents: string[] = data?.dependents ?? [];
        if (!dependents.includes(toNode)) {
            dependents.push(toNode);
            const { error: updateError } = await this.supabase
                .from("task_state")
                .update({ dependents })
                .eq("project_id", projectId)
                .eq("node_id", fromNode);
            if (updateError) {
                throw new Error(`更新依赖失败: ${updateError.message}`);
            }
        }
    }

    async updateStatus(projectId: string, nodeId: string, status: TaskStatus, meta?: Partial<TaskRecord>): Promise<void> {
        const payload: Record<string, any> = {
            status,
            updated_at: new Date().toISOString(),
        };

        if (meta?.result !== undefined) {
            payload.result = meta.result;
        }
        if (meta?.error !== undefined) {
            payload.error = meta.error;
        }
        if (meta?.retries !== undefined) {
            payload.retries = meta.retries;
        }
        if (meta?.metadata !== undefined) {
            payload.metadata = meta.metadata;
        }

        const { error } = await this.supabase
            .from("task_state")
            .update(payload)
            .eq("project_id", projectId)
            .eq("node_id", nodeId);

        if (error) {
            throw new Error(`更新任务状态失败: ${error.message}`);
        }
    }

    async getTask(projectId: string, nodeId: string): Promise<TaskRecord | null> {
        const { data, error } = await this.supabase
            .from("task_state")
            .select("project_id, node_id, type, status, dependencies, dependents, metadata, result, error, retries, updated_at")
            .eq("project_id", projectId)
            .eq("node_id", nodeId)
            .maybeSingle();

        if (error) {
            throw new Error(`获取任务失败: ${error.message}`);
        }

        if (!data) {
            return null;
        }

        return {
            projectId: data.project_id,
            nodeId: data.node_id,
            type: data.type,
            status: data.status,
            dependencies: data.dependencies ?? [],
            dependents: data.dependents ?? [],
            metadata: data.metadata ?? {},
            result: data.result ?? undefined,
            error: data.error ?? null,
            retries: data.retries ?? 0,
            updatedAt: data.updated_at,
        };
    }

    async getTasks(projectId: string, nodeIds: string[]): Promise<TaskRecord[]> {
        if (nodeIds.length === 0) return [];

        const { data, error } = await this.supabase
            .from("task_state")
            .select("project_id, node_id, type, status, dependencies, dependents, metadata, result, error, retries, updated_at")
            .eq("project_id", projectId)
            .in("node_id", nodeIds);

        if (error) {
            throw new Error(`批量获取任务失败: ${error.message}`);
        }

        return (data ?? []).map((row: any) => ({
            projectId: row.project_id,
            nodeId: row.node_id,
            type: row.type,
            status: row.status,
            dependencies: row.dependencies ?? [],
            dependents: row.dependents ?? [],
            metadata: row.metadata ?? {},
            result: row.result ?? undefined,
            error: row.error ?? null,
            retries: row.retries ?? 0,
            updatedAt: row.updated_at,
        }));
    }

    async listReadyTasks(projectId: string): Promise<TaskRecord[]> {
        const { data, error } = await this.supabase
            .rpc("list_ready_tasks", { input_project_id: projectId });

        if (error) {
            throw new Error(`查询就绪任务失败: ${error.message}`);
        }

        return (data ?? []).map((row: any) => ({
            projectId: row.project_id,
            nodeId: row.node_id,
            type: row.type,
            status: row.status,
            dependencies: row.dependencies ?? [],
            dependents: row.dependents ?? [],
            metadata: row.metadata ?? {},
            retries: row.retries ?? 0,
            updatedAt: row.updated_at,
        }));
    }

    async markBlocked(projectId: string, nodeIds: string[]): Promise<void> {
        if (nodeIds.length === 0) return;
        const { error } = await this.supabase
            .from("task_state")
            .update({ status: "blocked" })
            .eq("project_id", projectId)
            .in("node_id", nodeIds);
        if (error) {
            throw new Error(`标记阻塞任务失败: ${error.message}`);
        }
    }

    async clearProject(projectId: string): Promise<void> {
        const { error } = await this.supabase.from("task_state").delete().eq("project_id", projectId);
        if (error) {
            throw new Error(`清理项目任务失败: ${error.message}`);
        }
    }

    async listTasks(projectId: string, options?: { statuses?: TaskStatus[] }): Promise<TaskRecord[]> {
        let query = this.supabase
            .from("task_state")
            .select(
                "project_id, node_id, type, status, dependencies, dependents, metadata, result, error, retries, updated_at"
            )
            .eq("project_id", projectId)
            .order("updated_at", { ascending: false });

        if (options?.statuses && options.statuses.length > 0) {
            query = query.in("status", options.statuses);
        }

        const { data, error } = await query;

        if (error) {
            throw new Error(`获取任务列表失败: ${error.message}`);
        }

        return (data ?? []).map((row: any) => ({
            projectId: row.project_id,
            nodeId: row.node_id,
            type: row.type,
            status: row.status,
            dependencies: row.dependencies ?? [],
            dependents: row.dependents ?? [],
            metadata: row.metadata ?? {},
            result: row.result ?? undefined,
            error: row.error ?? null,
            retries: row.retries ?? 0,
            updatedAt: row.updated_at,
        }));
    }
}
