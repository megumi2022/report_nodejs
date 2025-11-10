/**
 * 专门的 Agent 实例管理
 * 为不同任务创建独立的 Pipeline 实例
 */

import { MCPAgentPipeline } from "./mcp-pipeline.ts";

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

    constructor() {
        // 创建独立的 Pipeline 实例
        // 每个实例可以配置不同的工具集
        this.outlineAgent = new MCPAgentPipeline();
        this.promptAgent = new MCPAgentPipeline();
        this.contentAgent = new MCPAgentPipeline();
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
        const prompt = `根据以下章节信息生成子标题：

章节ID: ${section.id}
章节标题: ${section.title}
治理标准: ${section.govern_standard || "无"}

项目背景：
${JSON.stringify(projectBackground, null, 2)}

请生成 3-5 个相关的子标题，要求：
1. 子标题应该与章节主题紧密相关
2. 符合政府报告的规范和要求
3. 如果提供了治理标准，应该参考标准内容

返回 JSON 数组格式，只包含子标题字符串：
["子标题1", "子标题2", "子标题3", ...]`;

        const result = await this.outlineAgent.execute(
            prompt,
            "你是一个专业的政府投资报告撰写专家，擅长生成符合规范的章节子标题。必须返回有效的 JSON 数组格式。"
        );

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
        const prompt = `根据以下章节信息生成详细的撰写指令：

章节编号: ${node.chapter_number}
章节标题: ${node.title}
治理标准: ${node.govern_standard || "无"}

项目背景：
${JSON.stringify(projectBackground, null, 2)}

请返回 JSON 格式：
{
  "user_prompt_text": "详细的文本撰写要求（Markdown格式），包括内容结构、关键要点、字数要求等",
  "user_prompt_image": "图片要求说明（如果有，如需要配图、图表类型等）",
  "user_prompt_table": "表格要求说明（如果有，如需要统计表格、数据表格等）",
  "queries": ["检索查询1", "检索查询2", ...]
}

要求：
1. user_prompt_text 要详细具体，包含撰写要求
2. queries 要明确，便于后续检索
3. 如果不需要图片或表格，对应字段可以为 null`;

        const result = await this.promptAgent.execute(
            prompt,
            "你是一个提示词设计专家，擅长根据治理标准和项目背景生成详细的撰写指令和检索查询。必须返回有效的 JSON 格式。"
        );

        try {
            const jsonMatch = result.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                return {
                    user_prompt_text: parsed.user_prompt_text || "",
                    user_prompt_image: parsed.user_prompt_image || null,
                    user_prompt_table: parsed.user_prompt_table || null,
                    queries: Array.isArray(parsed.queries) ? parsed.queries : [],
                };
            }

            throw new Error("返回格式不正确");
        } catch (error: any) {
            console.error("Instruction 解析失败:", error.message);
            // 返回默认值
            return {
                user_prompt_text: node.govern_standard || `撰写章节：${node.title}`,
                queries: [],
            };
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
        const retrievalSummary = retrievalResults
            .map((r, i) => `检索结果 ${i + 1} (来源: ${r.source}):\n${JSON.stringify(r.data, null, 2)}`)
            .join("\n\n");

        const contentPrompt = `根据以下信息生成报告章节内容：

章节标题: ${sectionTitle}
撰写要求: ${prompt}

检索结果:
${retrievalSummary}

请生成完整的章节内容，包括：
1. 文本内容（Markdown 格式）
2. 表格数据（如果有）
3. 图表说明（如果有）

返回 JSON 格式：
{
  "text": "章节的文本内容（Markdown格式）",
  "tables": [表格数据数组],
  "images": [图表说明数组]
}`;

        const result = await this.contentAgent.execute(
            contentPrompt,
            "你是一个专业的报告撰写专家，擅长根据提示词和检索结果生成高质量的报告内容。"
        );

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

