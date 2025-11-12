import { OpenAIEmbeddings } from "@langchain/openai";

export class EmbeddingService {
    private embeddings: OpenAIEmbeddings;

    constructor() {
        const apiKey = process.env.DASHSCOPE_API_KEY || process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY;
        const baseURL = process.env.DASHSCOPE_BASE_URL || process.env.QWEN_API_BASE || process.env.OPENAI_BASE_URL;
        const model = process.env.EMBEDDING_MODEL || "text-embedding-v4";

        this.embeddings = new OpenAIEmbeddings({
            model,
            openAIApiKey: apiKey,
            configuration: baseURL ? { baseURL } : undefined,
            batchSize: 10,
        });
    }

    async embedTexts(texts: string[]): Promise<number[][]> {
        if (!texts || texts.length === 0) {
            return [];
        }
        return await this.embeddings.embedDocuments(texts);
    }
}
