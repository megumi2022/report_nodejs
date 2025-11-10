import { createAgent } from "langchain";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import * as dotenv from "dotenv";

// 加载环境变量
dotenv.config();

// 从环境变量获取配置
const QWEN_API_BASE = process.env.QWEN_API_BASE;
const QWEN_API_KEY = process.env.QWEN_API_KEY;

// 验证环境变量
if (!QWEN_API_BASE) {
    console.error("❌ 错误: 缺少 QWEN_API_BASE 环境变量");
    process.exit(1);
}
if (!QWEN_API_KEY) {
    console.error("❌ 错误: 缺少 QWEN_API_KEY 环境变量");
    process.exit(1);
}

// 将 QWEN_* 环境变量映射为 OpenAI 兼容变量
if (!process.env.OPENAI_API_KEY && QWEN_API_KEY) {
    process.env.OPENAI_API_KEY = QWEN_API_KEY;
}
if (!process.env.OPENAI_BASE_URL && QWEN_API_BASE) {
    process.env.OPENAI_BASE_URL = QWEN_API_BASE;
}

console.log("🔗 测试模型连接...");
console.log("API Base URL:", QWEN_API_BASE);
console.log("API Key:", QWEN_API_KEY ? `${QWEN_API_KEY.substring(0, 10)}...` : "未设置");
console.log("\n");

// 创建 agent
const agent = createAgent({
    model: "openai:qwen3-32B",
});

// 测试函数
async function testModel() {
    try {
        console.log("📝 发送测试消息...");
        console.log("消息内容: 你好，请简单介绍一下你自己\n");

        const result = await agent.invoke({
            messages: [
                new SystemMessage("你是一个专业的 AI 助理。"),
                new HumanMessage("你好，请简单介绍一下你自己"),
            ],
        });

        const lastMessage = result.messages[result.messages.length - 1];
        const content = typeof lastMessage.content === "string"
            ? lastMessage.content
            : JSON.stringify(lastMessage.content);

        console.log("✅ 模型连接成功！");
        console.log("\n📄 模型回复:");
        console.log("─".repeat(50));
        console.log(content);
        console.log("─".repeat(50));

        return true;
    } catch (error: any) {
        console.error("❌ 模型连接失败:");
        console.error("错误类型:", error.constructor.name);
        console.error("错误消息:", error.message);
        if (error.status) {
            console.error("HTTP 状态码:", error.status);
        }
        if (error.response) {
            console.error("响应详情:", JSON.stringify(error.response, null, 2));
        }
        return false;
    }
}

// 执行测试
testModel()
    .then((success) => {
        if (success) {
            console.log("\n✅ 测试完成：模型连接正常");
            process.exit(0);
        } else {
            console.log("\n❌ 测试失败：模型连接异常");
            process.exit(1);
        }
    })
    .catch((error) => {
        console.error("\n❌ 测试过程中发生未预期的错误:", error);
        process.exit(1);
    });

