# MCP 统一管理架构

## 架构概述

这是一个统一的管理结构，支持 **Stdio** 和 **HTTP** 两种传输方式，通过统一的接口进行管理。

```
┌─────────────────────────────────────────┐
│      MCPClientManager (统一管理器)      │
└─────────────────────────────────────────┘
              │
      ┌───────┴───────┐
      │               │
┌─────▼─────┐   ┌─────▼─────┐
│ Stdio     │   │ HTTP      │
│ Client    │   │ Client    │
└───────────┘   └───────────┘
      │               │
      └───────┬───────┘
              │
      ┌───────▼───────┐
      │  IMCPClient   │
      │  (统一接口)   │
      └───────────────┘
```

## 目录结构

```
mcp/
├── types.ts          # 统一类型定义和接口
├── stdioClient.ts    # Stdio 传输实现
├── httpClient.ts     # HTTP 传输实现
├── manager.ts        # 统一管理器
├── config.ts         # 配置文件
├── index.ts          # 统一导出
└── README.md         # 本文档
```

## 核心组件

### 1. `types.ts` - 统一类型定义

定义了所有共享的类型和接口：

- `IMCPClient` - 统一的客户端接口
- `MCPServerConfig` - 联合类型，支持 stdio 和 http 配置
- `MCPTool`, `MCPToolCallResult` - 工具相关类型

### 2. `stdioClient.ts` - Stdio 实现

使用 MCP SDK 的官方 Client，通过进程间通信：

```typescript
import { StdioMCPClient } from "./mcp/index.ts";

const client = new StdioMCPClient({
    type: "stdio",
    name: "playwright",
    command: "npx",
    args: ["@playwright/mcp@latest"],
});
```

### 3. `httpClient.ts` - HTTP 实现

使用原生 fetch API，通过 HTTP 请求：

```typescript
import { HTTPMCPClient } from "./mcp/index.ts";

const client = new HTTPMCPClient({
    type: "http",
    name: "playwright-http",
    baseURL: "http://localhost:3001",
    apiKey: "your-key",
});
```

### 4. `manager.ts` - 统一管理器

`MCPClientManager` 类统一管理所有客户端：

```typescript
import { MCPClientManager } from "./mcp/index.ts";

const manager = new MCPClientManager();
manager.registerServers(configs);
await manager.connectServer("playwright");
const client = manager.getClient("playwright");
```

### 5. `config.ts` - 统一配置

支持混合配置 stdio 和 http：

```typescript
export const mcpServerConfigs: MCPServerConfig[] = [
    {
        type: "stdio",
        name: "playwright",
        command: "npx",
        args: ["@playwright/mcp@latest"],
    },
    {
        type: "http",
        name: "playwright-http",
        baseURL: "http://localhost:3001",
    },
];
```

## 使用示例

### 基本使用

```typescript
import { MCPClientManager } from "./mcp/index.ts";
import { mcpServerConfigs } from "./mcp/config.ts";

// 创建管理器
const manager = new MCPClientManager();
manager.registerServers(mcpServerConfigs);

// 连接 Server
await manager.connectServer("playwright");

// 获取客户端
const client = manager.getClient("playwright");
if (client) {
    // 使用统一的接口
    const tools = await client.listTools();
    const result = await client.callTool("navigate", { url: "https://example.com" });
}
```

### 在 Pipeline 中使用

```typescript
import { MCPAgentPipeline } from "../src/agents/mcp-pipeline.ts";

const pipeline = new MCPAgentPipeline();
await pipeline.initialize();
const result = await pipeline.execute("你的问题");
```

### 测试所有 Server

```typescript
import { MCPClientManager } from "./mcp/index.ts";

const manager = new MCPClientManager();
manager.registerServers(mcpServerConfigs);

// 测试所有 Server
const results = await manager.testAllServers();
results.forEach((status, name) => {
    console.log(`${name}: ${status.connected ? "✅" : "❌"}`);
});
```

## 配置说明

### Stdio 配置

```typescript
{
    type: "stdio",
    name: "server-name",
    command: "npx",              // 启动命令
    args: ["@package/name"],      // 命令参数
    env: { KEY: "value" },       // 环境变量（可选）
    description: "描述",          // 描述（可选）
    enabled: true,                // 是否启用（可选，默认 true）
}
```

### HTTP 配置

```typescript
{
    type: "http",
    name: "server-name",
    baseURL: "http://localhost:3001",  // HTTP 端点
    apiKey: "your-key",                // API 密钥（可选）
    timeout: 30000,                     // 超时时间（可选，默认 30000ms）
    headers: { "X-Custom": "value" },   // 额外请求头（可选）
    description: "描述",                 // 描述（可选）
    enabled: true,                       // 是否启用（可选，默认 true）
}
```

## 统一接口

所有客户端都实现 `IMCPClient` 接口，提供统一的方法：

- `getName()` - 获取客户端名称
- `connect()` - 连接/初始化
- `disconnect()` - 断开连接
- `isConnected()` - 检查连接状态
- `healthCheck()` - 健康检查
- `listTools()` - 获取工具列表
- `callTool()` - 调用工具
- `listResources()` - 获取资源列表
- `getResource()` - 获取资源内容

## 优势

### 1. 统一接口
- ✅ 无论使用哪种传输方式，API 完全一致
- ✅ 可以轻松切换传输方式
- ✅ 代码复用性高

### 2. 灵活配置
- ✅ 支持混合使用 stdio 和 http
- ✅ 可以启用/禁用特定 Server
- ✅ 配置集中管理

### 3. 易于扩展
- ✅ 添加新的传输方式只需实现 `IMCPClient` 接口
- ✅ 管理器自动处理不同类型的客户端
- ✅ 不影响现有代码

### 4. 类型安全
- ✅ 完整的 TypeScript 类型定义
- ✅ 联合类型确保配置正确
- ✅ 编译时类型检查

## 运行测试

```bash
# 测试统一管理器
pnpm test:unified

# 测试旧版 stdio 管理器
pnpm test:mcp
```

## 迁移指南

### 从旧版迁移

**旧版（mcp_manager.ts）：**
```typescript
import { MCPServerManager } from "./mcp_manager.ts";
const manager = new MCPServerManager();
```

**新版（统一管理器）：**
```typescript
import { MCPClientManager } from "./mcp/index.ts";
const manager = new MCPClientManager();
```

接口基本一致，只需更改导入路径。

### 从 HTTP 客户端迁移

**旧版（mcpClient.ts）：**
```typescript
import { MCPHTTPClient } from "./mcpClient.ts";
const client = new MCPHTTPClient();
```

**新版（统一管理器）：**
```typescript
import { MCPClientManager } from "./mcp/index.ts";
const manager = new MCPClientManager();
manager.registerServer({ type: "http", ... });
```

## 下一步

- [ ] 添加 SSE 支持（流式响应）
- [ ] 添加连接池
- [ ] 添加请求重试机制
- [ ] 添加性能监控
- [ ] 添加缓存支持

