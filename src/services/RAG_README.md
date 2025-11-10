# RAG 系统使用指南

## 概述

RAG（Retrieval-Augmented Generation）系统已集成到项目中，采用**混合检索策略**：
- **Excel**：使用传统检索方式（LLM 检索计划 + 精确匹配），不做 embedding
- **PDF**：使用 RAG 向量检索方式（embedding + 语义搜索）

## 系统架构

```
用户上传文档
    ↓
文档解析 (DocumentLoader)
    ↓
    ├─ Excel → 传统检索 (ExcelRetrievalService)
    │         - LLM 生成检索计划
    │         - 精确匹配行数据
    │         - 无需 embedding
    │
    └─ PDF → RAG 检索 (VectorStoreService)
              - 文档切分
              - 向量化 (embedding)
              - 语义搜索（第一阶段）
              ↓
              Reranker 精排序 (RerankerService)
              - 使用 gte-rerank-v2 模型
              - 提升检索精度 10-30%
              ↓
              引用匹配器 (CitationService)
              ↓
              正文生成时融合引用 (RetrievalService)
              ↓
              引用验证与溯源记录 (CitationService)
              ↓
              导出与引用索引表 (OutputManager)
```

## 核心组件

### 1. DocumentLoader
负责解析 Excel 和 PDF 文件，切分成文档块。

```typescript
import { DocumentLoader } from "./services/document-loader.ts";

const loader = new DocumentLoader(500, 50); // chunkSize, chunkOverlap
const docs = await loader.loadExcel("data/file.xlsx");
const pdfDocs = await loader.loadPDF("data/file.pdf");
```

### 2. VectorStoreService
管理文档的向量化和相似度搜索。

```typescript
import { VectorStoreService } from "./services/vector-store-service.ts";

const vectorStore = new VectorStoreService();
await vectorStore.initialize();
await vectorStore.addDocuments(documents);
const results = await vectorStore.similaritySearch("查询内容", 5);
```

### 3. CitationService
管理引用匹配、验证和索引生成。

```typescript
import { CitationService } from "./services/citation-service.ts";

const citationService = new CitationService();
const citations = citationService.matchCitations(searchResults, 0.7);
const verified = citationService.verifyCitations(citations, generatedText);
const index = citationService.generateCitationIndex("section-1", "标题", citations);
```

### 4. RetrievalService（混合检索）
支持 Excel 传统检索和 PDF RAG 检索。

```typescript
import { RetrievalService } from "./services/retrieval-service.ts";

const retrieval = new RetrievalService();
await retrieval.initialize();

// Excel 传统检索（精确匹配，无需 embedding）
const excelResult = await retrieval.retrieveFromExcel(
    "总投资估算中的工程费用",
    "data/file.xlsx",
    10  // 最多返回 10 行
);

// PDF RAG 检索（语义搜索 + Reranker）
const pdfResult = await retrieval.retrieveFromPDF("产业发展规划", 5, true); // 第三个参数启用 reranker

// 向量检索（通用，但主要用于 PDF，支持 Reranker）
const result = await retrieval.retrieveFromVector("查询", 5, 0.7, true); // 第四个参数启用 reranker
```

## 使用流程

### 步骤 1: 文档解析与索引

```typescript
const loader = new DocumentLoader();
const documents = await loader.loadDocument("data/全国乡村产业发展规划（2020‑2025年）（农业农村部印发）.pdf");

const retrieval = new RetrievalService();
await retrieval.initialize();
const vectorStore = retrieval.getVectorStore();
await vectorStore.addDocuments(documents);
```

### 步骤 2: 引用匹配器 RAG

```typescript
const query = "总投资估算中的工程费用";
const result = await retrieval.retrieveFromVector(query, 5, 0.6);
const citations = result.citations || [];
```

### 步骤 3: 生成时融合引用

```typescript
const citationService = retrieval.getCitationService();
const context = citationService.mergeCitationContext(citations);

// 将 context 作为 prompt 的一部分传给 LLM
const prompt = `根据以下引用回答问题：\n\n${context}\n\n问题：${query}`;
```

### 步骤 4: 引用验证

```typescript
const generatedText = "..."; // LLM 生成的文本
const verified = citationService.verifyCitations(citations, generatedText);
```

