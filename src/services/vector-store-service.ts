/**
 * 向量存储服务 - 管理文档的向量化和检索
 * 支持 Supabase Vector Store（持久化）和内存存储（开发/测试）
 * 通过环境变量 VECTOR_STORE_TYPE 控制：'supabase' 或 'memory'（默认）
 */

import { Document } from "@langchain/core/documents";
import { OpenAIEmbeddings } from "@langchain/openai";
import { VectorStore } from "@langchain/core/vectorstores";
import { SimpleMemoryVectorStore } from "./simple-memory-vector-store.ts";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

export interface VectorizedChunk {
    id: string;
    content: string;
    embedding: number[];
    metadata: Record<string, any>;
}

export interface SearchResult {
    content: string;
    score: number;
    metadata: Record<string, any>;
}

export class VectorStoreService {
    private vectorStore: VectorStore | SimpleMemoryVectorStore | null = null;
    private embeddings: OpenAIEmbeddings;
    private documents: Document[] = [];
    private useSupabase: boolean;
    private supabase: SupabaseClient | null = null;

    constructor() {
        // 检查是否使用 Supabase
        const vectorStoreType = process.env.VECTOR_STORE_TYPE || "memory";
        this.useSupabase = vectorStoreType.toLowerCase() === "supabase";

        if (this.useSupabase) {
            // 初始化 Supabase 客户端
            const supabaseUrl = process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_KEY;

            if (!supabaseUrl || !supabaseKey) {
                console.warn("⚠️ Supabase 配置未找到，回退到内存存储");
                console.warn("   需要设置: SUPABASE_URL 和 SUPABASE_KEY");
                this.useSupabase = false;
            } else {
                this.supabase = createClient(supabaseUrl, supabaseKey);
                console.log("✅ 使用 Supabase 向量存储（持久化）");
            }
        } else {
            console.log("ℹ️ 使用内存向量存储（开发/测试模式）");
        }

        // 初始化 Embeddings
        const apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY;
        const baseURL = process.env.DASHSCOPE_BASE_URL || process.env.QWEN_API_BASE || process.env.OPENAI_BASE_URL;
        const model = process.env.EMBEDDING_MODEL || "text-embedding-v4";

        if (!apiKey) {
            console.warn("⚠️  未找到 API Key (DASHSCOPE_API_KEY/QWEN_API_KEY/OPENAI_API_KEY)");
        } else {
            const keyPreview = apiKey.substring(0, 8) + "..." + apiKey.substring(apiKey.length - 4);
            console.log(`🔑 使用 API Key: ${keyPreview}`);
        }

        const finalBaseURL = baseURL?.endsWith('/v1') ? baseURL : baseURL;

        this.embeddings = new OpenAIEmbeddings({
            model: model,
            openAIApiKey: apiKey,
            batchSize: 10, // DashScope API 限制：最多 10 个文档/批次
            configuration: finalBaseURL ? { baseURL: finalBaseURL } : undefined,
        });
    }

    /**
     * 初始化向量存储
     */
    async initialize(): Promise<void> {
        if (this.vectorStore) {
            return;
        }

        if (this.useSupabase && this.supabase) {
            // 使用 Supabase Vector Store
            try {
                // 先检查表是否存在
                const { data: tableExists, error: checkError } = await this.supabase
                    .from("document_vectors")
                    .select("id")
                    .limit(1);

                if (checkError && checkError.code === "42P01") {
                    // 表不存在
                    console.error("❌ Supabase 表 'document_vectors' 不存在");
                    console.error("   请在 Supabase SQL Editor 中执行迁移脚本：");
                    console.error("   supabase/migrations/create_vector_store.sql");
                    console.warn("⚠️ 回退到内存存储");
                    this.useSupabase = false;
                    await this.initialize(); // 递归调用，使用内存存储
                    return;
                }

                const { SupabaseVectorStore } = await import("@langchain/community/vectorstores/supabase");
                this.vectorStore = await SupabaseVectorStore.fromDocuments(
                    [],
                    this.embeddings,
                    {
                        client: this.supabase,
                        tableName: "document_vectors",
                        queryName: "match_documents",
                    }
                );
                console.log("✅ Supabase 向量存储初始化完成");
            } catch (error: any) {
                console.error("❌ Supabase 向量存储初始化失败:", error.message);

                // 检查是否是表不存在的错误
                if (error.message?.includes("Could not find the table") ||
                    error.message?.includes("document_vectors") ||
                    error.message?.includes("404")) {
                    console.error("\n💡 解决方案：");
                    console.error("   1. 登录 Supabase 项目");
                    console.error("   2. 进入 SQL Editor");
                    console.error("   3. 执行迁移脚本: supabase/migrations/create_vector_store.sql");
                    console.error("   4. 或者查看配置指南: supabase/README.md\n");
                }

                console.warn("⚠️ 回退到内存存储");
                this.useSupabase = false;
                await this.initialize(); // 递归调用，使用内存存储
            }
        } else {
            // 使用内存存储
            this.vectorStore = await SimpleMemoryVectorStore.fromDocuments(
                [],
                this.embeddings
            );
        }
    }

