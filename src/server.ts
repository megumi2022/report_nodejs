import "dotenv/config";
import express from "express";
import cors from "cors";
import { AssetRegistryService, RegisterAssetInput } from "./services/asset-registry-service.ts";
import { PreprocessOrchestrator } from "./services/preprocess-orchestrator.ts";
import { OutlineService } from "./services/outline-service.ts";
import { ReportTaskOrchestrator } from "./workflows/report-task-orchestrator.ts";
import { TaskStateStore, TaskStatus } from "./services/task-state-store.ts";
import { TaskDispatcher } from "./queue/task-dispatcher.ts";
import { startAllWorkers } from "./workers/index.ts";

const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

const taskStateStore = new TaskStateStore();
const dispatcher = new TaskDispatcher(taskStateStore);
const assetRegistry = new AssetRegistryService();
const preprocessOrchestrator = new PreprocessOrchestrator(assetRegistry);
const outlineService = new OutlineService();
const reportOrchestrator = new ReportTaskOrchestrator(assetRegistry, dispatcher);

const workers = startAllWorkers(dispatcher);
console.log(`🚀 Workers started: ${workers.length}`);

function asyncHandler<T extends express.Request, U extends express.Response>(
    fn: (req: T, res: U) => Promise<void>
) {
    return (req: T, res: U, next: express.NextFunction) => {
        fn(req, res).catch(next);
    };
}

app.get("/healthz", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.post(
    "/api/projects/:projectId/assets",
    asyncHandler(async (req, res) => {
        const projectId = req.params.projectId;
        const { assets, templateKey, startPreprocess = true } = req.body as {
            assets: Array<Partial<RegisterAssetInput>>;
            templateKey?: string;
            startPreprocess?: boolean;
        };

        if (!Array.isArray(assets) || assets.length === 0) {
            res.status(400).json({ error: "assets 数组不能为空" });
            return;
        }

        const payloads: RegisterAssetInput[] = assets.map((asset, index) => {
            if (!asset.filename || !asset.storagePath || !asset.assetType) {
                throw new Error(`第 ${index + 1} 个资产缺少必要字段 (filename/storagePath/assetType)`);
            }

            return {
                projectId,
                templateKey: asset.templateKey ?? templateKey,
                filename: asset.filename,
                storagePath: asset.storagePath,
                storageBucket: asset.storageBucket,
                assetType: asset.assetType,
                mimeType: asset.mimeType,
                sizeBytes: asset.sizeBytes,
                checksum: asset.checksum,
                metadata: asset.metadata ?? {},
            };
        });

        const records = await assetRegistry.registerAssets(payloads);

        if (startPreprocess !== false) {
            for (const record of records) {
                await preprocessOrchestrator.handleNewAsset(record);
            }
        }

        res.json({ projectId, assets: records });
    })
);

app.get(
    "/api/projects/:projectId/assets",
    asyncHandler(async (req, res) => {
        const projectId = req.params.projectId;
        const assets = await assetRegistry.listAssetsByProject(projectId);
        res.json({ projectId, assets });
    })
);

app.post(
    "/api/projects/:projectId/outline/draft",
    asyncHandler(async (req, res) => {
        const projectId = req.params.projectId;
        const { templateKey, projectContext = {} } = req.body as {
            templateKey: string;
            projectContext?: Record<string, any>;
        };

        if (!templateKey) {
            res.status(400).json({ error: "templateKey 必填" });
            return;
        }

        const draft = await outlineService.generateDraft({
            projectId,
            templateKey,
            projectBackground: projectContext,
        });

        res.json(draft);
    })
);

app.post(
    "/api/projects/:projectId/dag/run",
    asyncHandler(async (req, res) => {
        const projectId = req.params.projectId;
        const { outline, projectContext = {}, metrics, writingJournal, evidenceMap } = req.body as {
            outline: any[];
            projectContext?: Record<string, any>;
            metrics?: any;
            writingJournal?: any;
            evidenceMap?: any;
        };

        if (!Array.isArray(outline) || outline.length === 0) {
            res.status(400).json({ error: "outline 必须是非空数组" });
            return;
        }

        const dag = await reportOrchestrator.schedule(projectId, outline, {
            projectContext,
            metrics,
            writingJournal,
            evidenceMap,
        });

        res.json({ projectId, dag });
    })
);

app.post(
    "/api/projects/:projectId/dag/resume",
    asyncHandler(async (req, res) => {
        const projectId = req.params.projectId;
        await reportOrchestrator.resume(projectId);
        res.json({ projectId, status: "resumed" });
    })
);

app.get(
    "/api/projects/:projectId/tasks",
    asyncHandler(async (req, res) => {
        const projectId = req.params.projectId;
        const statusParam = req.query.status as string | undefined;
        const statuses = statusParam ? (statusParam.split(",") as TaskStatus[]) : undefined;
        const tasks = await taskStateStore.listTasks(projectId, { statuses });
        res.json({ projectId, tasks });
    })
);

app.get(
    "/api/projects/:projectId/tasks/ready",
    asyncHandler(async (req, res) => {
        const projectId = req.params.projectId;
        const tasks = await taskStateStore.listReadyTasks(projectId);
        res.json({ projectId, tasks });
    })
);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("API Error:", err);
    res.status(500).json({ error: err.message || "Internal Server Error" });
});

const port = Number(process.env.PORT || 3000);

if (process.env.NODE_ENV !== "test") {
    app.listen(port, () => {
        console.log(`✅ Demo API server listening on http://localhost:${port}`);
    });
}

export default app;
