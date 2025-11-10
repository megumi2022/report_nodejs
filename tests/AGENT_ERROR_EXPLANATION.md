# Agent 调用工具 400 错误原因分析

## 问题现象

- ✅ **直接调用工具正常**：`client.callTool()` 可以成功调用
- ❌ **Agent 调用工具失败**：`agent.invoke()` 返回 400 错误

## 根本原因

### 1. **工具数量过多导致请求体过大**

**问题：**
- Playwright MCP Server 提供了 21 个工具
- LangChain 的 `createAgent` 会将所有工具转换为 OpenAI function calling 格式
- 每个工具包含：名称、描述、参数 schema（JSON Schema）
- 21 个工具的完整定义可能导致请求体超过模型 API 的限制

**证据：**
- 直接调用工具时，只发送单个工具调用的请求（小）
- Agent 调用时，需要将所有工具定义发送给模型（大）

### 2. **工具 Schema 转换问题**

**问题：**
- MCP 工具使用 JSON Schema 定义参数
- 需要转换为 Zod Schema 供 LangChain 使用
- 转换过程中可能：
  - 丢失某些信息
  - 生成不符合模型 API 要求的格式
  - 产生过于复杂的嵌套结构

### 3. **模型 API 限制**

**问题：**
- 某些模型 API 对 function calling 有限制：
  - 工具数量限制（通常 10-20 个）
  - 请求体大小限制
  - Schema 复杂度限制

## 解决方案

### 方案 1：自动工具筛选（已实现）

Pipeline 现在会自动筛选必要的工具：

```typescript
// 只保留最常用的工具
const essentialKeywords = [
    'navigate',      // 导航
    'snapshot',      // 快照
    'click',         // 点击
    'type',          // 输入
    'screenshot',    // 截图
    'wait',          // 等待
    'evaluate',      // 执行脚本
];
```

**配置：**
```bash
# .env 文件
MAX_TOOLS=10  # 最大工具数量，默认 10
```

### 方案 2：手动限制工具数量

在 `mcp/config.ts` 中只启用需要的工具：

```typescript
{
    type: "stdio",
    name: "playwright",
    command: "npx",
    args: ["@playwright/mcp@latest"],
    enabled: true,  // 只启用这一个
}
```

### 方案 3：使用调试测试找出限制

运行调试测试找出你的模型 API 支持的最大工具数量：

```bash
pnpm test:mcp:debug
```

这个测试会：
1. 测试基础调用（不带工具）
2. 测试单个工具
3. 逐步增加工具数量，找出阈值

## 为什么直接调用正常？

### 直接调用流程

```
你的代码 → MCP Client → MCP Server
```

- 只发送单个工具调用的请求
- 请求体小，只包含工具名和参数
- 不涉及模型 API

### Agent 调用流程

```
你的代码 → LangChain Agent → 模型 API (带所有工具定义) → 模型决定调用工具 → MCP Client → MCP Server
```

- 需要将所有工具定义发送给模型 API
- 请求体大，包含所有工具的完整定义
- 模型 API 可能拒绝过大的请求

## 诊断步骤

### 1. 运行调试测试

```bash
pnpm test:mcp:debug
```

这会帮你找出：
- 模型是否支持 function calling
- 支持的最大工具数量
- 具体哪个工具导致问题

### 2. 检查工具数量

```typescript
const tools = pipeline.getTools();
console.log("工具数量:", tools.length);
```

如果超过 10-15 个，可能需要减少。

### 3. 检查工具 Schema

```typescript
tools.forEach(tool => {
    console.log(tool.name, tool.schema);
});
```

检查是否有过于复杂的 schema。

## 最佳实践

1. **只启用需要的工具**
   - 在 `mcp/config.ts` 中禁用不需要的 Server
   - 或使用工具筛选功能

2. **使用环境变量控制**
   ```bash
   MAX_TOOLS=10  # 限制最大工具数量
   ```

3. **分阶段测试**
   - 先测试少量工具（1-3 个）
   - 逐步增加，找出阈值
   - 根据实际需求选择工具

4. **监控请求大小**
   - 如果可能，记录发送给模型 API 的请求大小
   - 确保不超过 API 限制

## 总结

**直接调用正常** = 工具本身没问题，MCP Server 工作正常

**Agent 调用失败** = 工具定义太多/太大，模型 API 拒绝请求

**解决方案** = 减少工具数量（已自动实现筛选功能）

