/**
 * Reranker 服务 - 使用 DashScope gte-rerank-v2 模型
 * 对初步检索结果进行精排序，提升检索精度
 */

import { Document } from "@langchain/core/documents";

export interface RerankResult {
    document: Document;
    score: number;
    index: number;
}

export class RerankerService {
    private apiKey: string;
    private baseURL: string;
    private model: string;

    constructor() {
        // 从 .env 读取配置（DASHSCOPE_API_KEY 和 RERANKER_BASE_URL）
        this.apiKey = process.env.DASHSCOPE_API_KEY || "";
        this.baseURL = process.env.RERANKER_BASE_URL || "";
        this.model = "gte-rerank-v2";

        if (!this.apiKey || !this.baseURL) {
            console.warn("⚠️ Reranker API Key 或 Base URL 未设置");
            console.warn("   需要设置: DASHSCOPE_API_KEY 和 RERANKER_BASE_URL");
        }
    }

    /**
     * 对候选文档进行重排序
     * @param query 查询文本
     * @param documents 候选文档列表
     * @param topN 返回 top-N 个结果
     */
    async rerank(
        query: string,
        documents: Document[],
        topN: number = 5
    ): Promise<RerankResult[]> {
        if (documents.length === 0) {
            return [];
        }

        if (!this.apiKey || !this.baseURL) {
            console.warn("⚠️ Reranker 未配置，返回原始顺序");
            return documents.slice(0, topN).map((doc, idx) => ({
                document: doc,
                score: 1.0 - idx * 0.1, // 降序分数
                index: idx,
            }));
        }

        try {
            // 准备请求数据
            // DashScope rerank API 格式（根据官方文档）：
            // {
            //   "model": "gte-rerank-v2",
            //   "input": { "query": "...", "documents": [...] },
            //   "parameters": { "return_documents": true, "top_n": 5 }
            // }
            const requestBody = {
                model: this.model,
                input: {
                    query: query,
                    documents: documents.map((doc) => doc.pageContent),
                },
                parameters: {
                    return_documents: true,
                    top_n: topN,
                },
            };

            // 构建 API URL
            // 检查 RERANKER_BASE_URL 是否已经是完整的端点 URL
            // 如果包含 /rerank 或 /text-rerank，说明已经是完整端点，直接使用
            let apiPath: string;
            const possiblePaths: string[] = [];

            // 检查是否是完整的端点 URL（包含 /rerank 或 /text-rerank）
            const isFullEndpoint = this.baseURL.includes('/rerank') || this.baseURL.includes('/text-rerank');

            if (isFullEndpoint) {
                // 已经是完整的端点 URL，直接使用
                possiblePaths.push(this.baseURL);
                console.log(`✅ 检测到完整的 Reranker 端点 URL，直接使用: ${this.baseURL}`);
            } else if (this.baseURL.includes('/compatible-mode/v1')) {
                // 兼容模式：尝试不同的路径
                const baseWithoutV1 = this.baseURL.replace('/v1', '');
                possiblePaths.push(
                    `${this.baseURL}/rerank`,  // /compatible-mode/v1/rerank
                    `${baseWithoutV1}/api/v1/services/rerank`,  // /compatible-mode/api/v1/services/rerank
                    `https://dashscope.aliyuncs.com/api/v1/services/rerank`  // 直接使用 DashScope rerank 端点
                );
            } else if (this.baseURL.endsWith('/v1')) {
                // baseURL 以 /v1 结尾
                possiblePaths.push(
                    `${this.baseURL}/rerank`,  // /v1/rerank
                    `${this.baseURL.replace('/v1', '')}/api/v1/services/rerank`  // 尝试 /api/v1/services/rerank
                );
            } else {
                // baseURL 不包含 /v1
                possiblePaths.push(
                    `${this.baseURL}/v1/rerank`,  // /v1/rerank
                    `${this.baseURL}/api/v1/services/rerank`,  // /api/v1/services/rerank
                    `https://dashscope.aliyuncs.com/api/v1/services/rerank`  // DashScope 标准端点
                );
            }

            // 尝试第一个路径
            apiPath = possiblePaths[0];

            console.log(`🔍 调用 Rerank API: ${apiPath}`);
            console.log(`📊 请求参数: query="${query.substring(0, 50)}...", documents=${documents.length}, top_n=${topN}`);
            console.log(`💡 如果失败，将尝试其他路径: ${possiblePaths.slice(1).join(', ')}`);

            // 调用 DashScope Rerank API
            let response: Response | null = null;
            let lastError: Error | null = null;

            // 尝试所有可能的端点路径
            for (const path of possiblePaths) {
                try {
                    response = await fetch(path, {
                        method: "POST",
                        headers: {
                            "Content-Type": "application/json",
                            Authorization: `Bearer ${this.apiKey}`,
                        },
                        body: JSON.stringify(requestBody),
                    });

                    if (response.ok) {
                        // 成功，使用这个路径
                        apiPath = path;
                        break;
                    } else if (response.status === 404 && path !== possiblePaths[possiblePaths.length - 1]) {
                        // 404 且不是最后一个路径，继续尝试下一个
                        console.warn(`⚠️ 端点 ${path} 不存在 (404)，尝试下一个路径...`);
                        response = null; // 重置，继续尝试
                        continue;
                    } else {
                        // 其他错误，抛出
                        const errorText = await response.text();
                        throw new Error(`Rerank API 调用失败: ${response.status} ${errorText}`);
                    }
                } catch (error: any) {
                    lastError = error;
                    response = null; // 重置
                    if (path === possiblePaths[possiblePaths.length - 1]) {
                        // 最后一个路径也失败了
                        throw error;
                    }
                    // 继续尝试下一个路径
                    continue;
                }
            }

            if (!response || !response.ok) {
                const errorText = response ? await response.text() : (lastError?.message || "未知错误");
                const statusCode = response?.status || "N/A";
                console.error(`❌ Rerank API 调用失败:`);
                console.error(`   尝试的 URL: ${possiblePaths.join(', ')}`);
                console.error(`   状态码: ${statusCode}`);
                console.error(`   错误信息: ${errorText}`);
                throw new Error(`Rerank API 调用失败: ${statusCode} ${errorText}。请检查 RERANKER_BASE_URL 和 API 文档。`);
            }

            const result = await response.json();

            // 解析返回结果
            // DashScope rerank API 官方返回格式：
            // {
            //   "output": {
            //     "results": [
            //       { "index": 0, "relevance_score": 0.95, "document": "..." },
            //       ...
            //     ]
            //   }
            // }
            // 也可能有其他格式（兼容格式）
            const rerankedResults: RerankResult[] = [];

            // 优先解析官方格式：{ output: { results: [...] } }
            if (result.output && result.output.results && Array.isArray(result.output.results)) {
                for (const item of result.output.results) {
                    const originalIndex = item.index ?? item.rank ?? 0;
                    if (originalIndex >= 0 && originalIndex < documents.length) {
                        rerankedResults.push({
                            document: documents[originalIndex],
                            score: item.relevance_score ?? item.score ?? 0,
                            index: originalIndex,
                        });
                    }
                }
            } else if (result.results && Array.isArray(result.results)) {
                // 兼容格式 1: { results: [...] }
                for (const item of result.results) {
                    const originalIndex = item.index ?? item.rank ?? 0;
                    if (originalIndex >= 0 && originalIndex < documents.length) {
                        rerankedResults.push({
                            document: documents[originalIndex],
                            score: item.relevance_score ?? item.score ?? 0,
                            index: originalIndex,
                        });
                    }
                }
            } else if (result.data && Array.isArray(result.data)) {
                // 兼容格式 2: { data: [...] }
                for (const item of result.data) {
                    const originalIndex = item.index ?? 0;
                    if (originalIndex >= 0 && originalIndex < documents.length) {
                        rerankedResults.push({
                            document: documents[originalIndex],
                            score: item.relevance_score ?? item.score ?? 0,
                            index: originalIndex,
                        });
                    }
                }
            } else if (Array.isArray(result)) {
                // 兼容格式 3: 直接返回数组
                for (const item of result) {
                    const originalIndex = item.index ?? item.rank ?? 0;
                    if (originalIndex >= 0 && originalIndex < documents.length) {
                        rerankedResults.push({
                            document: documents[originalIndex],
                            score: item.relevance_score ?? item.score ?? 0,
                            index: originalIndex,
                        });
                    }
                }
            } else {
                console.warn("⚠️ Rerank API 返回格式未知，使用原始顺序");
                console.warn(`   返回结果: ${JSON.stringify(result).substring(0, 200)}...`);
                return documents.slice(0, topN).map((doc, idx) => ({
                    document: doc,
                    score: 1.0 - idx * 0.1,
                    index: idx,
                }));
            }

            // 按分数降序排序（确保最相关的在前）
            rerankedResults.sort((a, b) => b.score - a.score);

            return rerankedResults.slice(0, topN);
        } catch (error: any) {
            console.error("Rerank 失败:", error.message);
            // 降级：返回原始顺序
            return documents.slice(0, topN).map((doc, idx) => ({
                document: doc,
                score: 1.0 - idx * 0.1,
                index: idx,
            }));
        }
    }

    /**
     * 检查 Reranker 是否可用
     */
    isAvailable(): boolean {
        return !!(this.apiKey && this.baseURL);
    }
}

