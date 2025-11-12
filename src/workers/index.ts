import { Worker } from "bullmq";
import {
    createPreprocessTextWorker,
    createPreprocessImageWorker,
    createPreprocessExcelWorker,
    createPreprocessJsonWorker,
} from "./preprocess-workers.ts";
import {
    createPlannerWorker,
    createRetrieverWorker,
    createWriterWorker,
    createVerifierWorker,
    createAssemblerWorker,
    createMaterializerWorker,
    createAutoFixerWorker,
} from "./agent-workers.ts";
import { TaskDispatcher, WorkerResultEvent } from "../queue/task-dispatcher.ts";

interface WorkerDescriptor {
    worker: Worker<any, any>;
    type: WorkerResultEvent["type"];
}

function attachDispatcher(worker: Worker<any, any>, dispatcher: TaskDispatcher, type: WorkerResultEvent["type"]): void {
    worker.on("active", async (job) => {
        await dispatcher.handleWorkerProgress({
            projectId: job.data.projectId,
            nodeId: job.data.nodeId,
            type,
            status: "running",
        });
    });

    worker.on("completed", async (job, result) => {
        await dispatcher.handleWorkerResult({
            projectId: job.data.projectId,
            nodeId: job.data.nodeId,
            type,
            result,
        });
    });

    worker.on("failed", async (job, err) => {
        await dispatcher.handleWorkerProgress({
            projectId: job?.data?.projectId,
            nodeId: job?.data?.nodeId,
            type,
            status: "failed",
            error: err?.message,
        });
    });
}

export function startAllWorkers(dispatcher = new TaskDispatcher()): Worker<any, any>[] {
    const preprocessWorkers = [
        createPreprocessTextWorker(),
        createPreprocessImageWorker(),
        createPreprocessExcelWorker(),
        createPreprocessJsonWorker(),
    ];

    const dagWorkers: WorkerDescriptor[] = [
        { worker: createPlannerWorker(), type: "prepare" },
        { worker: createRetrieverWorker(), type: "retrieve" },
        { worker: createWriterWorker(), type: "write" },
        { worker: createVerifierWorker(), type: "verify" },
        { worker: createAssemblerWorker(), type: "assemble" },
        { worker: createMaterializerWorker(), type: "materialize_fixed" },
        { worker: createAutoFixerWorker(), type: "autofix" },
    ];

    dagWorkers.forEach(({ worker, type }) => attachDispatcher(worker, dispatcher, type));
    return [...preprocessWorkers, ...dagWorkers.map((descriptor) => descriptor.worker)];
}

export {
    createPreprocessTextWorker,
    createPreprocessImageWorker,
    createPreprocessExcelWorker,
    createPreprocessJsonWorker,
    createPlannerWorker,
    createRetrieverWorker,
    createWriterWorker,
    createVerifierWorker,
    createAssemblerWorker,
    createMaterializerWorker,
    createAutoFixerWorker,
};