    /**
     * 添加文档到向量库
     */
    async addDocuments(documents: Document[]): Promise<void> {
        if (!this.vectorStore) {
            await this.initialize();
        }

        if (!this.useSupabase) {
            // 内存存储：保存文档引用
            this.documents.push(...documents);
        }

        try {
            // 添加到向量存储
            await this.vectorStore!.addDocuments(documents);

            const storeType = this.useSupabase ? "Supabase" : "内存";
            console.log(`✅ 已添加 ${documents.length} 个文档到 ${storeType} 向量库`);
        } catch (error: any) {
            // 如果是 Supabase 表不存在错误，给出更清晰的提示
            if (this.useSupabase && (
                error.message?.includes("Could not find the table") ||
                error.message?.includes("document_vectors") ||
                error.message?.includes("404")
            )) {
                console.error("\n❌ 添加文档失败: Supabase 表 'document_vectors' 不存在");
                console.error("💡 请执行以下步骤：");
                console.error("   1. 登录 Supabase 项目");
                console.error("   2. 进入 SQL Editor");
                console.error("   3. 执行: supabase/migrations/create_vector_store.sql");
                console.error("   4. 详细指南: supabase/README.md");
                console.error("   5. 或运行检查脚本: pnpm check:supabase\n");
                throw new Error("Supabase 表未创建，请先执行迁移脚本");
            }
            throw error;
        }
    }

    /**
     * 清空向量库
     */
    async clear(): Promise<void> {
        if (this.useSupabase && this.supabase) {
            // 清空 Supabase 表
            const { error } = await this.supabase
                .from("document_vectors")
                .delete()
                .neq("id", 0);

            if (error) {
                console.error("❌ 清空 Supabase 向量库失败:", error);
            } else {
                console.log("✅ Supabase 向量库已清空");
            }
        } else {
            // 清空内存存储
            this.documents = [];
            if (this.vectorStore) {
                this.vectorStore = await SimpleMemoryVectorStore.fromDocuments(
                    [],
                    this.embeddings
                );
            }
        }
    }

    /**
     * 相似度搜索
     */
    async similaritySearch(
        query: string,
        k: number = 5,
        filter?: (doc: Document) => boolean
    ): Promise<SearchResult[]> {
        if (!this.vectorStore) {
            throw new Error("向量库未初始化，请先调用 addDocuments");
        }

        // 执行搜索
        const results = await this.vectorStore.similaritySearchWithScore(query, k);

        // 应用过滤（如果有）
        let filteredResults = results;
        if (filter) {
            filteredResults = results.filter(([doc]) => filter(doc));
        }

        return filteredResults.map(([doc, score]) => ({
            content: doc.pageContent,
            score: score,
            metadata: doc.metadata,
        }));
    }

    /**
     * 获取所有文档（仅内存存储支持）
     */
    getDocuments(): Document[] {
        if (this.useSupabase) {
            console.warn("⚠️ Supabase 存储不支持 getDocuments()，返回空数组");
            return [];
        }
        return [...this.documents];
    }

    /**
     * 获取文档数量
     */
    async getDocumentCount(): Promise<number> {
        if (this.useSupabase && this.supabase) {
            const { count, error } = await this.supabase
                .from("document_vectors")
                .select("*", { count: "exact", head: true });

            if (error) {
                console.error("获取文档数量失败:", error);
                return 0;
            }

            return count || 0;
        } else {
            return this.documents.length;
        }
    }
}

