# 报告生成系统 (Report Generation System)

基于 LangChain、LangGraph 和 MCP (Model Context Protocol) 的智能报告生成系统，支持多数据源检索、RAG 增强生成和自动化工作流。

## ✨ 特性

- 🤖 **多 Agent 架构**: 基于 LangChain 的专门化 Agent（大纲生成、提示词生成、内容生成）
- 🔄 **LangGraph 工作流**: 使用 LangGraph 编排复杂的报告生成流程
- 🔌 **MCP 工具集成**: 支持 Stdio 和 HTTP 两种方式连接 MCP 服务器（Playwright、WebSearch 等）
- 📊 **混合检索策略**: 
  - Excel: 传统检索（LLM 检索计划 + 精确匹配）
  - PDF: RAG 向量检索（embedding + 语义搜索 + reranker）
- 🗄️ **Supabase 集成**: 模板存储和向量数据库支持
- 📝 **智能引用管理**: 自动匹配、验证和生成引用索引

## 🏗️ 技术栈

- **Runtime**: Node.js 18+ (ESM)
- **Language**: TypeScript
- **AI Framework**: LangChain, LangGraph
- **MCP**: Model Context Protocol SDK
- **Database**: Supabase (PostgreSQL + pgvector)
- **Embedding**: DashScope text-embedding-v4
- **Reranker**: DashScope gte-rerank-v2
- **Package Manager**: pnpm

## 📦 安装

```bash
# 克隆仓库
git clone git@github.com:megumi2022/report_nodejs.git
cd report_nodejs

# 安装依赖
pnpm install

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入必要的配置
```

## ⚙️ 环境配置

创建 `.env` 文件并配置以下变量：

```env
# LLM 配置
MODEL_NAME=qwen3-32b
QWEN_API_KEY=your_api_key
QWEN_API_BASE=https://your-api-endpoint.com/v1

# Embedding 配置
EMBEDDING_MODEL=text-embedding-v4
DASHSCOPE_API_KEY=your_dashscope_key
DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1

# Reranker 配置
RERANKER_BASE_URL=https://dashscope.aliyuncs.com/api/v1/services/rerank

# Supabase 配置
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# 向量存储类型 (memory | supabase)
VECTOR_STORE_TYPE=supabase
```

## 🚀 快速开始

### 1. 测试 MCP 连接

```bash
# 测试 MCP 管理器
pnpm test:mcp:manager

# 测试直接工具调用
pnpm test:mcp:direct

# 测试 Agent 工具调用
pnpm test:mcp:agent
```

### 2. 测试 RAG 系统

```bash
# 运行完整的 RAG 测试
pnpm test:rag
```

### 3. 检查 Supabase 配置

```bash
# 检查 Supabase 向量表配置
pnpm check:supabase
```

### 4. 运行示例

```bash
# MCP Pipeline 示例
pnpm agent:example

# 报告生成示例
pnpm report:example
```

## 📁 项目结构

```
report_nodejs/
├── src/
│   ├── agents/              # Agent 层
│   │   ├── mcp-pipeline.ts  # MCP Agent Pipeline
│   │   └── specialized-agents.ts
│   ├── workflows/           # 工作流层
│   │   ├── report-generation-graph.ts
│   │   └── report-workflow.ts
│   ├── services/           # 服务层
│   │   ├── template-service.ts
│   │   ├── retrieval-service.ts
│   │   ├── vector-store-service.ts
│   │   ├── reranker-service.ts
│   │   └── ...
│   ├── tools/              # 工具层
│   │   ├── outline-parser.ts
│   │   └── schema-converter.ts
│   └── examples/           # 示例代码
├── mcp/                    # MCP 客户端管理
│   ├── manager.ts
│   ├── stdioClient.ts
│   └── httpClient.ts
├── tests/                  # 测试用例
├── supabase/              # Supabase 配置
│   ├── migrations/
│   └── SETUP_GUIDE.md
└── data/                   # 测试数据
```

## 🔧 核心功能

### MCP 工具集成

系统支持通过 MCP 协议集成外部工具：

- **Playwright**: 浏览器自动化
- **Open WebSearch**: 网络搜索
- **Excel Server**: Excel 数据处理

配置位置: `mcp/config.ts`

### RAG 系统

- **文档解析**: 支持 PDF 和 Excel
- **向量存储**: 支持内存存储和 Supabase 持久化
- **混合检索**: Excel 传统检索 + PDF RAG 检索
- **Reranker**: 使用 gte-rerank-v2 提升检索精度
- **引用管理**: 自动匹配、验证和生成引用索引

详细文档: `src/services/RAG_README.md`

### 报告生成工作流

1. **模板选择**: 从 Supabase 获取报告模板
2. **大纲生成**: 递归解析模板，生成嵌套大纲结构
3. **提示词生成**: 为每个章节生成详细的写作指令
4. **内容检索**: 从 Excel、PDF、Web 等多源检索相关信息
5. **内容生成**: 基于检索结果生成报告内容
6. **引用验证**: 验证并记录内容中的引用来源
7. **报告渲染**: 输出 Markdown 或 HTML 格式

## 📚 文档

- [MCP 管理文档](mcp/README.md)
- [RAG 系统文档](src/services/RAG_README.md)
- [Supabase 设置指南](supabase/SETUP_GUIDE.md)
- [测试文档](tests/README.md)
- [架构文档](src/README.md)

## 🧪 测试

```bash
# 运行所有 MCP 测试
pnpm test:mcp:all

# 运行 RAG 系统测试
pnpm test:rag

# 运行特定测试
pnpm test:mcp:manager
pnpm test:mcp:direct
pnpm test:mcp:agent
```

## 📝 开发

### 添加新的 MCP 服务器

1. 在 `mcp/config.ts` 中添加服务器配置
2. 运行 `pnpm test:mcp:manager` 验证连接

### 添加新的服务

1. 在 `src/services/` 中创建新的服务文件
2. 实现服务接口
3. 在 `RetrievalService` 或其他服务中集成

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

ISC

## 🔗 相关链接

- [LangChain 文档](https://js.langchain.com/)
- [LangGraph 文档](https://langchain-ai.github.io/langgraph/)
- [MCP 协议](https://modelcontextprotocol.io/)
- [Supabase 文档](https://supabase.com/docs)

