import { TemplateService, ReportTemplate } from "./template-service.ts";
import { SpecializedAgents } from "../agents/specialized-agents.ts";
import { parseTemplateToOutline, OutlineNode } from "../tools/outline-parser.ts";
import { OutputManager } from "../tools/output-manager.ts";

export interface GenerateOutlineInput {
    projectId: string;
    templateKey: string;
    projectBackground: Record<string, any>;
}

export interface OutlineDraftResult {
    outline: OutlineNode[];
    version: number;
    outlinePath: string;
    template: ReportTemplate;
}

export class OutlineService {
    private templateService: TemplateService;
    private agents: SpecializedAgents;
    private initialized = false;

    constructor(options?: { templateService?: TemplateService; agents?: SpecializedAgents }) {
        this.templateService = options?.templateService ?? new TemplateService();
        this.agents = options?.agents ?? new SpecializedAgents();
    }

    async initialize(): Promise<void> {
        if (this.initialized) return;
        await this.agents.initialize();
        this.initialized = true;
    }

    async generateDraft(input: GenerateOutlineInput): Promise<OutlineDraftResult> {
        await this.initialize();

        const template = await this.templateService.getTemplate(input.templateKey);
        if (!template) {
            throw new Error(`未找到模板: ${input.templateKey}`);
        }

        const outline = await parseTemplateToOutline(
            template.outline_structure || [],
            async (section, projectBackground) =>
                await this.agents.generateSubtitles(section, projectBackground),
            input.projectBackground
        );

        const outputManager = new OutputManager(input.projectId);
        const version = await outputManager.getNextVersion("outlineV");
        const outlinePath = await outputManager.saveNodeOutput("outline", outline, version);

        return {
            outline,
            version,
            outlinePath,
            template,
        };
    }
}
