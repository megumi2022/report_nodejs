/**
 * 测试统一的 MCP Client Manager
 * 测试连接、工具发现、资源访问等功能
 */

import { MCPClientManager } from "../mcp/index.ts";
import { mcpServerConfigs } from "../mcp/config.ts";

async function testMCPManager() {
    console.log("🚀 测试统一的 MCP Client Manager\n");
    console.log("=".repeat(50));

    const manager = new MCPClientManager();

    // 注册配置
    manager.registerServers(mcpServerConfigs);

    // 显示所有配置
    console.log("\n📋 已注册的 MCP Server:");
    manager.getConfigs().forEach((config) => {
        console.log(
            `  - ${config.name} (${config.type})${config.enabled === false ? " [禁用]" : ""}: ${config.description || "无描述"}`
        );
    });

    // 测试所有 Server
    const results = await manager.testAllServers();

    // 显示结果
    console.log("\n" + "=".repeat(50));
    console.log("📊 测试报告\n");

    let successCount = 0;
    let failCount = 0;

    results.forEach((status, name) => {
        if (status.connected) {
            successCount++;
            console.log(`✅ ${name} (${status.type})`);
            console.log(`   工具: ${status.tools || 0} | 资源: ${status.resources || 0}`);
        } else {
            failCount++;
            console.log(`❌ ${name} (${status.type})`);
            if (status.error) {
                console.log(`   错误: ${status.error}`);
            }
        }
    });

    console.log(`\n总计: ${successCount} 成功, ${failCount} 失败\n`);

    // 清理
    await manager.disconnectAll();
    console.log("✅ 已断开所有连接");
}

// 运行测试
if (process.argv[1] && process.argv[1].endsWith("mcp-manager.test.ts")) {
    testMCPManager().catch((error) => {
        console.error("❌ 测试失败:", error);
        process.exit(1);
    });
}

export { testMCPManager };

