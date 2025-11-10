/**
 * RAG 系统测试 - 测试完整的文档解析、索引、检索和引用流程
 */

import "dotenv/config";
import path from "path";
import { DocumentLoader } from "../src/services/document-loader.ts";
import { VectorStoreService } from "../src/services/vector-store-service.ts";
import { CitationService } from "../src/services/citation-service.ts";
import { RetrievalService } from "../src/services/retrieval-service.ts";
import { OutputManager } from "../src/tools/output-manager.ts";
import * as fs from "fs/promises";

const TEST_PROJECT_ID = "TEST-RAG-2025-0001";

// 测试文件路径
const EXCEL_PATH = path.resolve(
    "data/九江市八里湖新区九龙村农村产业融合示范园建设项目.xlsx"
);
// tests/rag-system.test.ts 第 20 行
const PDF_PATH = path.resolve("data/全国乡村产业发展规划（2020‑2025年）（农业农村部印发）.pdf");

async function testDocumentLoading() {
    console.log("\n📄 测试 1: 文档加载\n");

    const loader = new DocumentLoader(500, 50);

    // 测试 Excel 加载
    if (await fileExists(EXCEL_PATH)) {
        console.log("加载 Excel 文件...");
        const excelDocs = await loader.loadExcel(EXCEL_PATH);
        console.log(`✅ Excel 加载成功: ${excelDocs.length} 个文档块`);
        console.log(`   示例文档:`, excelDocs[0]?.pageContent.substring(0, 100) + "...");
        console.log(`   元数据:`, excelDocs[0]?.metadata);
    } else {
        console.log("⚠️ Excel 文件不存在，跳过");
    }

    // 测试 PDF 加载
    if (await fileExists(PDF_PATH)) {
        console.log("\n加载 PDF 文件...");
        const pdfDocs = await loader.loadPDF(PDF_PATH);
        console.log(`✅ PDF 加载成功: ${pdfDocs.length} 个文档块`);
        console.log(`   示例文档:`, pdfDocs[0]?.pageContent.substring(0, 100) + "...");
        console.log(`   元数据:`, pdfDocs[0]?.metadata);
    } else {
        console.log("⚠️ PDF 文件不存在，跳过（请上传 data/全国乡村产业发展规划（2020‑2025年）（农业农村部印发）.pdf）");
    }
}

async function testVectorIndexing() {
    console.log("\n🔍 测试 2: 向量索引构建（仅 PDF）\n");
    console.log("📌 注意：Excel 使用传统检索方式，不进行 embedding\n");

    const loader = new DocumentLoader(500, 50);
    const vectorStore = new VectorStoreService();
    await vectorStore.initialize();

    // 只加载 PDF 文档到向量库（Excel 使用传统方式，不需要 embedding）
    const pdfDocuments: any[] = [];

    if (await fileExists(PDF_PATH)) {
        const pdfDocs = await loader.loadPDF(PDF_PATH);
        pdfDocuments.push(...pdfDocs);
        console.log(`✅ 加载 PDF: ${pdfDocs.length} 个文档块`);
    }

    if (pdfDocuments.length === 0) {
        console.log("⚠️ 没有可用的 PDF 文档，跳过索引测试");
        return;
    }

    console.log(`\n开始构建向量索引（共 ${pdfDocuments.length} 个 PDF 文档块）...`);
    console.log("⏳ 这可能需要一些时间，取决于文档数量和 embedding API 速度...\n");
    console.log(`⚠️  注意：需要配置正确的环境变量`);
    console.log(`   Embedding 模型: ${process.env.EMBEDDING_MODEL || "text-embedding-v4"}`);
    console.log(`   API Key: ${process.env.DASHSCOPE_API_KEY ? "已设置" : "未设置 (DASHSCOPE_API_KEY)"}`);
    console.log(`   API Base: ${process.env.DASHSCOPE_BASE_URL || process.env.QWEN_API_BASE || process.env.OPENAI_BASE_URL || "未设置"}\n`);

    try {
        await vectorStore.addDocuments(pdfDocuments);
        const docCount = await vectorStore.getDocumentCount();
        console.log(`✅ 向量索引构建完成: ${docCount} 个 PDF 文档`);
        console.log(`💰 成本优化：仅对 PDF 做 embedding，节省约 ${((938 / (938 + 32)) * 100).toFixed(1)}% 的 embedding 成本`);
    } catch (error: any) {
        if (error.message?.includes("404") || error.message?.includes("Model not found")) {
            console.error(`\n❌ Embedding 模型未找到`);
            console.error(`   请检查 EMBEDDING_MODEL 环境变量是否正确`);
            console.error(`   或者确保 API 端点支持该模型\n`);
            throw error;
        }
        throw error;
    }

    return vectorStore;
}

