/**
 * 报告生成工作流 - 主入口
 * 整合所有服务，提供统一的报告生成接口
 */

import { TemplateService } from "../services/template-service.ts";
import { RetrievalService } from "../services/retrieval-service.ts";
import { RenderService, ReportContent } from "../services/render-service.ts";
import { SpecializedAgents } from "../agents/specialized-agents.ts";
import { buildReportGenerationGraph, ReportGenerationState } from "./report-generation-graph.ts";
import { parseTemplateToOutline, OutlineNode } from "../tools/outline-parser.ts";
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
    private graph: any; // LangGraph 需要预先编译为可执行的工作流对象（将状态流图转换为实际可调用的函数/对象）
    /**
     * 构造函数 (constructor) 是类被创建时自动调用的特殊方法，主要作用是初始化类的属性和状态。
     * 在本类中，constructor 用于初始化各个服务实例，并组装整个报告生成工作流的流程图（graph）。
     */
    constructor() {
        // 初始化模板服务、检索服务、渲染服务和专用智能体服务
        this.templateService = new TemplateService();
        this.retrievalService = new RetrievalService();
        this.renderService = new RenderService();
        this.agents = new SpecializedAgents();

        // 构建完整的报告生成流程图，每个 key 对应一个具体处理节点（方法绑定当前实例）
        this.graph = buildReportGenerationGraph({
            selectTemplate: this.selectTemplate.bind(this),      // 模板选择节点
            generateOutline: this.generateOutline.bind(this),    // 大纲生成节点
            generatePrompts: this.generatePrompts.bind(this),    // 提示词生成节点
            executeRetrieval: this.executeRetrieval.bind(this),  // 检索调用节点
            generateContent: this.generateContent.bind(this),    // 内容生成节点
            renderReport: this.renderReport.bind(this),          // 渲染输出节点
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
            console.log("\n📝 [generatePrompts] 开始生成提示词...");

            if (!state.outlineJson) {
                console.error("❌ [generatePrompts] 大纲 JSON 缺失");
                return { ...state, error: "大纲 JSON 缺失" };
            }

            // 验证 outlineJson 结构
            if (!Array.isArray(state.outlineJson)) {
                console.error("❌ [generatePrompts] outlineJson 不是数组格式");
                return { ...state, error: "大纲 JSON 格式错误：应为数组" };
            }

            if (state.outlineJson.length === 0) {
                console.warn("⚠️  [generatePrompts] outlineJson 为空数组");
                return { ...state, error: "大纲为空，无法生成提示词" };
            }

            console.log(`   大纲节点数: ${state.outlineJson.length}`);
            console.log(`   项目背景: ${JSON.stringify(state.projectBackground).substring(0, 100)}...`);

            // 统计需要生成 instruction 的节点数量
            const countNodes = (nodes: any[]): { total: number; needPrompt: number; fixed: number } => {
                let total = 0;
                let needPrompt = 0;
                let fixed = 0;

                for (const node of nodes) {
                    total++;
                    if (node.generate_prompt === true) {
                        needPrompt++;
                    } else if (node.fixed_content) {
                        fixed++;
                    }

                    if (node.outline_structure && Array.isArray(node.outline_structure)) {
                        const subCounts = countNodes(node.outline_structure);
                        total += subCounts.total;
                        needPrompt += subCounts.needPrompt;
                        fixed += subCounts.fixed;
                    }
                }

                return { total, needPrompt, fixed };
            };

            const nodeStats = countNodes(state.outlineJson);
            console.log(`   节点统计:`);
            console.log(`     - 总节点数: ${nodeStats.total}`);
            console.log(`     - 需要生成 instruction: ${nodeStats.needPrompt}`);
            console.log(`     - 固定内容节点: ${nodeStats.fixed}`);
            console.log(`     - 其他节点: ${nodeStats.total - nodeStats.needPrompt - nodeStats.fixed}`);

            if (nodeStats.needPrompt === 0) {
                console.warn("⚠️  [generatePrompts] 没有需要生成 instruction 的节点");
            }

            // 递归处理大纲，生成 instruction
            console.log("\n🔄 [generatePrompts] 开始递归生成 instruction...");
            const instructions = await this.generateInstructionsRecursive(
                state.outlineJson,
                state.projectBackground
            );

            console.log(`\n✅ [generatePrompts] instruction 生成完成，共 ${instructions.length} 个节点`);

            // 保存为 report_instruction.json
            const outputManager = new OutputManager(state.projectId || "default");
            const instructionPath = await outputManager.saveNodeOutput(
                "report_instruction",
                instructions
            );
            console.log(`   已保存到: ${instructionPath}`);

            // 构建章节列表
            console.log("\n📋 [generatePrompts] 构建章节列表...");
            const sections = this.buildSectionsFromInstructions(
                state.outlineJson,
                instructions
            );

            if (sections.length === 0) {
                console.error("❌ [generatePrompts] 警告：构建的章节列表为空");
                console.error("   这可能导致后续节点失败");
                console.error("   请检查 instructionJson 的结构是否正确");
            }

            const firstPendingIndex = sections.findIndex(section => !section.content);

            console.log(`\n✅ [generatePrompts] 提示词生成完成`);
            console.log(`   总章节数: ${sections.length}`);
            console.log(`   待生成内容章节数: ${sections.filter(s => !s.content).length}`);
            console.log(`   已有内容章节数: ${sections.filter(s => s.content).length}`);

            return {
                ...state,
                instructionJson: instructions,
                instructionJsonPath: instructionPath,
                sections,
                currentSectionIndex: firstPendingIndex >= 0 ? firstPendingIndex : undefined,
            };
        } catch (error: any) {
            console.error("❌ [generatePrompts] 提示词生成失败:", error);
            console.error("   错误堆栈:", error.stack);
            return { ...state, error: `提示词生成失败: ${error.message}` };
        }
    }

    /**
     * 递归生成 instruction
     */
    private async generateInstructionsRecursive(
        outlineNodes: any[],
        projectBackground: any,
        depth: number = 0,
        parentPath: string = ""
    ): Promise<any[]> {
        const result: any[] = [];
        const indent = "  ".repeat(depth);

        for (let i = 0; i < outlineNodes.length; i++) {
            const node = outlineNodes[i];
            const currentPath = parentPath ? `${parentPath}.${i + 1}` : `${i + 1}`;

            if (!node) {
                console.warn(`${indent}⚠️  节点 ${currentPath} 为空，跳过`);
                continue;
            }

            if (!node.chapter_number) {
                console.warn(`${indent}⚠️  节点 ${currentPath} 缺少 chapter_number，跳过`);
                continue;
            }

            const nodeTitle = node.title || node.chapter_number;
            console.log(`${indent}📝 处理节点 ${node.chapter_number}: ${nodeTitle}`);

            const instruction: any = {
                chapter_number: node.chapter_number,
            };

            if (node.generate_prompt === true) {
                // 生成 instruction 字段
                console.log(`${indent}   🔄 生成 instruction（调用 Agent）...`);
                try {
                    const startTime = Date.now();
                    const { user_prompt_text, user_prompt_image, user_prompt_table, queries } =
                        await this.agents.generateInstruction(
                            node,
                            projectBackground
                        );
                    const duration = Date.now() - startTime;

                    if (!user_prompt_text || user_prompt_text.trim().length === 0) {
                        console.warn(`${indent}   ⚠️  节点 ${node.chapter_number} 生成的 user_prompt_text 为空`);
                    }

                    instruction.instruction = {
                        chapter_number: node.chapter_number,
                        user_prompt_text: user_prompt_text || "",
                        user_prompt_image: user_prompt_image || null,
                        user_prompt_table: user_prompt_table || null,
                        queries: Array.isArray(queries) ? queries : [],
                        version: "1.0",
                        is_locked: false,
                        updated_at: new Date().toISOString(),
                    };

                    console.log(`${indent}   ✅ instruction 生成成功 (耗时: ${duration}ms)`);
                    console.log(`${indent}      - user_prompt_text: ${user_prompt_text?.substring(0, 50)}...`);
                    console.log(`${indent}      - queries: ${queries?.length || 0} 个`);
                } catch (error: any) {
                    console.error(`${indent}   ❌ 节点 ${node.chapter_number} instruction 生成失败:`, error.message);
                    console.error(`${indent}      错误详情:`, error);

                    // 使用降级策略：使用治理标准或标题作为默认 prompt
                    const fallbackPrompt = node.govern_standard || `撰写章节：${node.title || node.chapter_number}`;
                    console.warn(`${indent}   🔄 使用降级策略，生成默认 instruction`);

                    instruction.instruction = {
                        chapter_number: node.chapter_number,
                        user_prompt_text: fallbackPrompt,
                        user_prompt_image: null,
                        user_prompt_table: null,
                        queries: [],
                        version: "1.0",
                        is_locked: false,
                        updated_at: new Date().toISOString(),
                    };
                }
            } else {
                // 只插入 fixed_content
                if (node.fixed_content) {
                    instruction.fixed_content = node.fixed_content;
                    console.log(`${indent}   ✅ 使用固定内容 (fixed_content)`);
                } else {
                    console.log(`${indent}   ℹ️  节点 ${node.chapter_number} 既无 generate_prompt 也无 fixed_content`);
                }
            }

            // 递归处理子章节
            if (node.outline_structure && Array.isArray(node.outline_structure) && node.outline_structure.length > 0) {
                console.log(`${indent}   📂 递归处理 ${node.outline_structure.length} 个子节点...`);
                instruction.outline_structure = await this.generateInstructionsRecursive(
                    node.outline_structure,
                    projectBackground,
                    depth + 1,
                    currentPath
                );
                console.log(`${indent}   ✅ 子节点处理完成，共 ${instruction.outline_structure.length} 个`);
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
            if (!state.sections || state.sections.length === 0) {
                console.warn("⚠️ 没有章节信息可供检索，跳过检索节点");
                return { ...state };
            }

            for (const section of state.sections) {
                if (!section) continue;

                // 跳过无需生成或已经有内容的章节
                if (section.content || !section.prompt) {
                    continue;
                }

                const retrievalPlan = section.retrieval?.plan || section.retrieval;
                if (!retrievalPlan || Object.values(retrievalPlan).every(value => !value)) {
                    continue;
                }

                const results = await this.retrievalService.retrieveAll(
                    retrievalPlan,
                    {
                        excelPath: state.excelPath,
                        projectId: state.projectId,
                    }
                );

                if (!section.retrieval) {
                    section.retrieval = {};
                }

                section.retrieval.results = results;
            }

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
            console.log("\n📝 [generateContent] 开始生成章节内容...");

            if (!state.sections || state.sections.length === 0) {
                console.error("❌ [generateContent] 章节信息缺失");
                return { ...state, error: "章节信息缺失：sections 为空或未定义" };
            }

            console.log(`   待处理章节数: ${state.sections.length}`);

            let generatedCount = 0;
            let skippedCount = 0;
            let errorCount = 0;

            for (let i = 0; i < state.sections.length; i++) {
                const section = state.sections[i];
                if (!section) {
                    skippedCount++;
                    continue;
                }

                // 已有内容（固定章节或已生成）直接跳过
                if (section.content) {
                    console.log(`   ⏭️  跳过章节 ${section.id} (已有内容)`);
                    skippedCount++;
                    continue;
                }

                if (!section.prompt) {
                    console.warn(`   ⚠️  章节 ${section.id} (${section.title}) 缺少 prompt，跳过内容生成`);
                    skippedCount++;
                    continue;
                }

                try {
                    console.log(`   🔄 生成章节 ${section.id} (${section.title})...`);
                    const retrievalResults = section.retrieval?.results || [];
                    console.log(`      检索结果数量: ${Array.isArray(retrievalResults) ? retrievalResults.length : 0}`);

                    const content = await this.agents.generateSectionContent(
                        section.title,
                        section.prompt,
                        retrievalResults
                    );

                    section.content = content;
                    generatedCount++;
                    console.log(`   ✅ 章节 ${section.id} 内容生成完成`);
                } catch (error: any) {
                    errorCount++;
                    console.error(`   ❌ 章节 ${section.id} 内容生成失败: ${error.message}`);
                    // 继续处理其他章节，不中断整个流程
                }
            }

            console.log(`\n📊 [generateContent] 内容生成完成:`);
            console.log(`   ✅ 成功生成: ${generatedCount} 个章节`);
            console.log(`   ⏭️  跳过: ${skippedCount} 个章节`);
            if (errorCount > 0) {
                console.warn(`   ❌ 失败: ${errorCount} 个章节`);
            }

            // 检查是否所有需要生成的章节都有内容
            const sectionsNeedingContent = state.sections.filter(s => !s.content && s.prompt);
            if (sectionsNeedingContent.length > 0) {
                console.warn(`   ⚠️  仍有 ${sectionsNeedingContent.length} 个章节未生成内容:`);
                sectionsNeedingContent.forEach(s => {
                    console.warn(`      - ${s.id}: ${s.title}`);
                });
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
            console.log("\n📋 [renderReport] 开始渲染报告...");
            console.log(`   章节数量: ${state.sections?.length || 0}`);

            if (!state.sections || state.sections.length === 0) {
                console.error("❌ [renderReport] 章节列表为空");
                console.error("   可能的原因：");
                console.error("   1. buildSectionsFromInstructions 未正确构建章节");
                console.error("   2. instructionJson 中缺少 instruction 或 fixed_content");
                console.error("   3. 大纲结构解析失败");

                // 尝试从 instructionJson 重新构建 sections
                if (state.instructionJson && state.outlineJson) {
                    console.log("   🔄 尝试从 instructionJson 重新构建 sections...");
                    const rebuiltSections = this.buildSectionsFromInstructions(
                        state.outlineJson,
                        state.instructionJson
                    );
                    console.log(`   ✅ 重新构建后章节数量: ${rebuiltSections.length}`);

                    if (rebuiltSections.length > 0) {
                        state.sections = rebuiltSections;
                    } else {
                        return {
                            ...state,
                            error: `章节内容缺失：无法从 instructionJson 构建章节列表。请检查 report_instruction.json 文件是否包含有效的 instruction 或 fixed_content 字段。`
                        };
                    }
                } else {
                    return {
                        ...state,
                        error: `章节内容缺失：sections 为空，且无法重新构建（instructionJson 或 outlineJson 缺失）`
                    };
                }
            }

            // 检查有多少章节有内容
            const sectionsWithContent = state.sections.filter(s => s.content).length;
            const sectionsWithoutContent = state.sections.length - sectionsWithContent;

            console.log(`   ✅ 有内容的章节: ${sectionsWithContent}`);
            if (sectionsWithoutContent > 0) {
                console.warn(`   ⚠️  无内容的章节: ${sectionsWithoutContent}`);
                const missingSections = state.sections
                    .filter(s => !s.content)
                    .map(s => `${s.id}: ${s.title}`)
                    .join(", ");
                console.warn(`   缺失章节: ${missingSections}`);
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

            console.log(`✅ [renderReport] 报告渲染完成，共 ${reportContent.sections.length} 个章节`);
            return { ...state, reportContent };
        } catch (error: any) {
            return { ...state, error: `报告渲染失败: ${error.message}` };
        }
    }

    /**
     * 根据大纲和指令生成章节列表
     */
    private buildSectionsFromInstructions(
        outline: OutlineNode[],
        instructions: any[]
    ): Array<{
        id: string;
        title: string;
        prompt?: string;
        retrieval?: {
            plan?: {
                excel?: string;
                web?: string;
                database?: string;
                vector?: string;
                pdf?: string;
            };
            results?: any;
        };
        content?: any;
    }> {
        console.log("\n📋 [buildSectionsFromInstructions] 开始构建章节列表...");
        console.log(`   大纲节点数: ${outline?.length || 0}`);
        console.log(`   指令节点数: ${instructions?.length || 0}`);

        if (!outline || outline.length === 0) {
            console.warn("⚠️  大纲为空，无法构建章节列表");
            return [];
        }

        if (!instructions || instructions.length === 0) {
            console.warn("⚠️  指令为空，无法构建章节列表");
            return [];
        }

        const outlineMap = this.buildOutlineIndex(outline);
        const sections: Array<{
            id: string;
            title: string;
            prompt?: string;
            retrieval?: {
                plan?: {
                    excel?: string;
                    web?: string;
                    database?: string;
                    vector?: string;
                    pdf?: string;
                };
                results?: any;
            };
            content?: any;
        }> = [];

        let processedCount = 0;
        let skippedCount = 0;

        const traverse = (nodes: any[]) => {
            for (const node of nodes) {
                if (!node?.chapter_number) {
                    skippedCount++;
                    continue;
                }

                const outlineNode = outlineMap.get(node.chapter_number);
                const title = outlineNode?.title || node.chapter_number;

                if (node.instruction) {
                    const promptText = node.instruction.user_prompt_text || "";
                    const queries = Array.isArray(node.instruction.queries)
                        ? node.instruction.queries
                        : [];
                    const retrievalPlan = this.buildRetrievalPlan(queries, outlineNode);

                    sections.push({
                        id: node.chapter_number,
                        title,
                        prompt: promptText,
                        retrieval: retrievalPlan ? { plan: retrievalPlan } : undefined,
                    });
                    processedCount++;
                    console.log(`   ✅ 添加章节: ${node.chapter_number} - ${title} (有 instruction)`);
                } else if (node.fixed_content) {
                    sections.push({
                        id: node.chapter_number,
                        title,
                        content: {
                            text: node.fixed_content,
                        },
                    });
                    processedCount++;
                    console.log(`   ✅ 添加章节: ${node.chapter_number} - ${title} (有 fixed_content)`);
                } else {
                    skippedCount++;
                    console.log(`   ⚠️  跳过节点: ${node.chapter_number} - ${title} (既无 instruction 也无 fixed_content)`);
                }

                if (node.outline_structure && Array.isArray(node.outline_structure)) {
                    traverse(node.outline_structure);
                }
            }
        };

        traverse(instructions);

        console.log(`\n📊 [buildSectionsFromInstructions] 构建完成:`);
        console.log(`   ✅ 成功构建: ${processedCount} 个章节`);
        console.log(`   ⚠️  跳过节点: ${skippedCount} 个`);
        console.log(`   📝 总章节数: ${sections.length}`);

        if (sections.length === 0) {
            console.error("❌ [buildSectionsFromInstructions] 警告：未构建任何章节！");
            console.error("   可能的原因：");
            console.error("   1. instructions 中所有节点都没有 instruction 或 fixed_content");
            console.error("   2. 节点结构不匹配（chapter_number 不一致）");
            console.error("   3. instruction 字段格式不正确");
        }

        return sections;
    }

    /**
     * 构建大纲索引，便于根据章节号查找标题等信息
     */
    private buildOutlineIndex(outline: OutlineNode[]): Map<string, OutlineNode> {
        const map = new Map<string, OutlineNode>();

        const walk = (nodes: OutlineNode[]) => {
            for (const node of nodes) {
                map.set(node.chapter_number, node);
                if (node.outline_structure) {
                    walk(node.outline_structure);
                }
            }
        };

        walk(outline);
        return map;
    }

    /**
     * 根据提示词中的查询生成检索计划
     */
    private buildRetrievalPlan(
        queries: string[],
        outlineNode?: OutlineNode
    ):
        | {
            excel?: string;
            web?: string;
            database?: string;
            vector?: string;
            pdf?: string;
        }
        | undefined {
        if (!queries || queries.length === 0) {
            return undefined;
        }

        const [first, second, third] = queries;

        const plan: {
            excel?: string;
            web?: string;
            database?: string;
            vector?: string;
            pdf?: string;
        } = {};

        if (first) {
            plan.excel = first;
        }

        const semanticQuery = second || first;
        if (semanticQuery) {
            plan.vector = semanticQuery;
            plan.pdf = semanticQuery;
        }

        if (third) {
            plan.web = third;
        }

        if (outlineNode?.govern_standard) {
            plan.database = outlineNode.govern_standard;
        }

        return plan;
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

