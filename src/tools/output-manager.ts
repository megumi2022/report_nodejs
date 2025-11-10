/**
 * 输出管理器 - 管理每个节点的 JSON 输出
 */

import * as fs from "fs/promises";
import * as path from "path";

export class OutputManager {
    private outputDir: string;

    constructor(projectId: string) {
        this.outputDir = path.join(process.cwd(), "output", projectId);
    }

    /**
     * 确保输出目录存在
     */
    async ensureDir(): Promise<void> {
        await fs.mkdir(this.outputDir, { recursive: true });
    }

    /**
     * 保存节点输出 JSON
     */
    async saveNodeOutput(
        nodeName: string,
        data: any,
        version?: number
    ): Promise<string> {
        await this.ensureDir();

        const filename = version
            ? `${nodeName}V${version}.json`
            : `${nodeName}_${Date.now()}.json`;
        const filepath = path.join(this.outputDir, filename);

        await fs.writeFile(
            filepath,
            JSON.stringify(data, null, 2),
            "utf-8"
        );

        console.log(`✅ ${nodeName} 已保存: ${filepath}`);
        return filepath;
    }

    /**
     * 获取下一个版本号（用于 outlineVx.json）
     */
    async getNextVersion(prefix: string): Promise<number> {
        await this.ensureDir();

        try {
            const files = await fs.readdir(this.outputDir);
            const versions = files
                .filter(f => f.startsWith(prefix) && f.endsWith(".json"))
                .map(f => {
                    const match = f.match(/V(\d+)\.json$/);
                    return match ? parseInt(match[1]) : 0;
                })
                .filter(v => v > 0);

            return versions.length > 0 ? Math.max(...versions) + 1 : 1;
        } catch {
            return 1;
        }
    }

    /**
     * 读取 JSON 文件
     */
    async readJsonFile(filepath: string): Promise<any> {
        const content = await fs.readFile(filepath, "utf-8");
        return JSON.parse(content);
    }
}

