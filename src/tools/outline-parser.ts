/**
 * 大纲解析工具 - 递归解析模板结构，生成大纲 JSON
 */

export interface OutlineNode {
    chapter_number: string;
    title: string;
    govern_standard?: string;
    generate_prompt: boolean;
    fixed_content?: string;
    enable_subtitles_generation: boolean;
    outline_structure?: OutlineNode[];
}

/**
 * 递归解析模板结构，生成大纲 JSON
 */
export async function parseTemplateToOutline(
    outlineStructure: any[],
    generateSubtitlesFn: (section: any, projectBackground: any) => Promise<string[]>,
    projectBackground: any
): Promise<OutlineNode[]> {
    const result: OutlineNode[] = [];

    for (const section of outlineStructure) {
        if (!section.id || !section.title) continue;

        const enableSubtitles = section.enable_subtitles_generation === true;

        const node: OutlineNode = {
            chapter_number: section.id,
            title: section.title,
            generate_prompt: section.generation_mode === "ai", // 根据 generation_mode 设置
            enable_subtitles_generation: enableSubtitles,
        };

        // 保存 govern_standard
        if (section.govern_standard) {
            node.govern_standard = section.govern_standard;
        }

        // 如果是 fixed 模式，保存 fixed_content
        if (section.generation_mode === "fixed") {
            node.generate_prompt = false;
            if (section.fixed_content) {
                node.fixed_content = section.fixed_content;
            }
        }

        const childNodes: OutlineNode[] = [];

        // 如果 enable_subtitles_generation=true，生成子标题作为子节点
        if (section.enable_subtitles_generation === true) {
            try {
                const subtitles = await generateSubtitlesFn(section, projectBackground);
                const generatedChildren = subtitles.map((title, index) => ({
                    chapter_number: `${section.id}.${index + 1}`,
                    title,
                    generate_prompt: true,
                    govern_standard: "",
                    enable_subtitles_generation: false,
                }));
                childNodes.push(...generatedChildren);
            } catch (error: any) {
                console.warn(`生成子标题失败 (${section.id}):`, error.message);
            }
        }

        // 递归处理子章节
        if (section.outline_structure && Array.isArray(section.outline_structure)) {
            const nestedChildren = await parseTemplateToOutline(
                section.outline_structure,
                generateSubtitlesFn,
                projectBackground
            );
            childNodes.push(...nestedChildren);
        }

        if (childNodes.length > 0) {
            node.outline_structure = childNodes;
        }

        result.push(node);
    }

    return result;
}

