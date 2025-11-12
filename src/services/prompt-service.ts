/**
 * 提示词管理服务
 * 负责加载和渲染 Jinja2 模板
 */

import * as nunjucks from "nunjucks";
import * as path from "path";
import * as fs from "fs/promises";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class PromptService {
    private env: nunjucks.Environment;
    private promptsDir: string;
    private cache: Map<string, string> = new Map();

    constructor() {
        // 设置模板目录
        this.promptsDir = path.join(__dirname, "../prompts");

        // 初始化 Nunjucks 环境
        this.env = new nunjucks.Environment(
            new nunjucks.FileSystemLoader(this.promptsDir, {
                noCache: process.env.NODE_ENV === "development", // 开发环境不缓存
            }),
            {
                autoescape: false, // 不转义，因为我们要输出原始文本
                trimBlocks: true,
                lstripBlocks: true,
            }
        );

        // 添加自定义过滤器
        this.env.addFilter("tojson", (value: any, indent?: number) => {
            return JSON.stringify(value, null, indent || 2);
        });
    }

    /**
     * 加载提示词模板
     */
    async loadPrompt(agentType: string, templateName: string): Promise<string> {
        const cacheKey = `${agentType}/${templateName}`;

        // 检查缓存
        if (this.cache.has(cacheKey)) {
            return this.cache.get(cacheKey)!;
        }

        // 构建模板路径（扁平化结构）
        const templatePath = path.join(
            this.promptsDir,
            agentType,
            `${templateName}.j2`
        );

        try {
            // 读取模板文件
            const content = await fs.readFile(templatePath, "utf-8");
            this.cache.set(cacheKey, content);
            return content;
        } catch (error: any) {
            if (error.code === "ENOENT") {
                throw new Error(`提示词模板不存在: ${templatePath}`);
            }
            throw error;
        }
    }

    /**
     * 渲染模板
     */
    renderTemplate(template: string, variables: Record<string, any>): string {
        try {
            return this.env.renderString(template, variables);
        } catch (error: any) {
            throw new Error(`模板渲染失败: ${error.message}`);
        }
    }

    /**
     * 加载并渲染提示词
     */
    async renderPrompt(
        agentType: string,
        templateName: string,
        variables: Record<string, any>
    ): Promise<string> {
        const template = await this.loadPrompt(agentType, templateName);
        return this.renderTemplate(template, variables);
    }

    /**
     * 获取系统提示词
     */
    async getSystemPrompt(agentType: string): Promise<string> {
        return await this.renderPrompt(agentType, "system", {});
    }

    /**
     * 获取用户提示词（带变量）
     */
    async getUserPrompt(
        agentType: string,
        templateName: string,
        variables: Record<string, any>
    ): Promise<string> {
        return await this.renderPrompt(agentType, templateName, variables);
    }

    /**
     * 清除缓存
     */
    clearCache(): void {
        this.cache.clear();
    }
}

