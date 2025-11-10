/**
 * 检索服务 - 协调不同类型的检索操作
 * 支持传统检索和 RAG 向量检索
 */

import { MCPAgentPipeline } from "../agents/mcp-pipeline.ts";
import { VectorStoreService, SearchResult } from "./vector-store-service.ts";
import { CitationService, Citation } from "./citation-service.ts";
import { ExcelRetrievalService } from "./excel-retrieval-service.ts";
import { RerankerService } from "./reranker-service.ts";

export interface RetrievalResult {
    source: "excel" | "web" | "database" | "vector" | "pdf";
    data: any;
    metadata?: Record<string, any>;
    citations?: Citation[]; // RAG 检索的引用
}

export class RetrievalService {
    private excelAgent: MCPAgentPipeline;
    private webAgent: MCPAgentPipeline;
    private dbAgent: MCPAgentPipeline;
    private vectorStore: VectorStoreService;
    private citationService: CitationService;
    private excelRetrieval: ExcelRetrievalService;
    private reranker: RerankerService;

    constructor() {
        // 创建专门的检索 Agent 实例
        this.excelAgent = new MCPAgentPipeline();
        this.webAgent = new MCPAgentPipeline();
        this.dbAgent = new MCPAgentPipeline();
        this.vectorStore = new VectorStoreService();
        this.citationService = new CitationService();
        this.excelRetrieval = new ExcelRetrievalService();
        this.reranker = new RerankerService();
    }

    /**
     * 初始化所有检索 Agent
     */
    async initialize() {
        // 注意：这里需要根据实际 MCP 配置来初始化
        // 可以配置不同的 MCP Server 给不同的 Agent
        await Promise.all([
            this.excelAgent.initialize(),
            this.webAgent.initialize(),
            this.dbAgent.initialize(),
            this.vectorStore.initialize(),
        ]);
    }

    /**
     * 获取向量存储服务（用于文档索引）
     */
    getVectorStore(): VectorStoreService {
        return this.vectorStore;
    }

    /**
     * 获取引用服务
     */
    getCitationService(): CitationService {
        return this.citationService;
    }

    /**
     * 从向量库检索（RAG + Reranker）
     */
    async retrieveFromVector(
        query: string,
        k: number = 5,
        minScore: number = 0.7,
        useReranker: boolean = true
    ): Promise<RetrievalResult> {
        try {
            // 第一阶段：向量检索（如果使用 reranker，检索更多候选）
            const candidateCount = useReranker && this.reranker.isAvailable() ? k * 4 : k;
            const searchResults = await this.vectorStore.similaritySearch(query, candidateCount);

            let finalResults = searchResults;

            // 第二阶段：Reranker 精排序（如果启用且可用）
            if (useReranker && this.reranker.isAvailable() && searchResults.length > k) {
                try {
                    const { Document } = await import("@langchain/core/documents");
                    const documents = searchResults.map((r) =>
                        new Document({
                            pageContent: r.content,
                            metadata: r.metadata,
                        })
                    );

                    const reranked = await this.reranker.rerank(query, documents, k);
                    finalResults = reranked.map((r) => ({
                        content: r.document.pageContent,
                        score: r.score,
                        metadata: r.document.metadata,
                    }));

                    console.log(`✅ 使用 Reranker 精排序: ${searchResults.length} → ${finalResults.length} 个结果`);
                } catch (error: any) {
                    console.warn(`⚠️ Reranker 调用失败，使用原始向量检索结果: ${error.message}`);
                    // 降级：使用原始向量检索结果
                    finalResults = searchResults.slice(0, k);
                }
            } else {
                // 不使用 reranker，直接取前 k 个
                if (useReranker && !this.reranker.isAvailable()) {
                    console.log(`ℹ️ Reranker 未配置或不可用，使用原始向量检索结果`);
                }
                finalResults = searchResults.slice(0, k);
            }

            // 应用最小分数过滤
            const filteredResults = finalResults.filter((r) => r.score >= minScore);
            const citations = this.citationService.matchCitations(filteredResults, minScore);

            return {
                source: "vector",
                data: filteredResults.map((r) => r.content),
                metadata: {
                    query,
                    resultCount: filteredResults.length,
                    citationsCount: citations.length,
                    usedReranker: useReranker && this.reranker.isAvailable(),
                },
                citations,
            };
        } catch (error: any) {
            console.error("向量检索失败:", error.message);
            return {
                source: "vector",
                data: null,
                metadata: { error: error.message },
            };
        }
    }

