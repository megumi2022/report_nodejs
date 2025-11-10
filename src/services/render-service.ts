/**
 * 渲染服务 - 将生成的内容渲染为最终报告
 */

export interface ReportContent {
    sections: ReportSection[];
    metadata?: {
        title: string;
        projectId: string;
        templateKey: string;
        generatedAt: string;
    };
}

export interface ReportSection {
    id: string;
    title: string;
    content: {
        text?: string;
        tables?: any[];
        images?: string[];
    };
}

export class RenderService {
    /**
     * 渲染报告为 Markdown 格式
     */
    renderToMarkdown(content: ReportContent): string {
        let markdown = "";

        // 添加元数据
        if (content.metadata) {
            markdown += `# ${content.metadata.title}\n\n`;
            markdown += `**项目ID**: ${content.metadata.projectId}\n`;
            markdown += `**模板**: ${content.metadata.templateKey}\n`;
            markdown += `**生成时间**: ${content.metadata.generatedAt}\n\n`;
            markdown += "---\n\n";
        }

        // 渲染各个章节
        for (const section of content.sections) {
            markdown += `## ${section.title}\n\n`;

            if (section.content.text) {
                markdown += `${section.content.text}\n\n`;
            }

            if (section.content.tables && section.content.tables.length > 0) {
                for (const table of section.content.tables) {
                    markdown += this.renderTable(table);
                    markdown += "\n\n";
                }
            }

            if (section.content.images && section.content.images.length > 0) {
                for (const image of section.content.images) {
                    markdown += `![Image](${image})\n\n`;
                }
            }

            markdown += "---\n\n";
        }

        return markdown;
    }

    /**
     * 渲染报告为 HTML 格式
     */
    renderToHTML(content: ReportContent): string {
        let html = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>${content.metadata?.title || "报告"}</title>
    <style>
        body { font-family: Arial, sans-serif; max-width: 1200px; margin: 0 auto; padding: 20px; }
        h1 { color: #333; border-bottom: 2px solid #333; padding-bottom: 10px; }
        h2 { color: #666; margin-top: 30px; }
        table { border-collapse: collapse; width: 100%; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
        .metadata { background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-bottom: 20px; }
    </style>
</head>
<body>`;

        if (content.metadata) {
            html += `
    <div class="metadata">
        <h1>${content.metadata.title}</h1>
        <p><strong>项目ID:</strong> ${content.metadata.projectId}</p>
        <p><strong>模板:</strong> ${content.metadata.templateKey}</p>
        <p><strong>生成时间:</strong> ${content.metadata.generatedAt}</p>
    </div>`;
        }

        for (const section of content.sections) {
            html += `\n    <section>\n        <h2>${section.title}</h2>\n`;

            if (section.content.text) {
                html += `        <div>${this.markdownToHTML(section.content.text)}</div>\n`;
            }

            if (section.content.tables && section.content.tables.length > 0) {
                for (const table of section.content.tables) {
                    html += this.renderTableHTML(table);
                }
            }

            if (section.content.images && section.content.images.length > 0) {
                for (const image of section.content.images) {
                    html += `        <img src="${image}" alt="Image" style="max-width: 100%; margin: 20px 0;" />\n`;
                }
            }

            html += `    </section>\n`;
        }

        html += `</body>\n</html>`;
        return html;
    }

    /**
     * 渲染表格为 Markdown
     */
    private renderTable(table: any): string {
        // 简化实现，实际应该根据表格数据结构渲染
        if (Array.isArray(table) && table.length > 0) {
            const headers = Object.keys(table[0]);
            let markdown = "| " + headers.join(" | ") + " |\n";
            markdown += "| " + headers.map(() => "---").join(" | ") + " |\n";

            for (const row of table) {
                markdown += "| " + headers.map(h => row[h] || "").join(" | ") + " |\n";
            }

            return markdown;
        }
        return "";
    }

    /**
     * 渲染表格为 HTML
     */
    private renderTableHTML(table: any): string {
        if (Array.isArray(table) && table.length > 0) {
            const headers = Object.keys(table[0]);
            let html = "        <table>\n            <thead>\n                <tr>\n";
            html += headers.map(h => `                    <th>${h}</th>`).join("\n") + "\n";
            html += "                </tr>\n            </thead>\n            <tbody>\n";

            for (const row of table) {
                html += "                <tr>\n";
                html += headers.map(h => `                    <td>${row[h] || ""}</td>`).join("\n") + "\n";
                html += "                </tr>\n";
            }

            html += "            </tbody>\n        </table>\n";
            return html;
        }
        return "";
    }

    /**
     * 简单的 Markdown 转 HTML（简化版）
     */
    private markdownToHTML(markdown: string): string {
        return markdown
            .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
            .replace(/\*(.*?)\*/g, "<em>$1</em>")
            .replace(/\n/g, "<br>");
    }
}

