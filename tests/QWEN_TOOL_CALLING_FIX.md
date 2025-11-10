# Qwen3-32B 工具调用 400 错误解决方案

## 问题现象

即使单个工具也返回 400 错误，说明问题不在工具数量，而在模型 API 的工具调用配置。

## 可能的原因

### 1. **后端未启用工具调用功能**（最可能）

Qwen3-32B 需要后端部署时启用工具调用功能：

```bash
# 使用 vLLM 部署时，需要添加这些参数：
vllm serve ./Qwen3-32B \
  --enable-auto-tool-choice \
  --tool-call-parser hermes  # 或 pythonic
```

**检查方法：**
- 查看后端启动日志，确认是否启用了 `--enable-auto-tool-choice`
- 如果没有，需要重启后端并添加该参数

### 2. **工具调用解析器不匹配**

Qwen3-32B 支持不同的工具调用解析器：
- `hermes` - 标准格式（推荐）
- `pythonic` - Python 风格格式
- `openai` - OpenAI 标准格式

**检查方法：**
```bash
# 查看后端启动参数
ps aux | grep vllm
# 或查看启动脚本
```

**解决方案：**
```bash
# 使用 hermes 解析器（推荐）
--tool-call-parser hermes

# 或使用 openai 解析器（如果支持）
--tool-call-parser openai
```

### 3. **模型名称大小写问题**

某些 API 对模型名称大小写敏感：
- `qwen3-32b` ✅
- `qwen3-32B` ✅
- `Qwen3-32B` ❌

**检查方法：**
运行测试脚本：
```bash
pnpm test:mcp:qwen
```

这会测试不同的模型名称格式。

### 4. **API 端点不兼容**

确认你的 API 端点支持 OpenAI 兼容的工具调用格式。

**检查方法：**
```bash
# 测试 API 端点
curl -X POST http://your-api-base/v1/chat/completions \
  -H "Authorization: Bearer $QWEN_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen3-32b",
    "messages": [{"role": "user", "content": "你好"}],
    "tools": [{
      "type": "function",
      "function": {
        "name": "test_tool",
        "description": "test",
        "parameters": {}
      }
    }]
  }'
```

## 诊断步骤

### 步骤 1: 运行配置测试

```bash
pnpm test:mcp:qwen
```

这会测试：
1. 基础模型调用（不带工具）
2. bindTools 方式
3. createAgent 方式
4. 不同的模型名称格式

### 步骤 2: 检查后端配置

确认后端启动时包含：
```bash
--enable-auto-tool-choice
--tool-call-parser hermes  # 或 openai
```

### 步骤 3: 测试 API 兼容性

使用 curl 直接测试 API 是否支持工具调用。

## 解决方案

### 方案 1: 修改后端启动参数（推荐）

如果你控制后端部署，添加：

```bash
vllm serve ./Qwen3-32B \
  --enable-auto-tool-choice \
  --tool-call-parser hermes \
  --port 8002
```

### 方案 2: 使用不同的工具调用方式

如果后端不支持标准的 function calling，可以尝试：

```typescript
// 使用 bindTools 而不是 createAgent
const modelWithTool = model.bindTools([tool]);
const response = await modelWithTool.invoke([...]);
```

### 方案 3: 检查模型版本

确认你使用的 Qwen3-32B 版本支持工具调用。某些版本可能需要：
- 特定的模型权重
- 特定的配置文件
- 特定的部署方式

## 快速检查清单

- [ ] 后端启动时包含 `--enable-auto-tool-choice`
- [ ] 后端启动时包含 `--tool-call-parser hermes`（或 openai）
- [ ] 模型名称正确（检查大小写）
- [ ] API 端点可访问
- [ ] API Key 正确
- [ ] 运行 `pnpm test:mcp:qwen` 查看详细诊断

## 如果仍然失败

1. **查看后端日志**：检查是否有相关错误信息
2. **联系后端管理员**：确认后端配置是否正确
3. **尝试其他模型**：如果可能，测试其他支持工具调用的模型
4. **检查 API 文档**：查看你的 API 提供商的文档，确认工具调用支持情况

## 参考

- [vLLM 工具调用文档](https://docs.vllm.ai/en/latest/serving/tool_use.html)
- [Qwen 工具调用文档](https://github.com/QwenLM/Qwen)