    /**
     * 从 PDF 检索（通过向量库 + Reranker）
     */
    async retrieveFromPDF(
        query: string,
        k: number = 5,
        useReranker: boolean = true
    ): Promise<RetrievalResult> {
        try {
            // 第一阶段：向量检索（如果使用 reranker，检索更多候选）
            const candidateCount = useReranker && this.reranker.isAvailable() ? k * 4 : k * 2;
            const searchResults = await this.vectorStore.similaritySearch(
                query,
                candidateCount,
                (doc) => doc.metadata.type === "pdf"
            );

            let finalResults = searchResults;

            // 第二阶段：Reranker 精排序（如果启用且可用）
            if (useReranker && this.reranker.isAvailable() && searchResults.length > k) {
                try {
                    const { Document } = await import("@langchain/core/documents");
                    const documents = searchResults.map((r) =>
                        new Document({
                            pageContent: r.content,
                            metadata: r.metadata,
                        })
                    );

                    const reranked = await this.reranker.rerank(query, documents, k);
                    finalResults = reranked.map((r) => ({
                        content: r.document.pageContent,
                        score: r.score,
                        metadata: r.document.metadata,
                    }));

                    console.log(`✅ PDF 使用 Reranker 精排序: ${searchResults.length} → ${finalResults.length} 个结果`);
                } catch (error: any) {
                    console.warn(`⚠️ PDF Reranker 调用失败，使用原始向量检索结果: ${error.message}`);
                    // 降级：使用原始向量检索结果
                    finalResults = searchResults.slice(0, k);
                }
            } else {
                // 不使用 reranker，直接取前 k 个
                if (useReranker && !this.reranker.isAvailable()) {
                    console.log(`ℹ️ PDF Reranker 未配置或不可用，使用原始向量检索结果`);
                }
                finalResults = searchResults.slice(0, k);
            }

            const citations = this.citationService.matchCitations(finalResults);

            return {
                source: "pdf",
                data: finalResults.map((r) => r.content),
                metadata: {
                    query,
                    resultCount: finalResults.length,
                    usedReranker: useReranker && this.reranker.isAvailable(),
                },
                citations,
            };
        } catch (error: any) {
            console.error("PDF 检索失败:", error.message);
            return {
                source: "pdf",
                data: null,
                metadata: { error: error.message },
            };
        }
    }

    /**
     * 从 Excel 检索数据（传统方式：LLM 检索计划 + 精确匹配）
     * 不使用 embedding，适合结构化数据查询
     */
    async retrieveFromExcel(
        query: string,
        excelPath?: string,
        maxRows: number = 10
    ): Promise<RetrievalResult> {
        if (!excelPath) {
            return {
                source: "excel",
                data: null,
                metadata: { error: "Excel 文件路径未提供" },
            };
        }

        try {
            // 使用传统检索方式：LLM 生成检索计划 + 精确匹配
            const result = await this.excelRetrieval.retrieve(excelPath, query, maxRows);

            // 将匹配结果格式化为 JSON（用于 LLM 上下文）
            const formattedData = this.excelRetrieval.formatMatchesAsJSON(result.matches);

            return {
                source: "excel",
                data: formattedData,
                metadata: {
                    query,
                    excelPath,
                    matchCount: result.matches.length,
                    searchPlans: result.searchPlans,
                    sheets: result.metadata.map((m) => m.sheet),
                },
            };
        } catch (error: any) {
            console.error("Excel 检索失败:", error.message);
            return {
                source: "excel",
                data: null,
                metadata: { error: error.message },
            };
        }
    }

    /**
     * 联网检索
     */
    async retrieveFromWeb(query: string): Promise<RetrievalResult> {
        try {
            const result = await this.webAgent.execute(
                `联网检索：${query}`,
                "你是一个网络检索专家，可以从互联网检索相关信息。"
            );

            return {
                source: "web",
                data: result,
                metadata: { query },
            };
        } catch (error: any) {
            console.error("联网检索失败:", error.message);
            return {
                source: "web",
                data: null,
                metadata: { error: error.message },
            };
        }
    }

    /**
     * 从数据库检索
     */
    async retrieveFromDatabase(query: string, projectId?: string): Promise<RetrievalResult> {
        try {
            const result = await this.dbAgent.execute(
                `从数据库检索：${query}${projectId ? `，项目ID: ${projectId}` : ""}`,
                "你是一个数据库查询专家，可以从 Supabase 数据库检索数据。"
            );

            return {
                source: "database",
                data: result,
                metadata: { query, projectId },
            };
        } catch (error: any) {
            console.error("数据库检索失败:", error.message);
            return {
                source: "database",
                data: null,
                metadata: { error: error.message },
            };
        }
    }

    /**
     * 并行执行多种检索
     */
    async retrieveAll(
        queries: {
            excel?: string;
            web?: string;
            database?: string;
            vector?: string;
            pdf?: string;
        },
        context?: { excelPath?: string; projectId?: string; vectorK?: number }
    ): Promise<RetrievalResult[]> {
        const tasks: Promise<RetrievalResult>[] = [];

        if (queries.excel) {
            tasks.push(this.retrieveFromExcel(queries.excel, context?.excelPath));
        }
        if (queries.web) {
            tasks.push(this.retrieveFromWeb(queries.web));
        }
        if (queries.database) {
            tasks.push(this.retrieveFromDatabase(queries.database, context?.projectId));
        }
        if (queries.vector) {
            tasks.push(this.retrieveFromVector(queries.vector, context?.vectorK || 5));
        }
        if (queries.pdf) {
            tasks.push(this.retrieveFromPDF(queries.pdf, context?.vectorK || 5));
        }

        return Promise.all(tasks);
    }
}

