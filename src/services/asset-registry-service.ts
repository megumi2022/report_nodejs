import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase-client.ts";

export type AssetType = "pdf" | "word" | "image" | "excel" | "json" | "other";

export interface RegisterAssetInput {
    projectId: string;
    templateKey?: string;
    filename: string;
    storagePath: string;
    storageBucket?: string;
    assetType: AssetType;
    mimeType?: string;
    sizeBytes?: number;
    checksum?: string;
    metadata?: Record<string, any>;
}

export interface AssetIndexRecord {
    id: string;
    project_id: string;
    template_key?: string;
    filename: string;
    storage_bucket?: string | null;
    storage_path: string;
    asset_type: AssetType;
    mime_type?: string | null;
    size_bytes?: number | null;
    checksum?: string | null;
    embed_ready: boolean;
    table_ready: boolean;
    status: "pending" | "processing" | "ready" | "error";
    error_message?: string | null;
    metadata: Record<string, any>;
    created_at: string;
    updated_at: string;
}

export interface UpdateAssetStatusInput {
    assetId: string;
    status?: "pending" | "processing" | "ready" | "error";
    embedReady?: boolean;
    tableReady?: boolean;
    errorMessage?: string | null;
    metadata?: Record<string, any>;
}

export class AssetRegistryService {
    private supabase: SupabaseClient;

    constructor(client: SupabaseClient = getSupabaseClient()) {
        this.supabase = client;
    }

    async registerAsset(input: RegisterAssetInput): Promise<AssetIndexRecord> {
        const payload = {
            project_id: input.projectId,
            template_key: input.templateKey ?? null,
            filename: input.filename,
            storage_bucket: input.storageBucket ?? null,
            storage_path: input.storagePath,
            asset_type: input.assetType,
            mime_type: input.mimeType ?? null,
            size_bytes: input.sizeBytes ?? null,
            checksum: input.checksum ?? null,
            metadata: input.metadata ?? {},
        };

        const { data, error } = await this.supabase
            .from("assets_index")
            .insert(payload)
            .select("*")
            .single();

        if (error) {
            throw new Error(`登记资产失败: ${error.message}`);
        }

        return data as AssetIndexRecord;
    }

    async registerAssets(inputs: RegisterAssetInput[]): Promise<AssetIndexRecord[]> {
        if (inputs.length === 0) return [];

        const payloads = inputs.map(input => ({
            project_id: input.projectId,
            template_key: input.templateKey ?? null,
            filename: input.filename,
            storage_bucket: input.storageBucket ?? null,
            storage_path: input.storagePath,
            asset_type: input.assetType,
            mime_type: input.mimeType ?? null,
            size_bytes: input.sizeBytes ?? null,
            checksum: input.checksum ?? null,
            metadata: input.metadata ?? {},
        }));

        const { data, error } = await this.supabase
            .from("assets_index")
            .insert(payloads)
            .select("*");

        if (error) {
            throw new Error(`批量登记资产失败: ${error.message}`);
        }

        return (data ?? []) as AssetIndexRecord[];
    }

    async getAsset(assetId: string): Promise<AssetIndexRecord | null> {
        const { data, error } = await this.supabase
            .from("assets_index")
            .select("*")
            .eq("id", assetId)
            .maybeSingle();

        if (error) {
            throw new Error(`查询资产失败: ${error.message}`);
        }

        return data as AssetIndexRecord | null;
    }

    async listAssetsByProject(projectId: string): Promise<AssetIndexRecord[]> {
        const { data, error } = await this.supabase
            .from("assets_index")
            .select("*")
            .eq("project_id", projectId)
            .order("created_at", { ascending: true });

        if (error) {
            throw new Error(`获取项目资产列表失败: ${error.message}`);
        }

        return (data ?? []) as AssetIndexRecord[];
    }

    async updateStatus(input: UpdateAssetStatusInput): Promise<AssetIndexRecord> {
        const payload: Record<string, any> = {};
        if (input.status !== undefined) payload.status = input.status;
        if (input.embedReady !== undefined) payload.embed_ready = input.embedReady;
        if (input.tableReady !== undefined) payload.table_ready = input.tableReady;
        if (input.errorMessage !== undefined) payload.error_message = input.errorMessage;
        if (input.metadata !== undefined) payload.metadata = input.metadata;

        if (Object.keys(payload).length === 0) {
            const asset = await this.getAsset(input.assetId);
            if (!asset) throw new Error("资产不存在");
            return asset;
        }

        const { data, error } = await this.supabase
            .from("assets_index")
            .update(payload)
            .eq("id", input.assetId)
            .select("*")
            .single();

        if (error) {
            throw new Error(`更新资产状态失败: ${error.message}`);
        }

        return data as AssetIndexRecord;
    }

    async markEmbedReady(assetId: string, metadata?: Record<string, any>): Promise<AssetIndexRecord> {
        return this.updateStatus({
            assetId,
            embedReady: true,
            status: "processing",
            metadata,
        });
    }

    async markTableReady(assetId: string, metadata?: Record<string, any>): Promise<AssetIndexRecord> {
        return this.updateStatus({
            assetId,
            tableReady: true,
            status: "processing",
            metadata,
        });
    }

    async markCompleted(assetId: string): Promise<AssetIndexRecord> {
        return this.updateStatus({
            assetId,
            status: "ready",
        });
    }

    async markError(assetId: string, errorMessage: string): Promise<AssetIndexRecord> {
        return this.updateStatus({
            assetId,
            status: "error",
            errorMessage,
        });
    }
}
