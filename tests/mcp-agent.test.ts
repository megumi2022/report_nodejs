/**
 * 测试 Agent 调用 MCP 工具
 * 测试 LangChain Agent 是否能正确调用 Playwright 等 MCP 工具
 */

import { MCPAgentPipeline } from "../src/agents/mcp-pipeline.ts";
import * as dotenv from "dotenv";

dotenv.config();

async function testAgentWithMCP() {
    console.log("🚀 测试 Agent 调用 MCP 工具\n");
    console.log("=".repeat(50));

    try {
        // 1. 创建 Pipeline
        console.log("📦 创建 Pipeline...");
        const pipeline = new MCPAgentPipeline();

        // 2. 初始化（自动发现和加载工具）
        console.log("\n🔍 初始化 Pipeline（发现工具）...");
        await pipeline.initialize();

        // 3. 显示已加载的工具
        const tools = pipeline.getTools();
        console.log(`\n✅ 已加载 ${tools.length} 个工具:`);
        tools.forEach((tool) => {
            console.log(`  - ${tool.name}: ${tool.description}`);
        });

        // 4. 检查是否有 playwright 相关的工具
        const playwrightTools = tools.filter((tool) =>
            tool.name.toLowerCase().includes("playwright")
        );

        if (playwrightTools.length === 0) {
            console.log("\n⚠️  未找到 Playwright 相关工具");
            console.log("请确保：");
            console.log("  1. Playwright MCP Server 已正确配置（mcp/config.ts）");
            console.log("  2. Playwright MCP Server 已启用（enabled: true）");
            console.log("  3. Playwright MCP Server 连接成功");
            return;
        }

        console.log(`\n🎭 找到 ${playwrightTools.length} 个 Playwright 工具:`);
        playwrightTools.forEach((tool) => {
            console.log(`  - ${tool.name}`);
        });

        // 5. 测试 Agent 调用 Playwright
        console.log("\n" + "=".repeat(50));
        console.log("🤖 测试 Agent 调用 Playwright 工具\n");

        const testQueries = [
            "使用 playwright 工具打开百度首页",
            "用 playwright 导航到 https://www.baidu.com 并获取页面标题",
        ];

        for (const query of testQueries) {
            console.log(`\n📝 测试查询: "${query}"`);
            console.log("-".repeat(50));

            try {
                const result = await pipeline.execute(
                    query,
                    "你是一个专业的助手，可以使用 Playwright 工具进行网页操作。"
                );

                console.log("\n✅ Agent 回复:");
                console.log(result);
            } catch (error) {
                console.error("\n❌ 执行失败:", error);
            }

            // 等待一下，避免请求过快
            await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        // 6. 测试直接调用工具（不通过 Agent）
        console.log("\n" + "=".repeat(50));
        console.log("🔧 测试直接调用 Playwright 工具\n");

        const manager = pipeline.getMCPManager();
        const playwrightClient = manager.getClient("playwright");

        if (playwrightClient) {
            try {
                const tools = await playwrightClient.listTools();
                console.log(`Playwright 可用工具: ${tools.map((t) => t.name).join(", ")}`);

                if (tools.length > 0) {
                    const firstTool = tools[0];
                    console.log(`\n工具示例: ${firstTool.name}`);
                    console.log(`工具描述: ${firstTool.description || "无描述"}`);
                }
            } catch (error) {
                console.error("获取工具列表失败:", error);
            }
        }

        // 7. 清理
        console.log("\n" + "=".repeat(50));
        console.log("🧹 清理资源...");
        await manager.disconnectAll();
        console.log("✅ 测试完成");

    } catch (error) {
        console.error("\n❌ 测试失败:", error);
        if (error instanceof Error) {
            console.error("错误详情:", error.message);
            console.error("堆栈:", error.stack);
        }
        process.exit(1);
    }
}

// 运行测试
if (process.argv[1] && process.argv[1].endsWith("mcp-agent.test.ts")) {
    testAgentWithMCP().catch(console.error);
}

export { testAgentWithMCP };

