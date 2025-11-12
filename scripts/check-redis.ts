#!/usr/bin/env tsx
/**
 * 检查 Redis 连接配置
 * 运行: tsx scripts/check-redis.ts
 * 或: pnpm check:redis
 */

import "dotenv/config";
import Redis from "ioredis";

async function checkRedis() {
    console.log("🔍 检查 Redis 连接配置...\n");

    // 检查配置
    const redisUrl = process.env.REDIS_URL;
    const redisHost = process.env.REDIS_HOST;
    const redisPort = process.env.REDIS_PORT;
    const redisPassword = process.env.REDIS_PASSWORD;
    const redisDb = process.env.REDIS_DB;

    let client: Redis | null = null;

    // 优先使用 REDIS_URL
    if (redisUrl) {
        console.log("✅ 使用 REDIS_URL 连接");
        console.log(`   URL: ${redisUrl.replace(/:[^:@]+@/, ":****@")}\n`); // 隐藏密码

        try {
            client = new Redis(redisUrl);
        } catch (error: any) {
            console.error("❌ 创建 Redis 客户端失败:", error.message);
            process.exit(1);
        }
    } else if (redisHost) {
        console.log("✅ 使用独立配置连接");
        console.log(`   Host: ${redisHost}`);
        console.log(`   Port: ${redisPort || 6379}`);
        console.log(`   DB: ${redisDb || 0}`);
        console.log(`   Password: ${redisPassword ? "****" : "未设置"}\n`);

        try {
            client = new Redis({
                host: redisHost,
                port: parseInt(redisPort || "6379"),
                password: redisPassword,
                db: parseInt(redisDb || "0"),
                retryStrategy: (times) => {
                    // 最多重试 3 次
                    if (times > 3) {
                        return null; // 停止重试
                    }
                    return Math.min(times * 200, 1000);
                },
            });
        } catch (error: any) {
            console.error("❌ 创建 Redis 客户端失败:", error.message);
            process.exit(1);
        }
    } else {
        console.error("❌ Redis 配置未找到");
        console.error("   请在 .env 中设置以下之一：");
        console.error("   方式 1（推荐）:");
        console.error("   REDIS_URL=redis://default:password@host:port");
        console.error("   方式 2:");
        console.error("   REDIS_HOST=localhost");
        console.error("   REDIS_PORT=6379");
        console.error("   REDIS_PASSWORD=  # 可选");
        console.error("   REDIS_DB=0       # 可选，默认 0");
        console.error("\n💡 Upstash 示例:");
        console.error("   REDIS_URL=redis://default:your-password@your-endpoint.upstash.io:6379");
        process.exit(1);
    }

    // 监听连接事件
    client.on("error", (error) => {
        console.error("❌ Redis 连接错误:", error.message);
    });

    client.on("connect", () => {
        console.log("✅ Redis 连接成功\n");
    });

    // 测试连接
    try {
        console.log("📋 测试连接...");
        await client.ping();
        console.log("✅ PING 成功\n");

        // 测试基本操作
        console.log("📋 测试基本操作...");

        // SET
        const testKey = "test:connection";
        const testValue = `test-${Date.now()}`;
        await client.set(testKey, testValue);
        console.log(`✅ SET 成功: ${testKey} = ${testValue}`);

        // GET
        const retrievedValue = await client.get(testKey);
        if (retrievedValue === testValue) {
            console.log(`✅ GET 成功: ${testKey} = ${retrievedValue}`);
        } else {
            console.error(`❌ GET 失败: 期望 ${testValue}, 实际 ${retrievedValue}`);
        }

        // DEL
        await client.del(testKey);
        const deletedValue = await client.get(testKey);
        if (deletedValue === null) {
            console.log(`✅ DEL 成功: ${testKey} 已删除`);
        } else {
            console.error(`❌ DEL 失败: ${testKey} 仍然存在`);
        }

        // 测试 JSON 操作
        console.log("\n📋 测试 JSON 操作...");
        const jsonKey = "test:json";
        const jsonValue = { name: "test", timestamp: Date.now() };
        await client.set(jsonKey, JSON.stringify(jsonValue));
        const retrievedJson = await client.get(jsonKey);
        if (retrievedJson) {
            const parsed = JSON.parse(retrievedJson);
            if (parsed.name === jsonValue.name) {
                console.log(`✅ JSON 操作成功: ${jsonKey}`);
            } else {
                console.error(`❌ JSON 解析失败`);
            }
        }
        await client.del(jsonKey);

        // 获取服务器信息
        console.log("\n📋 获取服务器信息...");
        const info = await client.info("server");
        const versionMatch = info.match(/redis_version:([^\r\n]+)/);
        if (versionMatch) {
            console.log(`✅ Redis 版本: ${versionMatch[1]}`);
        }

        // 获取数据库信息
        const dbSize = await client.dbsize();
        console.log(`✅ 当前数据库键数量: ${dbSize}`);

        console.log("\n✅ 所有测试通过！Redis 连接正常。");
    } catch (error: any) {
        console.error("\n❌ 测试失败:", error.message);
        if (error.message.includes("ECONNREFUSED")) {
            console.error("\n💡 可能的原因：");
            console.error("   1. Redis 服务器未启动");
            console.error("   2. 主机地址或端口配置错误");
            console.error("   3. 防火墙阻止连接");
        } else if (error.message.includes("NOAUTH")) {
            console.error("\n💡 可能的原因：");
            console.error("   1. 密码配置错误");
            console.error("   2. Redis 服务器需要认证但未提供密码");
        } else if (error.message.includes("timeout")) {
            console.error("\n💡 可能的原因：");
            console.error("   1. 网络连接问题");
            console.error("   2. Redis 服务器响应慢");
            console.error("   3. 防火墙或代理问题");
        }
        process.exit(1);
    } finally {
        // 关闭连接
        if (client) {
            await client.quit();
            console.log("\n✅ 连接已关闭");
        }
    }
}

checkRedis().catch((error) => {
    console.error("❌ 检查失败:", error);
    process.exit(1);
});

