# 报告生成系统 (Report Generation System)

基于 LangChain、LangGraph 与 MCP（Model Context Protocol）的多代理报告生成平台，支持多源检索、RAG 增强生成、自动化工作流与可配置工具链。

---

## 目录

1. [系统亮点](#系统亮点)
2. [架构一览](#架构一览)
3. [核心能力](#核心能力)
4. [项目结构](#项目结构)
5. [快速上手](#快速上手)
6. [环境配置](#环境配置)
7. [运行与调试](#运行与调试)
8. [更多文档](#更多文档)
9. [贡献指南](#贡献指南)
10. [许可证](#许可证)

---

## 系统亮点

- **多 Agent 协作**：针对大纲、提示词、内容生成等任务提供专用 Agent，避免工具干扰。
- **LangGraph 编排**：LangGraph 工作流实现节点状态管理与任务调度，支持长链路执行。
- **MCP 工具生态**：统一管理 Playwright、WebSearch 等 MCP Server，自动发现和注入工具。
- **混合检索策略**：同时覆盖 Excel 精确检索、PDF RAG 向量检索、Web 搜索。
- **引用与渲染流水线**：自动追踪引用来源，并输出 Markdown / HTML 等格式。

---

## 架构一览

详细分层说明见 `src/README.md`，核心分层结构如下：

1. **Tools**：无状态工具方法，例如 `schema-converter.ts`。
2. **Services**：封装业务逻辑，如 `retrieval-service.ts`、`render-service.ts`。
3. **Agents**：`MCPAgentPipeline` 与专用 Agent（大纲、提示词、内容生成）。
4. **Workflows**：LangGraph 工作流，负责 DAG 编排与状态维护。
5. **Examples**：示例脚本，用于快速演示和验证。

系统数据流：

```
用户输入
  → 模板选择
  → 大纲生成
  → 提示词生成
  → 多源检索 (Excel / PDF / Web / DB)
  → 内容生成
  → 引用校验
  → 报告渲染
  → 输出最终报告
```

---

## 核心能力

### MCP 工具链

- 支持 `stdio` 与 `http` 两种传输方式。
- 自动注册 `mcp/config.ts` 中启用的 server，并拉取其工具列表。
- 可通过 `MCPClientManager` 进行连接测试与健康检查。

### RAG 检索

- PDF：嵌入 + 语义检索 + reranker。
- Excel：LLM 检索计划 + 精确匹配。
- Web：Open WebSearch MCP server。
- 向量存储：内存模式或 Supabase（pgvector）。

### 报告工作流

- 模板来源：Supabase 模板表。
- LangGraph DAG：节点包括模板选择、提示词生成、章节写作、引用验证等。
- 渲染：支持 Markdown / HTML，自定义渲染可扩展。

---

## 项目结构

```
report_nodejs/
├── src/                 # 业务代码
│   ├── agents/          # Agent 定义与管理
│   ├── services/        # 业务服务（模板、检索、渲染等）
│   ├── workflows/       # LangGraph 工作流
│   ├── tools/           # 工具函数
│   └── examples/        # 使用示例
├── mcp/                 # MCP 客户端实现与配置
├── tests/               # 自动化测试
├── supabase/            # Supabase 迁移与配置
└── data/                # 示例数据
```

---

## 快速上手

```bash
# 1. 克隆仓库
git clone git@github.com:megumi2022/report_nodejs.git
cd report_nodejs

# 2. 安装依赖
pnpm install

# 3. 初始化环境变量
cp .env.example .env
# 按需修改 .env

# 4. 一键检查配置
pnpm check:env
```

常用脚本：

- `pnpm demo:server`：启动示例 API（监听 `http://localhost:3000`）。
- `pnpm agent:example`：运行 MCP Pipeline 示例。
- `pnpm report:example`：运行报告生成完整示例。

---

## 环境配置

最小必需变量（完整列表见 `.env.example`）：

```env
MODEL_NAME=qwen3-32b
QWEN_API_KEY=your_api_key
QWEN_API_BASE=https://your-openai-compatible-endpoint/v1
```

可选增强：

- `DASHSCOPE_API_KEY`、`DASHSCOPE_BASE_URL`：启用 DashScope embedding。
- `RERANKER_BASE_URL`：启用 reranker。
- `SUPABASE_URL`、`SUPABASE_KEY`：使用 Supabase 持久化存储。
- `MAX_TOOLS`：限制单次注入的 MCP 工具数量，避免请求超限。

验证脚本：

```bash
pnpm check:env        # 检查基础配置
pnpm check:supabase   # 校验 Supabase 迁移与密钥
```

---

## 运行与调试

### MCP 工具链

```bash
pnpm test:mcp:manager   # 枚举并检测所有 MCP server
pnpm test:mcp:direct    # 直接调用 MCP 工具
pnpm test:mcp:agent     # 通过 Agent 链调度工具
```

### RAG/检索流程

```bash
pnpm test:rag           # 运行 RAG 集成测试
```

### API Demo

参见 `docs/demo-api-requests.md`，包含完整的 cURL 示例：

1. 注册资产（Excel / PDF）
2. 查询预处理状态
3. 生成大纲
4. 调度报告 DAG
5. 查询任务进度与产出

也可在 Apifox/Insomnia 中导入相同请求，调整 `projectId` 与文件路径即可。

---

## 更多文档

- `src/README.md`：架构分层与工作流细节。
- `mcp/README.md`：MCP 客户端与 server 配置说明。
- `src/services/RAG_README.md`：RAG 检索与引用系统。
- `tests/README.md`：测试脚本与覆盖说明。
- `supabase/SETUP_GUIDE.md`：Supabase 环境初始化。

---

## 贡献指南

1. Fork & Clone 仓库。
2. 创建功能分支：`git checkout -b feature/<name>`。
3. 使用 `pnpm lint`、`pnpm test:*` 自测。
4. 提交 PR 前同步主干并补充文档或测试。

欢迎提交 Issue 或 Pull Request！

---

## 许可证

ISC

---

## 相关链接

- [LangChain 文档](https://js.langchain.com/)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Supabase 文档](https://supabase.com/docs)

