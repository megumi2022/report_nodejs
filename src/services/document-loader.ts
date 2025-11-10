/**
 * 文档加载器 - 统一处理 Excel 和 PDF 文档解析
 */

import * as fs from "fs/promises";
import * as path from "path";
import xlsx from "xlsx";
// @ts-ignore - pdf-parse 是 CommonJS 模块，使用动态导入
import { Document } from "@langchain/core/documents";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

export interface DocumentMetadata {
    source: string;
    type: "excel" | "pdf";
    sheet?: string;
    row?: number;
    page?: number;
    chunk_index: number;
    total_chunks: number;
    [key: string]: any;
}

export class DocumentLoader {
    private textSplitter: RecursiveCharacterTextSplitter;

    constructor(chunkSize = 500, chunkOverlap = 50) {
        this.textSplitter = new RecursiveCharacterTextSplitter({
            chunkSize,
            chunkOverlap,
        });
    }

    /**
     * 加载 Excel 文件
     */
    async loadExcel(
        filePath: string,
        options?: { includeEmptyRows?: boolean }
    ): Promise<Document[]> {
        const workbook = xlsx.readFile(filePath);
        const documents: Document[] = [];

        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            const rows = xlsx.utils.sheet_to_json(sheet, {
                header: 1,
                defval: "",
            }) as string[][];

            if (rows.length < 2) continue;

            const headers = rows[0].map((h, i) => String(h || `列${i + 1}`).trim());

            for (let i = 1; i < rows.length; i++) {
                const row = rows[i];
                if (!options?.includeEmptyRows && row.every((cell) => !String(cell).trim())) {
                    continue;
                }

                const record: Record<string, any> = {};
                headers.forEach((header, idx) => {
                    record[header] = row[idx] ?? "";
                });

                // 将行转换为文本
                const content = Object.entries(record)
                    .map(([key, value]) => `${key}: ${String(value)}`)
                    .join(" | ");

                documents.push(
                    new Document({
                        pageContent: content,
                        metadata: {
                            source: filePath,
                            type: "excel",
                            sheet: sheetName,
                            row: i + 1,
                            chunk_index: documents.length,
                            total_chunks: 0, // 稍后更新
                        },
                    })
                );
            }
        }

        // 更新 total_chunks
        documents.forEach((doc) => {
            doc.metadata.total_chunks = documents.length;
        });

        return documents;
    }

    /**
     * 加载 PDF 文件
     */
    async loadPDF(filePath: string): Promise<Document[]> {
        const buffer = await fs.readFile(filePath);
        // 动态导入 pdf-parse（ESM 模块）
        const { PDFParse } = await import("pdf-parse");
        const parser = new PDFParse({ data: buffer });
        await parser.load();
        const textResult = await parser.getText();
        const text = textResult.text || "";

        // 按页面切分（使用换页符或段落分隔）
        const pages = text.split(/\f|\n\n+/).filter((p) => p.trim().length > 0);
        const documents: Document[] = [];

        for (let i = 0; i < pages.length; i++) {
            const pageText = pages[i].trim();
            if (!pageText) continue;

            // 对每页进行进一步切分
            const chunks = await this.textSplitter.createDocuments(
                [pageText],
                [
                    {
                        source: filePath,
                        type: "pdf",
                        page: i + 1,
                    },
                ]
            );

            chunks.forEach((chunk, chunkIdx) => {
                documents.push(
                    new Document({
                        pageContent: chunk.pageContent,
                        metadata: {
                            ...chunk.metadata,
                            chunk_index: documents.length,
                            total_chunks: 0, // 稍后更新
                        },
                    })
                );
            });
        }

        // 更新 total_chunks
        documents.forEach((doc) => {
            doc.metadata.total_chunks = documents.length;
        });

        return documents;
    }

    /**
     * 根据文件类型自动加载
     */
    async loadDocument(filePath: string): Promise<Document[]> {
        const ext = path.extname(filePath).toLowerCase();

        if (ext === ".xlsx" || ext === ".xls") {
            return this.loadExcel(filePath);
        } else if (ext === ".pdf") {
            return this.loadPDF(filePath);
        } else {
            throw new Error(`不支持的文件类型: ${ext}`);
        }
    }
}

