import { Queue } from "bullmq";
import { createBullMQConnection } from "../services/redis-service.ts";
import { QueueNames } from "./queue-names.ts";

const queueCache = new Map<string, Queue>();

export function getQueue(name: keyof typeof QueueNames): Queue {
    const queueName = QueueNames[name];
    if (queueCache.has(queueName)) {
        return queueCache.get(queueName)!;
    }

    const queue = new Queue(queueName, {
        connection: createBullMQConnection(),
    });
    queueCache.set(queueName, queue);
    return queue;
}
