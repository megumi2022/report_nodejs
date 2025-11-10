/**
 * 引用服务 - 管理引用匹配、验证和索引生成
 */

import { SearchResult } from "./vector-store-service.ts";

export interface Citation {
    text: string;
    source: string;
    location: string; // 如 "Excel-项目技术经济指标-第4行" 或 "PDF-第3页"
    score: number;
    verified: boolean;
    metadata: Record<string, any>;
}

export interface CitationIndex {
    section_id: string;
    section_title: string;
    citations: Citation[];
    generated_at: string;
}

export class CitationService {
    /**
     * Excel 字段同义词表
     * 支持字段名的语义匹配
     */
    private fieldSynonyms: Map<string, string[]> = new Map([
        ["工程费用", ["建设费用", "施工费用", "建安费用", "工程成本"]],
        ["总投资", ["项目总投资", "总投资额", "投资总额"]],
        ["建筑工程费", ["土建费用", "建筑费用", "建安工程费"]],
        ["设备购置费", ["设备费用", "设备投资", "设备采购费"]],
        ["其他费用", ["其他投资", "其他成本", "其他支出"]],
    ]);

    /**
     * 添加字段同义词
     */
    addFieldSynonyms(field: string, synonyms: string[]): void {
        this.fieldSynonyms.set(field, synonyms);
    }

    /**
     * 获取字段的所有同义词（包括自身）
     */
    getFieldSynonyms(field: string): string[] {
        const synonyms = this.fieldSynonyms.get(field) || [];
        return [field, ...synonyms];
    }

    /**
     * 匹配引用 - 从搜索结果生成引用
     */
    matchCitations(
        searchResults: SearchResult[],
        minScore: number = 0.7
    ): Citation[] {
        const citations: Citation[] = [];

        for (const result of searchResults) {
            if (result.score < minScore) continue;

            const location = this.formatLocation(result.metadata);
            const source = result.metadata.source || "未知来源";

            citations.push({
                text: result.content,
                source,
                location,
                score: result.score,
                verified: false, // 初始未验证
                metadata: result.metadata,
            });
        }

        return citations;
    }

    /**
     * 格式化位置信息
     */
    private formatLocation(metadata: Record<string, any>): string {
        const parts: string[] = [];

        if (metadata.type === "excel") {
            if (metadata.sheet) parts.push(metadata.sheet);
            if (metadata.row) parts.push(`第${metadata.row}行`);
        } else if (metadata.type === "pdf") {
            if (metadata.page) parts.push(`第${metadata.page}页`);
        }

        return parts.length > 0 ? parts.join("-") : "未知位置";
    }

    /**
     * 验证引用 - 检查生成文本是否真正使用了引用
     */
    verifyCitations(
        citations: Citation[],
        generatedText: string
    ): Citation[] {
        return citations.map((citation) => {
            // 简单的验证：检查生成文本中是否包含引用的关键信息
            const keyTerms = this.extractKeyTerms(citation.text);
            const hasMatch = keyTerms.some((term) =>
                generatedText.includes(term)
            );

            return {
                ...citation,
                verified: hasMatch,
            };
        });
    }

    /**
     * 提取关键术语
     */
    private extractKeyTerms(text: string): string[] {
        // 提取数字、重要名词等
        const numbers = text.match(/\d+[\.\d]*/g) || [];
        const importantWords = text
            .split(/[：:，,。.；;]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 2 && s.length < 20)
            .slice(0, 5);

        return [...numbers, ...importantWords];
    }

    /**
     * 生成引用索引表
     */
    generateCitationIndex(
        sectionId: string,
        sectionTitle: string,
        citations: Citation[]
    ): CitationIndex {
        return {
            section_id: sectionId,
            section_title: sectionTitle,
            citations,
            generated_at: new Date().toISOString(),
        };
    }

    /**
     * 合并引用上下文 - 为生成阶段准备
     */
    mergeCitationContext(citations: Citation[]): string {
        return citations
            .map(
                (citation, idx) =>
                    `[引用${idx + 1}] ${citation.text}\n来源: ${citation.location}`
            )
            .join("\n\n");
    }
}

