import Redis from "ioredis";
import "dotenv/config";

let sharedClient: Redis | null = null;

function getRedisUrl(): string {
    const url = process.env.REDIS_URL;
    if (!url) {
        throw new Error("未配置 REDIS_URL，请在 .env 中设置 Upstash 或 Redis 连接字符串");
    }
    return url;
}

export function getRedisClient(): Redis {
    if (sharedClient) {
        return sharedClient;
    }

    const url = getRedisUrl();
    sharedClient = new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });

    sharedClient.on("error", (err) => {
        console.error("Redis 连接错误:", err);
    });

    sharedClient.on("connect", () => {
        console.log("✅ Redis 已连接 (共享客户端)");
    });

    return sharedClient;
}

export function createBullMQConnection(): Redis {
    const url = getRedisUrl();
    return new Redis(url, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });
}
