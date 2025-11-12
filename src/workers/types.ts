import { OutlineNode } from "../tools/outline-parser.ts";
import { PreprocessJobPayload } from "../services/preprocess-types.ts";

export type PlannerJobData = {
    projectId: string;
    outlineNode: OutlineNode;
    projectContext: Record<string, any>;
    assetsAvailability: {
        embedReady: boolean;
        tableReady: boolean;
    };
};

export type PlannerJobResult = {
    prompts: {
        user_prompt_text?: string;
        user_prompt_table?: string | null;
        user_prompt_image?: string | null;
    };
    queries: string[];
};

export type RetrieverJobData = {
    projectId: string;
    nodeId: string;
    queries: string[];
    limit?: number;
};

export type RetrieverJobResult = {
    contextPack: Array<{
        source: string;
        type: "vector" | "excel" | "web" | "database" | "image";
        payload: any;
    }>;
};

export type WriterJobData = {
    projectId: string;
    nodeId: string;
    title: string;
    prompt: string;
    contextPack: RetrieverJobResult["contextPack"];
    metrics?: any;
    writingJournal?: any;
};

export type WriterJobResult = {
    draft: any;
    references: any[];
};

export type VerifierJobData = {
    projectId: string;
    nodeId: string;
    draft: any;
    metrics?: any;
    evidenceMap?: any;
};

export type VerifierJobResult =
    | { status: "accept"; draft: any }
    | { status: "soft_fail"; draft: any; violations: any[]; patches: any[] }
    | { status: "hard_fail"; draft: any; violations: any[] };

export type AssemblerJobData = {
    projectId: string;
    nodeId: string;
    draft?: any;
    fixedBlocks?: any[];
    children?: string[];
};

export type AssemblerJobResult = {
    sectionId: string;
    content: any;
    artifacts?: Record<string, string>;
};

export type MaterializerJobData = {
    projectId: string;
    nodeId: string;
    fixedContent: string;
    bindings?: Record<string, any>;
};

export type MaterializerJobResult = {
    nodeId: string;
    renderedBlock: any;
};

export type AutoFixerJobData = {
    projectId: string;
    nodeId: string;
    draft: any;
    patches: any[];
};

export type AutoFixerJobResult = {
    draft: any;
    appliedPatches: number;
};

export type PreprocessJobResult = {
    assetId: string;
    status: "completed" | "failed";
    meta?: Record<string, any>;
};

export type WorkerJobDataMap = {
    planner: PlannerJobData;
    retriever: RetrieverJobData;
    writer: WriterJobData;
    verifier: VerifierJobData;
    assembler: AssemblerJobData;
    materializer: MaterializerJobData;
    autofixer: AutoFixerJobData;
    preprocess: PreprocessJobPayload;
};
