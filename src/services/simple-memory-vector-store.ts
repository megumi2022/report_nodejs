/**
 * 简单的内存向量存储实现
 * 基于 @langchain/core 的 VectorStore 接口
 */

import { Document } from "@langchain/core/documents";
import { Embeddings } from "@langchain/core/embeddings";
import { VectorStore } from "@langchain/core/vectorstores";

interface MemoryVector {
    content: string;
    embedding: number[];
    metadata: Record<string, any>;
    id?: string;
}

/**
 * 计算余弦相似度
 */
function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
        throw new Error("Vectors must have the same length");
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    if (normA === 0 || normB === 0) {
        return 0;
    }

    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

export class SimpleMemoryVectorStore extends VectorStore {
    private vectors: MemoryVector[] = [];
    private embeddings: Embeddings;

    _vectorstoreType(): string {
        return "simple_memory";
    }

    constructor(embeddings: Embeddings) {
        super(embeddings, {});
        this.embeddings = embeddings;
    }

    /**
     * 从文档创建向量存储
     */
    static async fromDocuments(
        docs: Document[],
        embeddings: Embeddings
    ): Promise<SimpleMemoryVectorStore> {
        const store = new SimpleMemoryVectorStore(embeddings);
        await store.addDocuments(docs);
        return store;
    }

    /**
     * 添加文档
     */
    async addDocuments(documents: Document[]): Promise<string[]> {
        const texts = documents.map((doc) => doc.pageContent);
        const embeddings = await this.embeddings.embedDocuments(texts);

        const ids: string[] = [];

        for (let i = 0; i < documents.length; i++) {
            const id = `vec_${Date.now()}_${i}`;
            this.vectors.push({
                id,
                content: documents[i].pageContent,
                embedding: embeddings[i],
                metadata: documents[i].metadata,
            });
            ids.push(id);
        }

        return ids;
    }

    /**
     * 添加向量
     */
    async addVectors(
        vectors: number[][],
        documents: Document[]
    ): Promise<string[]> {
        const ids: string[] = [];

        for (let i = 0; i < documents.length; i++) {
            const id = `vec_${Date.now()}_${i}`;
            this.vectors.push({
                id,
                content: documents[i].pageContent,
                embedding: vectors[i],
                metadata: documents[i].metadata,
            });
            ids.push(id);
        }

        return ids;
    }

    /**
     * 相似度搜索（带分数）
     */
    async similaritySearchWithScore(
        query: string,
        k: number = 4,
        filter?: (doc: Document) => boolean
    ): Promise<[Document, number][]> {
        const queryEmbedding = await this.embeddings.embedQuery(query);

        // 计算所有向量的相似度
        const scores = this.vectors.map((vector) => ({
            vector,
            score: cosineSimilarity(queryEmbedding, vector.embedding),
        }));

        // 排序并取前 k 个
        scores.sort((a, b) => b.score - a.score);
        const topK = scores.slice(0, k);

        // 转换为 Document 格式
        const results: [Document, number][] = topK.map(({ vector, score }) => {
            const doc = new Document({
                pageContent: vector.content,
                metadata: vector.metadata,
            });
            return [doc, score];
        });

        // 应用过滤（如果有）
        if (filter) {
            return results.filter(([doc]) => filter(doc));
        }

        return results;
    }

    /**
     * 相似度搜索
     */
    async similaritySearch(
        query: string,
        k: number = 4,
        filter?: (doc: Document) => boolean
    ): Promise<Document[]> {
        const results = await this.similaritySearchWithScore(query, k, filter);
        return results.map(([doc]) => doc);
    }
}

