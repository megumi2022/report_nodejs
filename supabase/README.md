# Supabase 向量数据库配置指南

## 概述

本项目支持使用 Supabase 作为向量数据库，实现数据持久化存储。相比内存存储，Supabase 向量数据库具有以下优势：

- ✅ **数据持久化**：重启后数据不丢失
- ✅ **可扩展性**：支持大规模数据存储
- ✅ **高性能**：基于 PostgreSQL + pgvector，查询速度快
- ✅ **成本低**：Supabase 免费额度通常足够使用

## 快速开始

### 步骤 1: 在 Supabase 中创建向量表

1. 登录你的 Supabase 项目
2. 进入 **SQL Editor**
3. 执行 `supabase/migrations/create_vector_store.sql` 中的 SQL 脚本

或者直接复制以下 SQL：

```sql
-- 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 创建向量存储表
CREATE TABLE IF NOT EXISTS document_vectors (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536), -- 根据你的 embedding 维度调整
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 创建向量索引
CREATE INDEX IF NOT EXISTS document_vectors_embedding_idx 
ON document_vectors 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 创建元数据索引
CREATE INDEX IF NOT EXISTS document_vectors_metadata_idx 
ON document_vectors USING GIN (metadata);

-- 创建搜索函数
CREATE OR REPLACE FUNCTION match_documents(
    query_embedding vector(1536),
    match_count int DEFAULT 5,
    filter jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
    id bigint,
    content text,
    metadata jsonb,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        document_vectors.id,
        document_vectors.content,
        document_vectors.metadata,
        1 - (document_vectors.embedding <=> query_embedding) AS similarity
    FROM document_vectors
    WHERE 
        (filter = '{}'::jsonb OR document_vectors.metadata @> filter)
    ORDER BY document_vectors.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
```

### 步骤 1.1: 创建资产处理相关表

如果需要使用新的 Agent 调度流水线，请继续执行 `supabase/migrations/20241111_create_asset_pipeline_tables.sql` 中的脚本，创建以下核心表：

- `assets_index`：记录每个上传资产的入库信息及处理状态（包含 `embed_ready/table_ready` 标记）
- `asset_chunks`：存储文本/图像 OCR 的分块内容与向量化结果
- `excel_tables`：保存 Excel Sheets 的结构化解析结果
- `project_metrics`：存储项目、资产或章节层级的指标数据

执行方式同上：在 Supabase 控制台 SQL Editor 中粘贴脚本并运行，或通过 Supabase CLI 应用迁移。

### 步骤 2: 配置环境变量

在 `.env` 文件中添加：

```env
# Supabase 配置（已有）
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_key

# 向量存储类型：'supabase' 或 'memory'（默认）
VECTOR_STORE_TYPE=supabase
```

### 步骤 3: 验证配置

运行测试：

```bash
pnpm test:rag
```

如果看到以下日志，说明配置成功：

```
✅ 使用 Supabase 向量存储（持久化）
✅ Supabase 向量存储初始化完成
✅ 已添加 X 个文档到 Supabase 向量库
```

## 重要说明

### Embedding 维度

**重要**：`text-embedding-v4` 的维度需要确认。如果维度不是 1536，需要修改 SQL 脚本中的 `vector(1536)`。

常见 embedding 模型的维度：
- OpenAI `text-embedding-ada-002`: 1536
- OpenAI `text-embedding-3-small`: 1536
- OpenAI `text-embedding-3-large`: 3072
- DashScope `text-embedding-v4`: **需要确认**（可能是 1536 或其他）

### 如何确认维度

运行以下代码查看实际的 embedding 维度：

```typescript
import { OpenAIEmbeddings } from "@langchain/openai";

const embeddings = new OpenAIEmbeddings({
    model: "text-embedding-v4",
    openAIApiKey: process.env.DASHSCOPE_API_KEY,
    configuration: { baseURL: process.env.DASHSCOPE_BASE_URL },
});

const testEmbedding = await embeddings.embedQuery("test");
console.log("Embedding 维度:", testEmbedding.length);
```

然后根据实际维度修改 SQL 脚本中的 `vector(1536)`。

## 存储模式切换

### 使用 Supabase（生产环境）

```env
VECTOR_STORE_TYPE=supabase
```

### 使用内存存储（开发/测试）

```env
VECTOR_STORE_TYPE=memory
# 或者不设置（默认）
```

## 性能优化

### 索引参数调整

`ivfflat` 索引的 `lists` 参数建议：
- 小数据集（< 1000 行）：10-50
- 中等数据集（1000-10000 行）：100-500
- 大数据集（> 10000 行）：rows / 1000

```sql
-- 调整 lists 参数
DROP INDEX IF EXISTS document_vectors_embedding_idx;
CREATE INDEX document_vectors_embedding_idx 
ON document_vectors 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100); -- 根据数据量调整
```

### 元数据过滤

Supabase 支持基于元数据的过滤查询，例如：

```typescript
// 只搜索 PDF 类型的文档
const results = await vectorStore.similaritySearch(query, 5, (doc) => 
    doc.metadata.type === "pdf"
);
```

## 数据管理

### 查看向量数量

在 Supabase SQL Editor 中：

```sql
SELECT COUNT(*) FROM document_vectors;
```

### 清空向量库

```typescript
await vectorStore.clear();
```

### 删除特定文档

```sql
-- 删除特定来源的文档
DELETE FROM document_vectors 
WHERE metadata->>'source' = 'path/to/file.pdf';
```

## 故障排查

### 问题 1: "relation 'document_vectors' does not exist"

**解决**：执行 SQL 迁移脚本创建表。

### 问题 2: "function match_documents does not exist"

**解决**：确保执行了 SQL 脚本中的 `CREATE FUNCTION match_documents` 部分。

### 问题 3: "dimension mismatch"

**解决**：检查 embedding 维度，修改 SQL 中的 `vector(1536)` 为实际维度。

### 问题 4: 自动回退到内存存储

检查日志中的错误信息，通常是：
- Supabase 配置错误
- 表或函数未创建
- 权限问题

## 迁移现有数据

如果需要从内存存储迁移到 Supabase：

1. 确保 Supabase 表已创建
2. 设置 `VECTOR_STORE_TYPE=supabase`
3. 重新运行文档索引（会自动存储到 Supabase）

## 参考

- [Supabase pgvector 文档](https://supabase.com/docs/guides/ai/vector-columns)
- [LangChain Supabase Vector Store](https://js.langchain.com/docs/integrations/vectorstores/supabase)

