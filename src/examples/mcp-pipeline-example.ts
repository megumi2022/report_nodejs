/**
 * MCP Agent Pipeline 使用示例
 */

import { MCPAgentPipeline } from "../agents/mcp-pipeline.ts";
import * as dotenv from "dotenv";

dotenv.config();

async function example() {
    // 1. 创建 Pipeline
    const pipeline = new MCPAgentPipeline();

    // 2. 初始化（自动发现和加载工具）
    await pipeline.initialize();

    // 3. 执行任务
    const result = await pipeline.execute(
        "使用 playwright 打开百度首页",
        "你是一个专业的助手，可以使用 Playwright 工具进行网页操作。"
    );

    console.log("结果:", result);

    // 4. 查看已加载的工具
    const tools = pipeline.getTools();
    console.log(`已加载 ${tools.length} 个工具`);

    // 5. 直接调用工具（不通过 Agent）
    try {
        const directResult = await pipeline.callToolDirectly(
            "playwright",
            "browser_navigate",
            { url: "https://www.baidu.com" }
        );
        console.log("直接调用结果:", directResult);
    } catch (error) {
        console.error("直接调用失败:", error);
    }
}

// 如果直接运行此文件
if (process.argv[1] && process.argv[1].endsWith("mcp-pipeline-example.ts")) {
    example().catch(console.error);
}

export { example };

