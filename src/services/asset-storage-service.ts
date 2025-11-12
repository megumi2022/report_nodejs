import { promises as fs } from "fs";
import * as path from "path";
import { getSupabaseClient } from "./supabase-client.ts";
import { AssetIndexRecord } from "./asset-registry-service.ts";

export class AssetStorageService {
    constructor(private readonly tempDir = path.join(process.cwd(), ".tmp", "assets")) {}

    private async ensureTempDir(): Promise<void> {
        await fs.mkdir(this.tempDir, { recursive: true });
    }

    async getLocalPath(asset: AssetIndexRecord): Promise<string> {
        if (!asset.storage_bucket) {
            const absolute = path.isAbsolute(asset.storage_path)
                ? asset.storage_path
                : path.join(process.cwd(), asset.storage_path);
            return absolute;
        }

        await this.ensureTempDir();
        const ext = path.extname(asset.filename) || path.extname(asset.storage_path);
        const localPath = path.join(this.tempDir, `${asset.id}${ext}`);

        try {
            await fs.access(localPath);
            return localPath;
        } catch {
            // continue download
        }

        const supabase = getSupabaseClient();
        const { data, error } = await supabase.storage
            .from(asset.storage_bucket)
            .download(asset.storage_path);

        if (error || !data) {
            throw new Error(`下载 Supabase 资产失败: ${error?.message ?? "unknown"}`);
        }

        const buffer = Buffer.from(await data.arrayBuffer());
        await fs.writeFile(localPath, buffer);
        return localPath;
    }

    async readBuffer(asset: AssetIndexRecord): Promise<Buffer> {
        const localPath = await this.getLocalPath(asset);
        return await fs.readFile(localPath);
    }
}
