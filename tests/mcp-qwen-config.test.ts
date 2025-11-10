/**
 * 测试 Qwen3-32B 的工具调用配置
 * 用于诊断和验证正确的配置方式
 */

import { ChatOpenAI } from "@langchain/openai";
import { createAgent, tool } from "langchain";
import { z } from "zod";
import * as dotenv from "dotenv";

dotenv.config();

async function testQwenConfig() {
    console.log("🔍 测试 Qwen3-32B 工具调用配置\n");
    console.log("=".repeat(50));

    // 测试 1: 基础模型调用（不带工具）
    console.log("\n测试 1: 基础模型调用（不带工具）\n");

    const model = new ChatOpenAI({
        model: process.env.MODEL_NAME || "qwen3-32b",
        temperature: 0.7,
        apiKey: process.env.QWEN_API_KEY,
        configuration: {
            baseURL: process.env.QWEN_API_BASE,
        },
    });

    try {
        const result = await model.invoke([{ role: "user", content: "你好" }]);
        console.log("✅ 基础调用成功:", result.content);
    } catch (error: any) {
        console.error("❌ 基础调用失败:", error.message);
        console.error("   这说明模型配置有问题");
        return;
    }

    // 测试 2: 使用 bindTools 方式（而不是 createAgent）
    console.log("\n" + "=".repeat(50));
    console.log("测试 2: 使用 bindTools 方式\n");

    const simpleTool = tool(
        async () => "test result",
        {
            name: "test_tool",
            description: "A simple test tool",
            schema: z.object({}),
        }
    );

    try {
        // 方式 1: 使用 bindTools
        const modelWithTool = model.bindTools([simpleTool]);
        const response = await modelWithTool.invoke([
            { role: "user", content: "请调用 test_tool 工具" },
        ]);

        console.log("✅ bindTools 调用成功");
        console.log("响应:", response.content);

        // 检查是否有 tool_calls
        if (response.tool_calls && response.tool_calls.length > 0) {
            console.log("✅ 检测到工具调用:", response.tool_calls);
        } else {
            console.log("⚠️  未检测到工具调用，但请求成功");
        }
    } catch (error: any) {
        console.error("❌ bindTools 失败:", error.message);
        if (error.status === 400) {
            console.error("\n💡 可能的原因：");
            console.error("   1. 模型后端未启用工具调用功能");
            console.error("   2. 需要添加 --enable-auto-tool-choice 参数");
            console.error("   3. 需要指定 --tool-call-parser 参数");
            console.error("   4. API 格式不兼容");
        }
    }

    // 测试 3: 使用 createAgent（标准方式）
    console.log("\n" + "=".repeat(50));
    console.log("测试 3: 使用 createAgent（标准方式）\n");

    try {
        const agent = createAgent({
            model: model,
            tools: [simpleTool],
        });

        const result = await agent.invoke({
            messages: [{ role: "user", content: "请调用 test_tool" }],
        });

        console.log("✅ createAgent 调用成功");
        console.log("结果:", result.messages[result.messages.length - 1].content);
    } catch (error: any) {
        console.error("❌ createAgent 失败:", error.message);

        if (error.status === 400) {
            console.error("\n💡 诊断信息：");
            console.error("   错误状态:", error.status);
            console.error("   错误类型:", error.constructor.name);

            // 尝试获取更多错误信息
            if (error.body) {
                console.error("   错误响应体:", error.body);
            }

            console.error("\n💡 解决方案：");
            console.error("   1. 检查模型后端是否启用了工具调用：");
            console.error("      --enable-auto-tool-choice");
            console.error("   2. 检查工具调用解析器：");
            console.error("      --tool-call-parser hermes 或 pythonic");
            console.error("   3. 确认 API 端点支持 OpenAI 兼容格式");
            console.error("   4. 检查模型名称是否正确（qwen3-32b vs qwen3-32B）");
        }
    }

    // 测试 4: 检查模型名称大小写
    console.log("\n" + "=".repeat(50));
    console.log("测试 4: 尝试不同的模型名称格式\n");

    const modelVariants = [
        "qwen3-32b",
        "qwen3-32B",
        "Qwen3-32B",
        "qwen-32b",
    ];

    for (const modelName of modelVariants) {
        console.log(`\n尝试模型名称: ${modelName}`);
        try {
            const testModel = new ChatOpenAI({
                model: modelName,
                temperature: 0.7,
                apiKey: process.env.QWEN_API_KEY,
                configuration: {
                    baseURL: process.env.QWEN_API_BASE,
                },
            });

            const result = await testModel.invoke([{ role: "user", content: "你好" }]);
            console.log(`✅ ${modelName}: 成功`);
        } catch (error: any) {
            console.log(`❌ ${modelName}: ${error.message}`);
        }
    }
}

if (process.argv[1] && process.argv[1].endsWith("mcp-qwen-config.test.ts")) {
    testQwenConfig().catch(console.error);
}

export { testQwenConfig };