### 步骤 5: 生成引用索引表

```typescript
const index = citationService.generateCitationIndex(
  "section-1",
  "工程费用概述",
  verified
);

const outputManager = new OutputManager(projectId);
await outputManager.saveNodeOutput("citation_index", index);
```

## Excel 字段同义词

支持字段名的语义匹配，避免因字段名不一致导致检索失败。

```typescript
const citationService = new CitationService();

// 添加自定义同义词
citationService.addFieldSynonyms("设备费用", ["设备购置费", "设备投资"]);

// 获取同义词
const synonyms = citationService.getFieldSynonyms("工程费用");
// 返回: ["工程费用", "建设费用", "施工费用", "建安费用", "工程成本"]
```

## 测试

运行完整测试：

```bash
pnpm test:rag
```

测试包括：
1. 文档加载测试
2. 向量索引构建测试
3. 引用匹配测试
4. 完整 RAG 流程测试
5. 字段同义词测试

## 环境变量

确保配置了以下环境变量：

```env
QWEN_API_KEY=your_api_key
QWEN_API_BASE=your_api_base_url
MODEL_NAME=qwen3-32b
DASHSCOPE_API_KEY=your_dashscope_api_key  # DashScope API Key（用于 embedding 和 reranker）
DASHSCOPE_BASE_URL=your_dashscope_base_url  # DashScope API Base URL（用于 embedding）
RERANKER_BASE_URL=your_reranker_base_url  # Reranker API Base URL（用于 reranker）
EMBEDDING_MODEL=text-embedding-v4  # Embedding 模型名称，默认使用 text-embedding-v4
```

**重要提示**：
- `DASHSCOPE_API_KEY` 用于 DashScope embedding API 和 reranker API
- `DASHSCOPE_BASE_URL` 用于 DashScope embedding API 的 base URL
- `RERANKER_BASE_URL` 用于 Reranker API 的 base URL（独立配置）
- `EMBEDDING_MODEL` 默认使用 `text-embedding-v4`，可根据需要修改
- Reranker 使用 `gte-rerank-v2` 模型，从 `DASHSCOPE_API_KEY` 和 `RERANKER_BASE_URL` 读取配置
- 如果使用自定义 API，确保该端点支持 embedding 和 rerank 功能
- 如果遇到 "Model not found" 错误，请检查模型名称和 API 配置是否正确

## 注意事项

1. **PDF 文件**：请将 PDF 文件放在 `data/` 目录下
2. **Excel 检索**：使用传统方式，无需 embedding，成本低、速度快、精确度高
3. **PDF 检索**：使用 RAG 方式，支持语义搜索 + Reranker 精排序
4. **Reranker**：使用 `gte-rerank-v2` 模型，可提升检索精度 10-30%
5. **两阶段检索**：
   - 第一阶段：向量检索 top-20 候选
   - 第二阶段：Reranker 精排序到 top-5
6. **成本优化**：仅对 PDF 做 embedding，Excel 使用传统检索，可节省约 96% 的 embedding 成本
7. **向量化耗时**：PDF 文档的向量化可能需要较长时间，取决于 embedding API 的速度
8. **内存使用**：MemoryVectorStore 将所有向量存储在内存中，大文档集可能需要考虑使用外部向量数据库
9. **引用验证**：当前使用简单的关键词匹配，可根据需要增强验证逻辑

## 扩展

### 使用 Supabase 向量数据库（推荐）

项目已支持 Supabase 向量数据库，实现数据持久化存储。

**配置步骤**：

1. 在 Supabase 中执行 SQL 迁移脚本（见 `supabase/migrations/create_vector_store.sql`）
2. 在 `.env` 中设置：
   ```env
   VECTOR_STORE_TYPE=supabase
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   ```

详细配置指南请参考：`supabase/README.md`

**优势**：
- ✅ 数据持久化（重启后不丢失）
- ✅ 支持大规模数据
- ✅ 高性能查询
- ✅ 免费额度充足

### 使用其他向量数据库

可以替换 `VectorStoreService` 的实现，使用：
- Pinecone
- Weaviate
- Chroma

只需实现相同的接口即可。

