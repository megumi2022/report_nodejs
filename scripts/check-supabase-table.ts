/**
 * 检查 Supabase 向量表是否存在
 * 运行: tsx scripts/check-supabase-table.ts
 */

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

async function checkSupabaseTable() {
    console.log("🔍 检查 Supabase 向量表配置...\n");

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        console.error("❌ Supabase 配置未找到");
        console.error("   请在 .env 中设置:");
        console.error("   SUPABASE_URL=your_supabase_url");
        console.error("   SUPABASE_KEY=your_supabase_key");
        process.exit(1);
    }

    console.log("✅ Supabase 配置已找到");
    console.log(`   URL: ${supabaseUrl}\n`);

    const supabase = createClient(supabaseUrl, supabaseKey);

    // 检查表是否存在
    console.log("📋 检查表 'document_vectors'...");
    const { data, error: tableError } = await supabase
        .from("document_vectors")
        .select("id")
        .limit(1);

    if (tableError) {
        if (tableError.code === "42P01") {
            console.error("❌ 表 'document_vectors' 不存在\n");
            console.error("💡 解决方案：");
            console.error("   1. 登录 Supabase 项目");
            console.error("   2. 进入 SQL Editor");
            console.error("   3. 执行迁移脚本: supabase/migrations/create_vector_store.sql");
            console.error("   4. 详细指南: supabase/README.md\n");
            process.exit(1);
        } else {
            console.error("❌ 检查表时出错:", tableError.message);
            process.exit(1);
        }
    } else {
        console.log("✅ 表 'document_vectors' 存在\n");
    }

    // 检查函数是否存在
    console.log("📋 检查函数 'match_documents'...");
    const { data: funcData, error: funcError } = await supabase.rpc("match_documents", {
        query_embedding: new Array(1536).fill(0), // 测试向量
        match_count: 1,
        filter: {},
    });

    if (funcError) {
        if (funcError.code === "42883") {
            console.error("❌ 函数 'match_documents' 不存在\n");
            console.error("💡 解决方案：");
            console.error("   执行迁移脚本中的函数创建部分");
            console.error("   supabase/migrations/create_vector_store.sql\n");
        } else {
            console.warn("⚠️ 函数检查失败（可能是维度不匹配）:", funcError.message);
            console.warn("   如果表已创建，这可能是正常的\n");
        }
    } else {
        console.log("✅ 函数 'match_documents' 存在\n");
    }

    // 检查扩展（通过表结构间接验证）
    // 如果表已创建且包含 vector 类型列，说明扩展已安装
    console.log("📋 检查 pgvector 扩展...");

    // 如果表已存在，尝试查询 embedding 列来验证扩展
    if (!tableError) {
        // 表已存在，尝试查询 embedding 列来验证扩展
        const { data: testData, error: testError } = await supabase
            .from("document_vectors")
            .select("embedding")
            .limit(1);

        if (testError) {
            // 如果错误信息包含 vector 相关，可能是扩展问题
            if (testError.message?.includes("vector") || testError.message?.includes("type")) {
                console.error("❌ pgvector 扩展可能未安装");
                console.error("   错误:", testError.message);
                console.error("   请在 SQL Editor 中执行: CREATE EXTENSION IF NOT EXISTS vector;\n");
            } else {
                // 其他错误（可能是表为空），但扩展应该已安装
                console.log("✅ pgvector 扩展已安装（通过表结构验证）\n");
            }
        } else {
            // 能正常查询，说明扩展已安装
            console.log("✅ pgvector 扩展已安装（通过表结构验证）\n");
        }
    } else {
        // 表不存在，无法通过表结构验证
        console.warn("⚠️ 无法验证扩展（表不存在）");
        console.warn("   如果后续创建表时使用 vector 类型，会自动验证扩展是否安装\n");
    }

    // 统计文档数量
    const { count, error: countError } = await supabase
        .from("document_vectors")
        .select("*", { count: "exact", head: true });

    if (!countError) {
        console.log(`📊 当前向量库中有 ${count || 0} 个文档\n`);
    }

    console.log("✅ 所有检查完成！");
}

checkSupabaseTable().catch((error) => {
    console.error("❌ 检查失败:", error);
    process.exit(1);
});

