import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase-client.ts";

export interface AssetChunkInput {
    assetId: string;
    chunkIndex: number;
    content: string;
    tokenCount?: number;
    embedding?: number[] | null;
    metadata?: Record<string, any>;
}

export class AssetChunkService {
    constructor(private readonly supabase: SupabaseClient = getSupabaseClient()) {}

    async saveChunks(chunks: AssetChunkInput[]): Promise<void> {
        if (chunks.length === 0) return;

        const payload = chunks.map((chunk) => ({
            asset_id: chunk.assetId,
            chunk_index: chunk.chunkIndex,
            content: chunk.content,
            token_count: chunk.tokenCount ?? null,
            embedding: chunk.embedding ?? null,
            metadata: chunk.metadata ?? {},
        }));

        const { error } = await this.supabase.from("asset_chunks").insert(payload);
        if (error) {
            throw new Error(`保存资产分块失败: ${error.message}`);
        }
    }
}
