const QUEUE_PREFIX = "report";

const toQueueName = (...parts: string[]) => [QUEUE_PREFIX, ...parts].join("-");

export const QueueNames = {
    preprocessText: toQueueName("preprocess", "text"),
    preprocessImage: toQueueName("preprocess", "image"),
    preprocessExcel: toQueueName("preprocess", "excel"),
    preprocessJson: toQueueName("preprocess", "json"),
    planner: toQueueName("planner"),
    retriever: toQueueName("retriever"),
    writer: toQueueName("writer"),
    verifier: toQueueName("verifier"),
    assembler: toQueueName("assembler"),
    autofixer: toQueueName("autofixer"),
    materializer: toQueueName("materializer"),
};

export type QueueName = keyof typeof QueueNames;
