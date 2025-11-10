# 报告生成系统架构

## 📁 目录结构

```
src/
├── agents/                    # Agent 层（核心 Agent 类）
│   ├── mcp-pipeline.ts       # MCP Agent Pipeline（基础）
│   ├── specialized-agents.ts # 专门的 Agent 实例管理
│   └── index.ts              # 导出文件
│
├── workflows/                 # 工作流层
│   ├── report-generation-graph.ts  # LangGraph 工作流定义
│   └── report-workflow.ts    # 报告生成工作流（主入口）
│
├── services/                  # 服务层
│   ├── template-service.ts   # 模板服务（Supabase）
│   ├── retrieval-service.ts  # 检索服务（Excel/Web/DB）
│   └── render-service.ts     # 渲染服务（Markdown/HTML）
│
├── examples/                  # 示例代码
│   ├── mcp-pipeline-example.ts      # MCP Pipeline 使用示例
│   └── report-generation-example.ts # 报告生成使用示例
│
└── tools/                     # 工具层
    ├── schema-converter.ts   # JSON Schema 转 Zod
    └── webSearch.ts          # 网络检索工具
```

## 🏗️ 架构层次

### 1. 工具层 (Tools)
- **职责**: 提供基础工具函数
- **特点**: 无状态、可复用
- **示例**: `schema-converter.ts`, `webSearch.ts`

### 2. 服务层 (Services)
- **职责**: 封装业务逻辑，提供统一的服务接口
- **特点**: 单一职责、可测试
- **服务**:
  - `TemplateService`: 从 Supabase 获取报告模板
  - `RetrievalService`: 协调不同类型的检索操作
  - `RenderService`: 将内容渲染为不同格式

### 3. Agent 层 (Agents)
- **职责**: 管理 LLM Agent 和工具调用
- **特点**: 有状态、可配置
- **组件**:
  - `MCPAgentPipeline`: 基础 Pipeline，管理 MCP 工具
  - `SpecializedAgents`: 专门的 Agent 实例（大纲、提示词、内容生成）

### 4. 工作流层 (Workflows)
- **职责**: 定义多步骤的执行流程和业务编排
- **特点**: 状态管理、流程控制
- **组件**:
  - `report-generation-graph.ts`: LangGraph 工作流定义
  - `report-workflow.ts`: 报告生成工作流，整合所有服务

### 5. 示例层 (Examples)
- **职责**: 提供使用示例和演示代码
- **特点**: 独立于核心代码，便于学习和测试
- **组件**:
  - `mcp-pipeline-example.ts`: MCP Pipeline 使用示例
  - `report-generation-example.ts`: 报告生成使用示例

## 🔄 工作流程

```
用户输入
  ↓
[1] 模板选择 (TemplateService)
  ↓
[2] 大纲生成 (OutlineAgent)
  ↓
[3] 提示词生成 (PromptAgent)
  ↓
[4] 检索执行 (RetrievalService)
  ├─ Excel 检索
  ├─ 联网检索
  └─ 数据库检索
  ↓
[5] 内容生成 (ContentAgent)
  ↓
[6] 报告渲染 (RenderService)
  ↓
最终报告
```

## 🎯 核心概念

### Pipeline 实例

每个 `MCPAgentPipeline` 实例是独立的，包含：
- 独立的 MCP 连接管理器
- 独立的 Agent 实例
- 独立的工具列表

**为什么需要多个实例？**
- 不同任务需要不同的工具集
- 避免工具冲突和干扰
- 提高并行处理能力

### 专门的 Agent

为不同任务创建专门的 Agent 实例：

```typescript
// 大纲生成 Agent - 专注于生成报告大纲
outlineAgent: MCPAgentPipeline

// 提示词生成 Agent - 专注于生成提示词
promptAgent: MCPAgentPipeline

// 内容生成 Agent - 专注于生成报告内容
contentAgent: MCPAgentPipeline
```

### LangGraph 工作流

使用 LangGraph 管理工作流的执行顺序和状态：

```typescript
workflow.addNode("select_template", ...)
workflow.addNode("generate_outline", ...)
workflow.addEdge("select_template", "generate_outline")
```

## 📦 使用方式

### 基础使用

```typescript
import { ReportGenerationWorkflow } from "./src/workflows/report-workflow.ts";

const workflow = new ReportGenerationWorkflow();
await workflow.initialize();

const report = await workflow.generateReport({
    excelPath: "/path/to/excel.xlsx",
    projectBackground: { ... },
    templateKey: "feasibility_study",
    projectId: "PRJP00120250001",
});

// 渲染为 Markdown
const markdown = workflow.renderToMarkdown(report);

// 渲染为 HTML
const html = workflow.renderToHTML(report);
```

### 运行示例

```bash
# MCP Pipeline 示例
pnpm agent:example

# 报告生成示例
pnpm report:example
```

## 🔧 配置要求

### 环境变量

```bash
# 模型配置
MODEL_NAME=qwen3-32b
QWEN_API_KEY=your-api-key
QWEN_API_BASE=http://your-api-base
TEMPERATURE=0.7

# Supabase 配置
SUPABASE_URL=your-supabase-url
SUPABASE_KEY=your-supabase-key

# 工具数量限制
MAX_TOOLS=10
```

### MCP Server 配置

在 `mcp/config.ts` 中配置需要的 MCP Server：

```typescript
export const mcpServerConfigs: MCPServerConfig[] = [
    {
        type: "stdio",
        name: "playwright",
        command: "npx",
        args: ["@playwright/mcp@latest"],
        enabled: true,
    },
    // 添加 Excel、数据库等 MCP Server
];
```

## 🚀 扩展指南

### 添加新的检索类型

1. 在 `RetrievalService` 中添加新方法
2. 创建对应的 MCP Agent 实例
3. 在 `generatePrompts` 中支持新的检索类型

### 添加新的渲染格式

1. 在 `RenderService` 中添加新方法（如 `renderToPDF`）
2. 在 `ReportGenerationWorkflow` 中暴露新方法

### 自定义 Agent 配置

在 `SpecializedAgents` 中为不同 Agent 配置不同的工具集：

```typescript
constructor() {
    // 可以为不同 Agent 传入不同的 MCP Manager
    this.outlineAgent = new MCPAgentPipeline(customManager);
}
```

## 📝 注意事项

1. **工具筛选**: Pipeline 会自动筛选工具，避免请求体过大
2. **错误处理**: 每个节点都有错误处理，确保工作流不会中断
3. **状态管理**: LangGraph 管理状态传递，确保数据流正确
4. **并行处理**: 检索操作可以并行执行，提高效率

## 🔍 调试

### 查看工具列表

```typescript
const tools = workflow.agents.outlineAgent.getTools();
console.log("可用工具:", tools.map(t => t.name));
```

### 查看工作流状态

LangGraph 会自动记录每个节点的执行状态，可以通过日志查看。

## 📚 相关文档

- [MCP 管理文档](../mcp/README.md)
- [测试文档](../tests/README.md)

