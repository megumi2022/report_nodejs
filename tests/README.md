# MCP 测试用例

本目录包含所有 MCP (Model Context Protocol) 相关的测试用例。

## 测试文件说明

### 1. `mcp-manager.test.ts` - MCP 管理器测试

测试统一的 MCP Client Manager 的基本功能：

- ✅ 注册 MCP Server 配置
- ✅ 连接/断开 Server
- ✅ 健康检查
- ✅ 获取工具列表
- ✅ 获取资源列表
- ✅ 测试所有 Server 的连通性

**运行方式：**
```bash
pnpm test:mcp:manager
# 或
tsx tests/mcp-manager.test.ts
```

### 2. `mcp-direct.test.ts` - 直接工具调用测试

测试直接调用 MCP 工具（不通过 Agent）：

- ✅ 连接 MCP Server
- ✅ 获取工具列表
- ✅ 直接调用工具
- ✅ 验证工具返回结果

**运行方式：**
```bash
pnpm test:mcp:direct
# 或
tsx tests/mcp-direct.test.ts
```

### 3. `mcp-agent.test.ts` - Agent 集成测试

测试 LangChain Agent 是否能正确调用 MCP 工具：

- ✅ Pipeline 初始化
- ✅ 工具自动发现和加载
- ✅ Agent 调用工具
- ✅ 错误处理

**运行方式：**
```bash
pnpm test:mcp:agent
# 或
tsx tests/mcp-agent.test.ts
```

## 运行所有测试

```bash
# 运行所有 MCP 测试
pnpm test:mcp:all
```

## 测试配置

测试使用的配置来自 `../mcp/config.ts`，确保：

1. 在 `mcp/config.ts` 中配置了要测试的 MCP Server
2. 确保 Server 已启用（`enabled: true`）
3. 对于 stdio 方式，确保命令和参数正确
4. 对于 http 方式，确保 baseURL 可访问

## 环境变量

测试需要以下环境变量（在 `.env` 文件中配置）：

```bash
# 模型配置
QWEN_API_KEY=your-api-key
QWEN_API_BASE=http://your-api-base
MODEL_NAME=qwen3-32b
TEMPERATURE=0.7

# HTTP MCP Server 配置（如果使用）
PLAYWRIGHT_MCP_URL=http://localhost:3001
FILESYSTEM_MCP_URL=http://localhost:3002
```

## 测试顺序建议

1. **先运行 `mcp-manager.test.ts`** - 验证 MCP Server 连接
2. **再运行 `mcp-direct.test.ts`** - 验证工具本身是否正常
3. **最后运行 `mcp-agent.test.ts`** - 验证 Agent 集成

## 故障排查

### 连接失败

- 检查 MCP Server 配置是否正确
- 确认 Server 是否已启动（http 方式）
- 检查网络连接和防火墙设置

### 工具调用失败

- 检查工具参数是否正确
- 查看工具 schema 是否符合要求
- 验证工具是否真的可用

### Agent 调用失败

- 检查工具数量是否过多（可能导致 400 错误）
- 验证模型 API 是否支持 function calling
- 查看错误日志获取详细信息

