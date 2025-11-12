import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { Document } from "@langchain/core/documents";
import { DocumentLoader } from "./document-loader.ts";
import { AssetIndexRecord } from "./asset-registry-service.ts";
import { AssetChunkService, AssetChunkInput } from "./asset-chunk-service.ts";
import { EmbeddingService } from "./embedding-service.ts";
import { VectorStoreService } from "./vector-store-service.ts";
import { promises as fs } from "fs";
import * as path from "path";
import mammoth from "mammoth";

interface RawChunk {
    content: string;
    metadata: Record<string, any>;
}

export class TextPreprocessService {
    private splitter: RecursiveCharacterTextSplitter;
    private loader: DocumentLoader;
    private embeddingService: EmbeddingService;
    private vectorStore: VectorStoreService;

    constructor(
        private readonly chunkService = new AssetChunkService(),
        options?: { chunkSize?: number; chunkOverlap?: number }
    ) {
        this.splitter = new RecursiveCharacterTextSplitter({
            chunkSize: options?.chunkSize ?? 800,
            chunkOverlap: options?.chunkOverlap ?? 100,
        });
        this.loader = new DocumentLoader(options?.chunkSize ?? 800, options?.chunkOverlap ?? 100);
        this.embeddingService = new EmbeddingService();
        this.vectorStore = new VectorStoreService();
    }

    async process(asset: AssetIndexRecord, localPath: string): Promise<number> {
        const chunks = await this.loadChunks(asset, localPath);
        if (chunks.length === 0) {
            return 0;
        }

        const texts = chunks.map((chunk) => chunk.content);
        const embeddings = await this.embeddingService.embedTexts(texts);

        const inputs: AssetChunkInput[] = chunks.map((chunk, index) => ({
            assetId: asset.id,
            chunkIndex: index,
            content: chunk.content,
            tokenCount: this.countTokens(chunk.content),
            embedding: embeddings[index] ?? null,
            metadata: {
                ...chunk.metadata,
                asset_type: asset.asset_type,
            },
        }));

        await this.chunkService.saveChunks(inputs);

        const documents = chunks.map(
            (chunk, index) =>
                new Document({
                    pageContent: chunk.content,
                    metadata: {
                        ...chunk.metadata,
                        asset_id: asset.id,
                        chunk_index: index,
                        asset_type: asset.asset_type,
                        source: chunk.metadata?.source ?? localPath,
                    },
                })
        );

        await this.vectorStore.addDocuments(documents);

        return inputs.length;
    }

    private async loadChunks(asset: AssetIndexRecord, localPath: string): Promise<RawChunk[]> {
        if (asset.asset_type === "pdf") {
            const docs = await this.loader.loadPDF(localPath);
            return docs.map((doc) => ({
                content: doc.pageContent,
                metadata: doc.metadata,
            }));
        }

        if (asset.asset_type === "word") {
            const buffer = await fs.readFile(localPath);
            const result = await mammoth.extractRawText({ buffer });
            const text = result.value || "";
            return await this.splitText(text, {
                source: localPath,
                type: "word",
            });
        }

        if (asset.asset_type === "other") {
            const ext = path.extname(localPath).toLowerCase();
            if (ext === ".txt" || ext === ".md") {
                const text = await fs.readFile(localPath, "utf-8");
                return await this.splitText(text, {
                    source: localPath,
                    type: "text",
                });
            }
        }

        throw new Error(`暂不支持的文本资产类型: ${asset.asset_type}`);
    }

    private async splitText(text: string, metadata: Record<string, any>): Promise<RawChunk[]> {
        const docs = await this.splitter.createDocuments([text], [metadata]);
        return docs.map((doc) => ({
            content: doc.pageContent,
            metadata: doc.metadata,
        }));
    }

    private countTokens(text: string): number {
        if (!text) return 0;
        return text.split(/\s+/).filter(Boolean).length;
    }
}
