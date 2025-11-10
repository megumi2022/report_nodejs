/**
 * 报告生成 LangGraph 工作流
 */

import { StateGraph, END, START } from "@langchain/langgraph";

export interface ReportGenerationState {
    // 输入
    excelPath?: string;
    projectBackground: any;
    templateKey: string;
    projectId?: string;

    // 中间状态
    template?: any;
    templateJsonPath?: string;        // 节点1输出路径

    outlineJson?: any;                // 节点2输出（完整大纲，保持嵌套结构）
    outlineJsonPath?: string;         // outlineVx.json 路径

    instructionJson?: any;             // 节点3输出
    instructionJsonPath?: string;      // report_instruction.json 路径

    sections?: Array<{
        id: string;
        title: string;
        prompt?: string;
        retrieval?: any;
        content?: any;
    }>;
    currentSectionIndex?: number;

    // 输出
    reportContent?: any;
    error?: string;
}

/**
 * 构建报告生成工作流
 */
export function buildReportGenerationGraph(
    handlers: {
        selectTemplate: (state: ReportGenerationState) => Promise<ReportGenerationState>;
        generateOutline: (state: ReportGenerationState) => Promise<ReportGenerationState>;
        generatePrompts: (state: ReportGenerationState) => Promise<ReportGenerationState>;
        executeRetrieval: (state: ReportGenerationState) => Promise<ReportGenerationState>;
        generateContent: (state: ReportGenerationState) => Promise<ReportGenerationState>;
        renderReport: (state: ReportGenerationState) => Promise<ReportGenerationState>;
    }
) {
    const workflow = new StateGraph<ReportGenerationState>({
        channels: {
            excelPath: { default: () => undefined as string | undefined },
            projectBackground: { default: () => ({}) },
            templateKey: { default: () => "" },
            projectId: { default: () => undefined as string | undefined },
            template: { default: () => undefined },
            templateJsonPath: { default: () => undefined as string | undefined },
            outlineJson: { default: () => undefined },
            outlineJsonPath: { default: () => undefined as string | undefined },
            instructionJson: { default: () => undefined },
            instructionJsonPath: { default: () => undefined as string | undefined },
            sections: {
                default: () => [] as Array<{
                    id: string;
                    title: string;
                    prompt?: string;
                    retrieval?: any;
                    content?: any;
                }>
            },
            currentSectionIndex: { default: () => 0 },
            reportContent: { default: () => undefined },
            error: { default: () => undefined as string | undefined },
        },
    });

    // 添加节点
    workflow.addNode("select_template", handlers.selectTemplate);
    workflow.addNode("generate_outline", handlers.generateOutline);
    workflow.addNode("generate_prompts", handlers.generatePrompts);
    workflow.addNode("execute_retrieval", handlers.executeRetrieval);
    workflow.addNode("generate_content", handlers.generateContent);
    workflow.addNode("render_report", handlers.renderReport);

    // 定义边
    workflow.addEdge(START, "select_template");
    workflow.addEdge("select_template", "generate_outline");
    workflow.addEdge("generate_outline", "generate_prompts");
    workflow.addEdge("generate_prompts", "execute_retrieval");
    workflow.addEdge("execute_retrieval", "generate_content");
    workflow.addEdge("generate_content", "render_report");
    workflow.addEdge("render_report", END);

    return workflow.compile();
}

