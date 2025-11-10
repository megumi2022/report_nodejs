/**
 * Excel 传统检索服务 - 使用 LLM 生成检索计划 + 精确匹配
 * 不依赖 embedding，适合结构化数据查询
 */

import xlsx from "xlsx";
import { ChatOpenAI } from "@langchain/openai";
import * as path from "path";

interface DocumentRow {
    sheet: string;
    row: number;
    data: Record<string, any>;
}

interface SheetMetadata {
    sheet: string;
    headers: string[];
    sampleRows: Array<Record<string, any>>;
    rowCount: number;
}

interface SearchPlanItem {
    sheet?: string;
    search_terms?: string[];
    columns?: string[];
    top_k?: number;
    must_match_all?: boolean;
}

function normalizeHeader(value: any, index: number): string {
    const text = String(value || "列" + (index + 1)).trim();
    return text.length > 0 ? text : `列${index + 1}`;
}

function extractJsonArray(text: string): any[] | null {
    if (!text) return null;
    const arrayMatch = text.match(/\[[\s\S]*\]/);
    if (arrayMatch) {
        try {
            return JSON.parse(arrayMatch[0]);
        } catch (error) {
            console.warn("⚠️ 无法解析数组 JSON:", (error as Error).message);
        }
    }

    const objectMatch = text.match(/\{[\s\S]*\}/);
    if (objectMatch) {
        try {
            const obj = JSON.parse(objectMatch[0]);
            return Array.isArray(obj) ? obj : [obj];
        } catch (error) {
            console.warn("⚠️ 无法解析对象 JSON:", (error as Error).message);
        }
    }

    return null;
}

function extractRows(workbook: xlsx.WorkBook): {
    documents: DocumentRow[];
    metadata: SheetMetadata[];
} {
    const documents: DocumentRow[] = [];
    const metadata: SheetMetadata[] = [];

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const rows = xlsx.utils.sheet_to_json(sheet, {
            header: 1,
            defval: "",
        }) as string[][];

        if (rows.length < 2) {
            metadata.push({
                sheet: sheetName,
                headers: rows[0]?.map(normalizeHeader) ?? [],
                sampleRows: [],
                rowCount: Math.max(rows.length - 1, 0),
            });
            continue;
        }

        const headers = rows[0].map(normalizeHeader);
        const sheetSample: Array<Record<string, any>> = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.every((cell) => String(cell).trim().length === 0)) {
                continue;
            }

            const record: Record<string, any> = {};
            headers.forEach((header, idx) => {
                record[header] = row[idx] ?? "";
            });

            documents.push({
                sheet: sheetName,
                row: i + 1,
                data: record,
            });

            if (sheetSample.length < 3) {
                sheetSample.push({ ...record });
            }
        }

        metadata.push({
            sheet: sheetName,
            headers,
            sampleRows: sheetSample,
            rowCount: rows.length - 1,
        });
    }

    return { documents, metadata };
}

function buildFallbackTerms(text: string): string[] {
    return text
        .replace(/[，。、；：！？\s]+/g, " ")
        .split(" ")
        .map((term) => term.trim())
        .filter((term) => term.length > 0)
        .slice(0, 5);
}