async function testCitationMatching() {
    console.log("\n🔗 测试 3: 引用匹配（仅 PDF）\n");

    const retrievalService = new RetrievalService();
    await retrievalService.initialize();

    // 先构建索引（只对 PDF 做 embedding）
    const loader = new DocumentLoader(500, 50);
    const vectorStore = retrievalService.getVectorStore();

    const pdfDocuments: any[] = [];

    if (await fileExists(PDF_PATH)) {
        const pdfDocs = await loader.loadPDF(PDF_PATH);
        pdfDocuments.push(...pdfDocs);
        console.log(`✅ 加载 PDF: ${pdfDocs.length} 个文档块`);
    }

    if (pdfDocuments.length > 0) {
        await vectorStore.addDocuments(pdfDocuments);
        console.log(`✅ 向量索引构建完成\n`);
    } else {
        console.log("⚠️ 没有 PDF 文档，跳过引用匹配测试");
        return;
    }

    // 测试查询
    const queries = [
        "总投资估算中的工程费用",
        "项目技术经济指标",
        "资金平衡",
    ];

    for (const query of queries) {
        console.log(`\n查询: "${query}"`);
        const result = await retrievalService.retrieveFromVector(query, 5, 0.6);

        if (result.citations && result.citations.length > 0) {
            console.log(`✅ 找到 ${result.citations.length} 个引用:`);
            result.citations.forEach((citation, idx) => {
                console.log(
                    `   [${idx + 1}] ${citation.location} (相似度: ${citation.score.toFixed(3)})`
                );
                console.log(`       内容: ${citation.text.substring(0, 80)}...`);
            });
        } else {
            console.log("⚠️ 未找到相关引用");
        }
    }
}

