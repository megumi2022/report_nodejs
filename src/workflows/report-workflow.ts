/**
 * 报告生成工作流 - 主入口
 * 整合所有服务，提供统一的报告生成接口
 */

import { TemplateService } from "../services/template-service.ts";
import { RetrievalService } from "../services/retrieval-service.ts";
import { RenderService, ReportContent } from "../services/render-service.ts";
import { SpecializedAgents } from "../agents/specialized-agents.ts";
import { buildReportGenerationGraph, ReportGenerationState } from "./report-generation-graph.ts";
import { parseTemplateToOutline } from "../tools/outline-parser.ts";
import { OutputManager } from "../tools/output-manager.ts";

export interface ReportGenerationInput {
    excelPath?: string;
    projectBackground: any;
    templateKey: string;
    projectId?: string;
}

export class ReportGenerationWorkflow {
    private templateService: TemplateService;
    private retrievalService: RetrievalService;
    private renderService: RenderService;
    private agents: SpecializedAgents;
    private graph: any; // LangGraph 编译后的类型

    constructor() {
        this.templateService = new TemplateService();
        this.retrievalService = new RetrievalService();
        this.renderService = new RenderService();
        this.agents = new SpecializedAgents();

        // 构建工作流图
        this.graph = buildReportGenerationGraph({
            selectTemplate: this.selectTemplate.bind(this),
            generateOutline: this.generateOutline.bind(this),
            generatePrompts: this.generatePrompts.bind(this),
            executeRetrieval: this.executeRetrieval.bind(this),
            generateContent: this.generateContent.bind(this),
            renderReport: this.renderReport.bind(this),
        });
    }

    /**
     * 初始化所有服务
     */
    async initialize() {
        await Promise.all([
            this.retrievalService.initialize(),
            this.agents.initialize(),
        ]);
    }

    /**
     * 生成报告
     */
    async generateReport(input: ReportGenerationInput): Promise<ReportContent> {
        const initialState: ReportGenerationState = {
            excelPath: input.excelPath,
            projectBackground: input.projectBackground,
            templateKey: input.templateKey,
            projectId: input.projectId,
        };

        const result = await this.graph.invoke(initialState);

        if (result.error) {
            throw new Error(result.error);
        }

        return result.reportContent;
    }

    /**
     * 节点 1: 选择模板
     */
    private async selectTemplate(state: ReportGenerationState): Promise<ReportGenerationState> {
        try {
            const template = await this.templateService.getTemplate(state.templateKey);
            if (!template) {
                return { ...state, error: `未找到模板: ${state.templateKey}` };
            }

            // 保存模板 JSON
            const outputManager = new OutputManager(state.projectId || "default");
            const templatePath = await outputManager.saveNodeOutput("template", template);

            return {
                ...state,
                template,
                templateJsonPath: templatePath,
            };
        } catch (error: any) {
            return { ...state, error: `模板选择失败: ${error.message}` };
        }
    }

    /**
     * 节点 2: 生成大纲（outlineVx.json）
     */
    private async generateOutline(state: ReportGenerationState): Promise<ReportGenerationState> {
        try {
            if (!state.template) {
                return { ...state, error: "模板未选择" };
            }

            const outlineStructure = state.template.outline_structure || [];

            // 递归解析模板结构
            const outline = await parseTemplateToOutline(
                outlineStructure,
                async (section, projectBackground) => {
                    // 调用 AI 生成子标题
                    return await this.agents.generateSubtitles(section, projectBackground);
                },
                state.projectBackground
            );

            // 保存为 outlineVx.json
            const outputManager = new OutputManager(state.projectId || "default");
            const version = await outputManager.getNextVersion("outlineV");
            const outlinePath = await outputManager.saveNodeOutput(
                "outline",
                outline,
                version
            );

            return {
                ...state,
                outlineJson: outline, // 完整的大纲 JSON（保持嵌套结构）
                outlineJsonPath: outlinePath,
            };
        } catch (error: any) {
            return { ...state, error: `大纲生成失败: ${error.message}` };
        }
    }

