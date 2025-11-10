/**
 * 测试直接调用 MCP 工具（不通过 Agent）
 * 用于验证工具本身是否正常工作
 */

import { MCPClientManager } from "../mcp/index.ts";
import { MCPServerConfig } from "../mcp/types.ts";
import * as dotenv from "dotenv";

dotenv.config();

async function testDirectToolCall() {
    console.log("🚀 测试直接调用 MCP 工具\n");
    console.log("=".repeat(50));

    try {
        // 创建管理器并只注册 playwright
        const manager = new MCPClientManager();
        const playwrightConfig: MCPServerConfig = {
            type: "stdio",
            name: "playwright",
            command: "npx",
            args: ["@playwright/mcp@latest"],
            enabled: true,
        };
        manager.registerServer(playwrightConfig);

        // 连接
        console.log("\n📡 连接 Playwright MCP Server...");
        await manager.connectServer("playwright");
        const client = manager.getClient("playwright");

        if (!client) {
            throw new Error("无法连接到 Playwright");
        }

        // 获取工具列表
        console.log("\n🔍 获取工具列表...");
        const tools = await client.listTools();
        console.log(`✅ 获取到 ${tools.length} 个工具\n`);

        // 显示所有工具
        console.log("📋 可用工具:");
        tools.forEach((tool, index) => {
            console.log(`  ${index + 1}. ${tool.name}: ${tool.description || "无描述"}`);
        });

        // 测试导航工具
        console.log("\n" + "=".repeat(50));
        console.log("🧪 测试 browser_navigate 工具\n");

        const navigateTool = tools.find((t) => t.name === "browser_navigate");
        if (!navigateTool) {
            console.log("❌ 未找到 browser_navigate 工具");
            console.log("可用工具:", tools.map((t) => t.name).join(", "));
            return;
        }

        console.log(`工具名称: ${navigateTool.name}`);
        console.log(`工具描述: ${navigateTool.description || "无描述"}`);
        console.log(`工具 Schema:`, JSON.stringify(navigateTool.inputSchema, null, 2));

        // 尝试调用工具
        console.log("\n🔧 尝试调用工具...");
        try {
            const result = await client.callTool("browser_navigate", {
                url: "https://www.baidu.com",
            });
            console.log("✅ 工具调用成功");
            console.log("结果:", JSON.stringify(result, null, 2));
        } catch (error) {
            console.error("❌ 工具调用失败:", error);
            if (error instanceof Error) {
                console.error("错误详情:", error.message);
            }
        }

        // 清理
        console.log("\n🧹 清理资源...");
        await manager.disconnectAll();
        console.log("✅ 测试完成");

    } catch (error) {
        console.error("❌ 测试失败:", error);
        if (error instanceof Error) {
            console.error("错误详情:", error.message);
            console.error("堆栈:", error.stack);
        }
        process.exit(1);
    }
}

// 运行测试
if (process.argv[1] && process.argv[1].endsWith("mcp-direct.test.ts")) {
    testDirectToolCall().catch(console.error);
}

export { testDirectToolCall };

