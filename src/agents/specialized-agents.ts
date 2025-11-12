/**
 * 专门的 Agent 实例管理
 * 为不同任务创建独立的 Pipeline 实例
 */

import { MCPAgentPipeline } from "./mcp-pipeline.ts";
import { PromptService } from "../services/prompt-service.ts";

/**
 * 专门的 Agent 管理器
 */
export class SpecializedAgents {
    // 大纲生成 Agent
    public readonly outlineAgent: MCPAgentPipeline;

    // 提示词生成 Agent
    public readonly promptAgent: MCPAgentPipeline;

    // 内容生成 Agent
    public readonly contentAgent: MCPAgentPipeline;

    // 提示词服务
    private readonly promptService: PromptService;

    constructor() {
        // 创建独立的 Pipeline 实例
        // 每个实例可以配置不同的工具集
        this.outlineAgent = new MCPAgentPipeline();
        this.promptAgent = new MCPAgentPipeline();
        this.contentAgent = new MCPAgentPipeline();

        // 初始化提示词服务
        this.promptService = new PromptService();
    }

    /**
     * 初始化所有 Agent
     */
    async initialize() {
        await Promise.all([
            this.outlineAgent.initialize(),
            this.promptAgent.initialize(),
            this.contentAgent.initialize(),
        ]);
    }

    /**
     * 生成子标题
     */
    async generateSubtitles(
        section: any,
        projectBackground: any
    ): Promise<string[]> {
        // 从模板加载提示词
        const userPrompt = await this.promptService.getUserPrompt(
            "outline-agent",
            "generate-subtitles",
            {
                section: {
                    id: section.id,
                    title: section.title,
                    govern_standard: section.govern_standard || "无",
                },
                project_background: projectBackground,
            }
        );

        const systemPrompt = await this.promptService.getSystemPrompt("outline-agent");

        const result = await this.outlineAgent.execute(userPrompt, systemPrompt);

        try {
            const jsonMatch = result.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                if (Array.isArray(parsed) && parsed.every(item => typeof item === "string")) {
                    return parsed;
                }
            }

            throw new Error("返回格式不正确");
        } catch (error: any) {
            console.error("子标题解析失败:", error.message);
            throw new Error(`子标题解析失败: ${error.message}`);
        }
    }

    /**
     * 生成 instruction（用于 report_instruction.json）
     */
    async generateInstruction(
        node: {
            chapter_number: string;
            title: string;
            govern_standard?: string;
        },
        projectBackground: any
    ): Promise<{
        user_prompt_text: string;
        user_prompt_image?: string;
        user_prompt_table?: string;
        queries: string[];
    }> {
        try {
            // 从模板加载提示词
            const userPrompt = await this.promptService.getUserPrompt(
                "prompt-agent",
                "generate-instruction",
                {
                    node: {
                        chapter_number: node.chapter_number,
                        title: node.title,
                        govern_standard: node.govern_standard || "无",
                    },
                    project_background: projectBackground,
                }
            );

            const systemPrompt = await this.promptService.getSystemPrompt("prompt-agent");

            const result = await this.promptAgent.execute(userPrompt, systemPrompt);

            if (!result || result.trim().length === 0) {
                throw new Error("Agent 返回结果为空");
            }

            // 尝试多种方式提取 JSON
            let parsed: any = null;

            // 方法1: 直接匹配 JSON 对象
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                try {
                    parsed = JSON.parse(jsonMatch[0]);
                } catch (e) {
                    console.warn("   ⚠️  JSON 解析失败，尝试其他方法");
                }
            }

            // 方法2: 如果方法1失败，尝试提取代码块中的 JSON
            if (!parsed) {
                const codeBlockMatch = result.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
                if (codeBlockMatch) {
                    try {
                        parsed = JSON.parse(codeBlockMatch[1]);
                    } catch (e) {
                        console.warn("   ⚠️  代码块 JSON 解析失败");
                    }
                }
            }

            // 方法3: 如果都失败，尝试直接解析整个结果
            if (!parsed) {
                try {
                    parsed = JSON.parse(result.trim());
                } catch (e) {
                    console.warn("   ⚠️  直接解析失败");
                }
            }

            if (parsed && typeof parsed === 'object') {
                const instruction = {
                    user_prompt_text: parsed.user_prompt_text || "",
                    user_prompt_image: parsed.user_prompt_image || null,
                    user_prompt_table: parsed.user_prompt_table || null,
                    queries: Array.isArray(parsed.queries) ? parsed.queries : [],
                };

                // 验证结果
                if (!instruction.user_prompt_text || instruction.user_prompt_text.trim().length === 0) {
                    console.warn(`   ⚠️  节点 ${node.chapter_number} 生成的 user_prompt_text 为空，使用降级策略`);
                    instruction.user_prompt_text = node.govern_standard || `撰写章节：${node.title}`;
                }

                return instruction;
            }

            throw new Error(`无法从 Agent 返回结果中提取有效的 JSON。返回内容: ${result.substring(0, 200)}...`);
        } catch (error: any) {
            console.error(`   ❌ [generateInstruction] 节点 ${node.chapter_number} 处理失败:`, error.message);
            if (error.stack) {
                console.error(`   堆栈:`, error.stack);
            }

            // 返回降级值
            const fallback = {
                user_prompt_text: node.govern_standard || `撰写章节：${node.title}`,
                user_prompt_image: undefined,
                user_prompt_table: undefined,
                queries: [] as string[],
            };

            console.warn(`   🔄 使用降级策略: ${fallback.user_prompt_text.substring(0, 50)}...`);
            return fallback;
        }
    }

    /**
     * 生成章节内容
     */
    async generateSectionContent(
        sectionTitle: string,
        prompt: string,
        retrievalResults: any[]
    ): Promise<{ text?: string; tables?: any[]; images?: string[] }> {
        // 从模板加载提示词
        const userPrompt = await this.promptService.getUserPrompt(
            "content-agent",
            "generate-content",
            {
                section_title: sectionTitle,
                prompt: prompt,
                retrieval_results: retrievalResults,
            }
        );

        const systemPrompt = await this.promptService.getSystemPrompt("content-agent");

        const result = await this.contentAgent.execute(userPrompt, systemPrompt);

        try {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.warn("无法解析内容结果，使用原始文本");
        }

        return {
            text: result,
        };
    }
}