    /**
     * 节点 3: 生成提示词（report_instruction.json）
     */
    private async generatePrompts(state: ReportGenerationState): Promise<ReportGenerationState> {
        try {
            if (!state.outlineJson) {
                return { ...state, error: "大纲 JSON 缺失" };
            }

            // 递归处理大纲，生成 instruction
            const instructions = await this.generateInstructionsRecursive(
                state.outlineJson,
                state.projectBackground
            );

            // 保存为 report_instruction.json
            const outputManager = new OutputManager(state.projectId || "default");
            const instructionPath = await outputManager.saveNodeOutput(
                "report_instruction",
                instructions
            );

            return {
                ...state,
                instructionJson: instructions,
                instructionJsonPath: instructionPath,
            };
        } catch (error: any) {
            return { ...state, error: `提示词生成失败: ${error.message}` };
        }
    }

    /**
     * 递归生成 instruction
     */
    private async generateInstructionsRecursive(
        outlineNodes: any[],
        projectBackground: any
    ): Promise<any[]> {
        const result: any[] = [];

        for (const node of outlineNodes) {
            const instruction: any = {
                chapter_number: node.chapter_number,
            };

            if (node.generate_prompt === true) {
                // 生成 instruction 字段
                const { user_prompt_text, user_prompt_image, user_prompt_table, queries } =
                    await this.agents.generateInstruction(
                        node,
                        projectBackground
                    );

                instruction.instruction = {
                    chapter_number: node.chapter_number,
                    user_prompt_text,
                    user_prompt_image: user_prompt_image || null,
                    user_prompt_table: user_prompt_table || null,
                    queries: queries || [],
                    version: "1.0",
                    is_locked: false,
                    updated_at: new Date().toISOString(),
                };
            } else {
                // 只插入 fixed_content
                if (node.fixed_content) {
                    instruction.fixed_content = node.fixed_content;
                }
            }

            // 递归处理子章节
            if (node.outline_structure && node.outline_structure.length > 0) {
                instruction.outline_structure = await this.generateInstructionsRecursive(
                    node.outline_structure,
                    projectBackground
                );
            }

            result.push(instruction);
        }

        return result;
    }

    /**
     * 节点 4: 执行检索
     */
    private async executeRetrieval(state: ReportGenerationState): Promise<ReportGenerationState> {
        try {
            if (!state.sections || state.currentSectionIndex === undefined) {
                return { ...state, error: "章节信息缺失" };
            }

            const section = state.sections[state.currentSectionIndex];
            if (!section.retrieval) {
                return { ...state };
            }

            const results = await this.retrievalService.retrieveAll(
                section.retrieval,
                {
                    excelPath: state.excelPath,
                    projectId: state.projectId,
                }
            );

            // 将检索结果存储到章节中
            section.retrieval = { results };

            return { ...state };
        } catch (error: any) {
            return { ...state, error: `检索失败: ${error.message}` };
        }
    }

    /**
     * 节点 5: 生成内容
     */
    private async generateContent(state: ReportGenerationState): Promise<ReportGenerationState> {
        try {
            if (!state.sections || state.currentSectionIndex === undefined) {
                return { ...state, error: "章节信息缺失" };
            }

            const section = state.sections[state.currentSectionIndex];
            const retrievalResults = section.retrieval?.results || [];

            const content = await this.agents.generateSectionContent(
                section.title,
                section.prompt || "",
                retrievalResults
            );

            section.content = content;

            // 如果还有更多章节，继续处理
            if (state.currentSectionIndex < state.sections.length - 1) {
                return {
                    ...state,
                    currentSectionIndex: state.currentSectionIndex + 1,
                };
            }

            return { ...state };
        } catch (error: any) {
            return { ...state, error: `内容生成失败: ${error.message}` };
        }
    }

    /**
     * 节点 6: 渲染报告
     */
    private async renderReport(state: ReportGenerationState): Promise<ReportGenerationState> {
        try {
            if (!state.sections) {
                return { ...state, error: "章节内容缺失" };
            }

            const reportContent: ReportContent = {
                sections: state.sections.map(s => ({
                    id: s.id,
                    title: s.title,
                    content: s.content || {},
                })),
                metadata: {
                    title: "报告",
                    projectId: state.projectId || "",
                    templateKey: state.templateKey,
                    generatedAt: new Date().toISOString(),
                },
            };

            return { ...state, reportContent };
        } catch (error: any) {
            return { ...state, error: `报告渲染失败: ${error.message}` };
        }
    }

    /**
     * 渲染为 Markdown
     */
    renderToMarkdown(content: ReportContent): string {
        return this.renderService.renderToMarkdown(content);
    }

    /**
     * 渲染为 HTML
     */
    renderToHTML(content: ReportContent): string {
        return this.renderService.renderToHTML(content);
    }
}