async function testFullRAGFlow() {
    console.log("\n🚀 测试 4: 完整 RAG 流程（混合方式）\n");
    console.log("📌 Excel 使用传统检索，PDF 使用 RAG 检索\n");

    const retrievalService = new RetrievalService();
    await retrievalService.initialize();

    const loader = new DocumentLoader(500, 50);
    const vectorStore = retrievalService.getVectorStore();
    const citationService = retrievalService.getCitationService();

    // 步骤 1: 文档解析与索引（只对 PDF 做 embedding）
    console.log("步骤 1: 文档解析与索引");
    const pdfDocuments: any[] = [];

    if (await fileExists(EXCEL_PATH)) {
        const excelDocs = await loader.loadExcel(EXCEL_PATH);
        console.log(`  ✅ Excel: ${excelDocs.length} 个文档块（使用传统检索，不做 embedding）`);
    }

    if (await fileExists(PDF_PATH)) {
        const pdfDocs = await loader.loadPDF(PDF_PATH);
        pdfDocuments.push(...pdfDocs);
        console.log(`  ✅ PDF: ${pdfDocs.length} 个文档块（使用 RAG 检索）`);
    }

    if (pdfDocuments.length === 0) {
        console.log("⚠️ 没有可用的 PDF 文档，跳过完整流程测试");
        return;
    }

    await vectorStore.addDocuments(pdfDocuments);
    console.log(`  ✅ PDF 向量索引构建完成\n`);

    // 步骤 2: 引用匹配器 RAG（使用 reranker）
    console.log("步骤 2: 引用匹配器 RAG（使用 reranker）");
    const query = "总投资估算中的工程费用情况";
    // 使用 retrieveFromVector 而不是直接 similaritySearch，这样可以自动使用 reranker
    const result = await retrievalService.retrieveFromVector(query, 5, 0.6, true);
    const citations = result.citations || [];

    if (result.metadata?.usedReranker) {
        console.log(`  ✅ 使用 Reranker 精排序，找到 ${citations.length} 个相关引用`);
    } else {
        console.log(`  ⚠️ Reranker 未使用（可能未配置或不可用），找到 ${citations.length} 个相关引用`);
    }

    if (citations.length > 0) {
        console.log(`  引用详情:`);
        citations.slice(0, 3).forEach((citation, idx) => {
            console.log(`    [${idx + 1}] ${citation.location} (相似度: ${citation.score.toFixed(3)})`);
        });
    }
    console.log();

    // 步骤 3: 生成引用上下文
    console.log("步骤 3: 生成引用上下文");
    const citationContext = citationService.mergeCitationContext(citations);
    console.log(`  ✅ 引用上下文:\n${citationContext.substring(0, 300)}...\n`);

    // 步骤 4: 引用验证（模拟生成文本）
    console.log("步骤 4: 引用验证");
    const mockGeneratedText = `根据提供的资料，工程费用为17385.78万元，占总投资的比例为79.03%。`;
    const verifiedCitations = citationService.verifyCitations(
        citations,
        mockGeneratedText
    );
    console.log(
        `  ✅ 验证完成: ${verifiedCitations.filter((c) => c.verified).length}/${verifiedCitations.length} 个引用被使用\n`
    );

    // 步骤 5: 生成引用索引表
    console.log("步骤 5: 生成引用索引表");
    const citationIndex = citationService.generateCitationIndex(
        "section-1",
        "工程费用概述",
        verifiedCitations
    );

    // 保存输出
    const outputManager = new OutputManager(TEST_PROJECT_ID);
    const indexPath = await outputManager.saveNodeOutput(
        "citation_index",
        citationIndex
    );
    console.log(`  ✅ 引用索引表已保存: ${indexPath}\n`);

    return citationIndex;
}

async function testFieldSynonyms() {
    console.log("\n📚 测试 5: Excel 字段同义词匹配\n");

    const citationService = new CitationService();

    // 测试同义词
    const testFields = ["工程费用", "总投资", "建筑工程费"];

    for (const field of testFields) {
        const synonyms = citationService.getFieldSynonyms(field);
        console.log(`字段 "${field}" 的同义词:`, synonyms);
    }

    // 添加自定义同义词
    citationService.addFieldSynonyms("设备费用", ["设备购置费", "设备投资"]);
    console.log(
        `\n添加自定义同义词后，字段 "设备费用" 的同义词:`,
        citationService.getFieldSynonyms("设备费用")
    );
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.access(filePath);
        return true;
    } catch {
        return false;
    }
}

async function main() {
    console.log("=".repeat(60));
    console.log("RAG 系统完整测试");
    console.log("=".repeat(60));

    try {
        // 测试 1: 文档加载
        await testDocumentLoading();

        // 测试 2: 向量索引
        await testVectorIndexing();

        // 测试 3: 引用匹配
        await testCitationMatching();

        // 测试 4: 完整 RAG 流程
        await testFullRAGFlow();

        // 测试 5: 字段同义词
        await testFieldSynonyms();

        console.log("\n" + "=".repeat(60));
        console.log("✅ 所有测试完成");
        console.log("=".repeat(60));
    } catch (error) {
        console.error("\n❌ 测试失败:", error);
        process.exit(1);
    }
}

main();

