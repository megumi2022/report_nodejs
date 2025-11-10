/**
 * 报告生成工作流使用示例
 */

import { ReportGenerationWorkflow } from "../workflows/report-workflow.ts";
import * as dotenv from "dotenv";

dotenv.config();

async function example() {
    // 1. 创建工作流实例
    const workflow = new ReportGenerationWorkflow();

    // 2. 初始化所有服务
    console.log("🔧 初始化工作流...");
    await workflow.initialize();

    // 3. 准备输入数据
    const input = {
        excelPath: "/path/to/excel.xlsx", // Excel 文件路径
        projectBackground: {
            projectName: "示例项目",
            projectType: "政府投资项目",
            location: "某市",
            // ... 其他项目背景信息
        },
        templateKey: "feasibility_v1", // 模板键
        projectId: "PRJP00120250001", // 项目ID
    };

    // 4. 生成报告
    console.log("📝 开始生成报告...");
    try {
        const reportContent = await workflow.generateReport(input);

        // 5. 渲染为不同格式
        console.log("📄 渲染报告...");

        // Markdown 格式
        const markdown = workflow.renderToMarkdown(reportContent);
        console.log("\n=== Markdown 报告 ===");
        console.log(markdown);

        // HTML 格式
        const html = workflow.renderToHTML(reportContent);
        console.log("\n=== HTML 报告 ===");
        console.log(html.substring(0, 500) + "..."); // 只显示前500字符

        // 6. 可以保存到文件
        // await Deno.writeTextFile("report.md", markdown);
        // await Deno.writeTextFile("report.html", html);

        console.log("\n✅ 报告生成完成！");
    } catch (error: any) {
        console.error("❌ 报告生成失败:", error.message);
    }
}

// 如果直接运行此文件
if (process.argv[1] && process.argv[1].endsWith("report-generation-example.ts")) {
    example().catch(console.error);
}

export { example };

