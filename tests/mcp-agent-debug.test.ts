/**
 * Agent 调用工具调试测试
 * 用于诊断 400 错误的原因
 */

import { MCPAgentPipeline } from "../src/agents/mcp-pipeline.ts";
import * as dotenv from "dotenv";

dotenv.config();

async function debugAgentError() {
    console.log("🔍 Agent 调用工具调试测试\n");
    console.log("=".repeat(50));

    try {
        const pipeline = new MCPAgentPipeline();
        await pipeline.initialize();

        const allTools = pipeline.getTools();
        console.log(`\n📊 工具统计:`);
        console.log(`   总工具数: ${allTools.length}`);

        // 分析工具 schema 复杂度
        let complexSchemas = 0;
        let simpleSchemas = 0;

        allTools.forEach(tool => {
            const schema = tool.schema as any;
            if (schema && schema._def) {
                const def = schema._def;
                if (def.typeName === 'ZodObject') {
                    const keys = Object.keys(def.shape() || {});
                    if (keys.length > 5) {
                        complexSchemas++;
                    } else {
                        simpleSchemas++;
                    }
                }
            }
        });

        console.log(`   简单 schema: ${simpleSchemas}`);
        console.log(`   复杂 schema: ${complexSchemas}`);

        // 测试 1：不带工具的基础调用
        console.log("\n" + "=".repeat(50));
        console.log("测试 1: 不带工具的基础调用\n");

        const model = new (await import("@langchain/openai")).ChatOpenAI({
            model: process.env.MODEL_NAME || "qwen3-32b",
            apiKey: process.env.QWEN_API_KEY,
            configuration: { baseURL: process.env.QWEN_API_BASE },
        });

        try {
            const result = await model.invoke([{ role: "user", content: "你好" }]);
            console.log("✅ 基础调用成功:", result.content);
        } catch (error) {
            console.error("❌ 基础调用失败:", error);
            console.error("   这说明模型配置有问题，不是工具的问题");
            return;
        }

        // 测试 2：单个工具
        console.log("\n" + "=".repeat(50));
        console.log("测试 2: 单个工具\n");

        const { createAgent, tool } = await import("langchain");
        const { z } = await import("zod");

        const singleTool = tool(
            async () => "test",
            { name: "test_tool", description: "test", schema: z.object({}) }
        );

        try {
            const agent = createAgent({ model, tools: [singleTool] });
            const result = await agent.invoke({
                messages: [{ role: "user", content: "调用 test_tool" }],
            });
            console.log("✅ 单个工具调用成功");
        } catch (error) {
            console.error("❌ 单个工具调用失败:", error);
            console.error("   这说明模型不支持 function calling");
            return;
        }

        // 测试 3：逐步增加工具数量
        console.log("\n" + "=".repeat(50));
        console.log("测试 3: 逐步增加工具数量\n");

        const tools = pipeline.getTools();
        for (let count of [1, 3, 5, 10, 15, 20]) {
            if (count > tools.length) break;

            console.log(`\n测试 ${count} 个工具...`);
            try {
                const testAgent = createAgent({
                    model,
                    tools: tools.slice(0, count),
                });

                const result = await testAgent.invoke({
                    messages: [{ role: "user", content: "你好" }],
                });
                console.log(`✅ ${count} 个工具: 成功`);
            } catch (error: any) {
                console.log(`❌ ${count} 个工具: 失败`);
                if (error.message?.includes("400")) {
                    console.log(`   ⚠️  达到工具数量限制，最大支持约 ${count - 1} 个工具`);
                    break;
                }
            }
        }

    } catch (error) {
        console.error("❌ 调试失败:", error);
    }
}

if (process.argv[1] && process.argv[1].endsWith("mcp-agent-debug.test.ts")) {
    debugAgentError().catch(console.error);
}

export { debugAgentError };