function collectMatches(
    docs: DocumentRow[],
    plans: SearchPlanItem[],
    question: string,
    limit: number
): DocumentRow[] {
    const results: DocumentRow[] = [];
    const seen = new Set<string>();
    const fallbackTerms = buildFallbackTerms(question);

    const plansToUse = plans.length > 0 ? plans : [{ search_terms: fallbackTerms }];

    for (const plan of plansToUse) {
        if (results.length >= limit) break;

        const terms = (plan.search_terms?.length ? plan.search_terms : fallbackTerms).map(
            (term) => term.toLowerCase()
        );
        const mustMatchAll = plan.must_match_all === true;
        const columns = plan.columns?.length ? plan.columns : undefined;
        const perPlanLimit = Math.min(limit - results.length, plan.top_k ?? limit);

        for (const doc of docs) {
            if (results.length >= limit || perPlanLimit <= 0) break;
            if (plan.sheet && plan.sheet !== doc.sheet) continue;

            const candidateValues = columns
                ? columns.map((col) => doc.data[col])
                : Object.values(doc.data);
            const normalizedValues = candidateValues.map((value) =>
                String(value ?? "").toLowerCase()
            );

            const isMatch =
                terms.length === 0
                    ? true
                    : mustMatchAll
                        ? terms.every((term) =>
                            normalizedValues.some((value) => value.includes(term))
                        )
                        : terms.some((term) =>
                            normalizedValues.some((value) => value.includes(term))
                        );

            if (!isMatch) continue;

            const key = `${doc.sheet}#${doc.row}`;
            if (seen.has(key)) continue;
            seen.add(key);
            results.push(doc);
        }
    }

    if (results.length === 0) {
        // 如果没有匹配到任何数据，退化为返回前几行，避免模型完全没有上下文
        return docs.slice(0, limit);
    }

    return results.slice(0, limit);
}

export class ExcelRetrievalService {
    private planner: ChatOpenAI;

    constructor() {
        this.planner = new ChatOpenAI({
            model: process.env.MODEL_NAME || "qwen3-32b",
            temperature: 0,
            apiKey: process.env.QWEN_API_KEY || process.env.OPENAI_API_KEY,
            configuration: {
                baseURL: process.env.QWEN_API_BASE || process.env.OPENAI_BASE_URL,
            },
        });
    }

    /**
     * 从 Excel 文件检索数据（传统方式：LLM 检索计划 + 精确匹配）
     */
    async retrieve(
        excelPath: string,
        query: string,
        maxRows: number = 10
    ): Promise<{
        matches: DocumentRow[];
        metadata: SheetMetadata[];
        searchPlans: SearchPlanItem[];
    }> {
        // 1. 加载 Excel 文件
        const workbook = xlsx.readFile(excelPath);
        const { documents, metadata } = extractRows(workbook);

        if (documents.length === 0) {
            throw new Error("Excel 文件未包含有效数据");
        }

        // 2. 使用 LLM 生成检索计划
        let plans: SearchPlanItem[] = [];
        try {
            plans = await this.requestSearchPlan(query, metadata);
        } catch (error) {
            console.warn("⚠️ 检索规划失败，使用默认关键字策略:", (error as Error).message);
        }

        // 3. 根据计划精确匹配行数据
        const matches = collectMatches(documents, plans, query, maxRows);

        return {
            matches,
            metadata,
            searchPlans: plans,
        };
    }

    /**
     * 使用 LLM 生成检索计划
     */
    private async requestSearchPlan(
        question: string,
        metadata: SheetMetadata[]
    ): Promise<SearchPlanItem[]> {
        const metadataSummary = JSON.stringify(metadata, null, 2);

        const prompt = `你收到一份 Excel 的元数据。每个工作表包含列名和示例行。\n\n元数据：\n${metadataSummary}\n\n用户问题：\n${question}\n\n请分析哪个工作表与问题最相关，并给出检索建议。\n输出 JSON 数组，每个元素包含：\n- sheet: 工作表名称（如果不确定，可以省略或留空）\n- search_terms: 需要在单元格中匹配的关键字数组，按重要性排序，可为空数组\n- columns: 你认为最重要的列名称数组，可选\n- top_k: 建议的返回行数，可选\n- must_match_all: 如果需要同时匹配多个词，设置为 true，可选\n\n仅返回 JSON，不要额外解释。`;

        const response = await this.planner.invoke([
            { role: "system", content: "你是一名擅长分析 Excel 数据的助手。" },
            { role: "user", content: prompt },
        ]);

        const plans = extractJsonArray(String(response.content)) || [];
        return plans.filter((item) => item && typeof item === "object");
    }

    /**
     * 将匹配结果转换为 JSON 字符串（用于 LLM 上下文）
     */
    formatMatchesAsJSON(matches: DocumentRow[]): string {
        return JSON.stringify(matches, null, 2);
    }
}

