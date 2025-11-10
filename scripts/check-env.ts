#!/usr/bin/env tsx
/**
 * 环境变量配置检查脚本
 * 用于验证 .env 文件中的配置是否完整
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

interface ConfigCheck {
    name: string;
    envVar: string;
    required: boolean;
    description: string;
    value?: string;
}

const configs: ConfigCheck[] = [
    // LLM 配置
    {
        name: "模型名称",
        envVar: "MODEL_NAME",
        required: true,
        description: "LLM 模型名称（如 qwen3-32b）",
    },
    {
        name: "API Key",
        envVar: "QWEN_API_KEY",
        required: true,
        description: "QWEN API Key（或 OPENAI_API_KEY）",
    },
    {
        name: "API Base URL",
        envVar: "QWEN_API_BASE",
        required: true,
        description: "API Base URL（或 OPENAI_BASE_URL）",
    },
    {
        name: "模型温度",
        envVar: "TEMPERATURE",
        required: false,
        description: "模型温度（默认 0.7）",
    },
    // Embedding 配置
    {
        name: "Embedding 模型",
        envVar: "EMBEDDING_MODEL",
        required: false,
        description: "Embedding 模型名称（默认 text-embedding-v4）",
    },
    {
        name: "DashScope API Key",
        envVar: "DASHSCOPE_API_KEY",
        required: false,
        description: "DashScope API Key（用于 embedding 和 reranker）",
    },
    {
        name: "DashScope Base URL",
        envVar: "DASHSCOPE_BASE_URL",
        required: false,
        description: "DashScope Base URL（用于 embedding）",
    },
    // Reranker 配置
    {
        name: "Reranker Base URL",
        envVar: "RERANKER_BASE_URL",
        required: false,
        description: "Reranker API Base URL",
    },
    // Supabase 配置
    {
        name: "Supabase URL",
        envVar: "SUPABASE_URL",
        required: false,
        description: "Supabase 项目 URL",
    },
    {
        name: "Supabase Key",
        envVar: "SUPABASE_KEY",
        required: false,
        description: "Supabase API Key",
    },
    {
        name: "向量存储类型",
        envVar: "VECTOR_STORE_TYPE",
        required: false,
        description: "向量存储类型（memory 或 supabase，默认 memory）",
    },
];

function checkEnvFile(): boolean {
    const envPath = path.join(process.cwd(), ".env");
    const envExamplePath = path.join(process.cwd(), ".env.example");

    if (!fs.existsSync(envPath)) {
        console.error("❌ .env 文件不存在\n");
        if (fs.existsSync(envExamplePath)) {
            console.log("💡 请执行以下命令创建 .env 文件：");
            console.log("   cp .env.example .env\n");
        } else {
            console.log("💡 请创建 .env 文件并配置必要的环境变量\n");
        }
        return false;
    }
    return true;
}

function checkConfig(): { passed: boolean; missing: string[] } {
    const missing: string[] = [];
    let passed = true;

    console.log("🔍 检查环境变量配置...\n");

    for (const config of configs) {
        const value = process.env[config.envVar];
        config.value = value;

        if (config.required && !value) {
            // 检查是否有替代变量
            let hasAlternative = false;
            if (config.envVar === "QWEN_API_KEY" && process.env.OPENAI_API_KEY) {
                hasAlternative = true;
            } else if (config.envVar === "QWEN_API_BASE" && process.env.OPENAI_BASE_URL) {
                hasAlternative = true;
            }

            if (!hasAlternative) {
                console.log(`❌ ${config.name} (${config.envVar}): 未配置`);
                console.log(`   ${config.description}\n`);
                missing.push(config.envVar);
                passed = false;
            } else {
                const altVar = config.envVar === "QWEN_API_KEY" ? "OPENAI_API_KEY" : "OPENAI_BASE_URL";
                console.log(`✅ ${config.name} (${config.envVar}): 使用替代变量 ${altVar}`);
            }
        } else if (value) {
            // 显示已配置的值（隐藏敏感信息）
            if (config.envVar.includes("KEY") || config.envVar.includes("SECRET")) {
                const preview = value.length > 8 
                    ? `${value.substring(0, 8)}...${value.substring(value.length - 4)}`
                    : "***";
                console.log(`✅ ${config.name} (${config.envVar}): ${preview}`);
            } else {
                console.log(`✅ ${config.name} (${config.envVar}): ${value}`);
            }
        } else if (!config.required) {
            const defaultValue = config.envVar === "TEMPERATURE" ? "0.7" :
                               config.envVar === "EMBEDDING_MODEL" ? "text-embedding-v4" :
                               config.envVar === "VECTOR_STORE_TYPE" ? "memory" :
                               "未配置";
            console.log(`ℹ️  ${config.name} (${config.envVar}): ${defaultValue} (可选)`);
        }
    }

    return { passed, missing };
}

function checkFeatureSupport(): void {
    console.log("\n📋 功能支持检查：\n");

    // RAG 功能
    const hasEmbedding = !!(process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY);
    const hasEmbeddingBase = !!(process.env.DASHSCOPE_BASE_URL || process.env.QWEN_API_BASE || process.env.OPENAI_BASE_URL);
    if (hasEmbedding && hasEmbeddingBase) {
        console.log("✅ RAG 功能：已配置（支持 PDF 向量检索）");
    } else {
        console.log("⚠️  RAG 功能：未完全配置（需要 DASHSCOPE_API_KEY 和 DASHSCOPE_BASE_URL）");
    }

    // Reranker 功能
    const hasReranker = !!(process.env.DASHSCOPE_API_KEY && process.env.RERANKER_BASE_URL);
    if (hasReranker) {
        console.log("✅ Reranker 功能：已配置（提升检索精度）");
    } else {
        console.log("ℹ️  Reranker 功能：未配置（可选，建议配置以提升检索精度）");
    }

    // Supabase 功能
    const hasSupabase = !!(process.env.SUPABASE_URL && process.env.SUPABASE_KEY);
    const vectorStoreType = process.env.VECTOR_STORE_TYPE || "memory";
    if (hasSupabase && vectorStoreType === "supabase") {
        console.log("✅ Supabase 向量存储：已配置（持久化存储）");
    } else if (hasSupabase) {
        console.log("ℹ️  Supabase：已配置但未启用（设置 VECTOR_STORE_TYPE=supabase 启用）");
    } else {
        console.log("ℹ️  Supabase：未配置（使用内存存储，适合开发/测试）");
    }
}

async function main() {
    console.log("=".repeat(60));
    console.log("🔧 环境变量配置检查工具");
    console.log("=".repeat(60));
    console.log();

    // 检查 .env 文件是否存在
    if (!checkEnvFile()) {
        process.exit(1);
    }

    // 检查配置
    const { passed, missing } = checkConfig();

    // 功能支持检查
    checkFeatureSupport();

    // 总结
    console.log("\n" + "=".repeat(60));
    if (passed) {
        console.log("✅ 所有必需配置已就绪！");
        console.log("\n💡 提示：");
        console.log("   - 运行 'pnpm test:mcp:manager' 测试 MCP 连接");
        console.log("   - 运行 'pnpm test:rag' 测试 RAG 系统");
        console.log("   - 运行 'pnpm check:supabase' 检查 Supabase 配置（如果使用）");
    } else {
        console.log("❌ 配置不完整，请补充以下必需配置：");
        missing.forEach((envVar) => {
            console.log(`   - ${envVar}`);
        });
        console.log("\n💡 提示：参考 .env.example 文件了解详细配置说明");
        process.exit(1);
    }
    console.log("=".repeat(60));
}

main().catch((error) => {
    console.error("❌ 检查失败:", error);
    process.exit(1);
});

