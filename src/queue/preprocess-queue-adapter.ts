import { Queue } from "bullmq";
import {
    PreprocessJobPayload,
    PreprocessQueueAdapter,
    PreprocessTaskType,
} from "../services/preprocess-types.ts";
import { getQueue } from "./queue-factory.ts";
import { QueueNames } from "./queue-names.ts";

const queueNameMap: Record<PreprocessTaskType, string> = {
    text: "preprocessText",
    image: "preprocessImage",
    excel: "preprocessExcel",
    json: "preprocessJson",
};

export class BullMQPreprocessQueueAdapter implements PreprocessQueueAdapter {
    private queues = new Map<PreprocessTaskType, Queue>();

    constructor() { }

    async enqueue(taskType: PreprocessTaskType, payload: PreprocessJobPayload): Promise<void> {
        const queue = this.getQueue(taskType);
        await queue.add(`${payload.assetId}:${taskType}`, payload, {
            removeOnComplete: 1000,
            removeOnFail: 5000,
        });
    }

    private getQueue(taskType: PreprocessTaskType): Queue {
        if (this.queues.has(taskType)) {
            return this.queues.get(taskType)!;
        }

        const queue = getQueue(queueNameMap[taskType] as keyof typeof QueueNames);
        this.queues.set(taskType, queue);
        return queue;
    }
}
