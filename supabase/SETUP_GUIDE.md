# Supabase 向量表快速设置指南

## 🚀 快速开始（3 步完成）

### 步骤 1: 登录 Supabase

1. 访问 [https://supabase.com](https://supabase.com)
2. 登录你的账户
3. 选择你的项目（或创建新项目）

### 步骤 2: 打开 SQL Editor

1. 在左侧菜单中找到 **SQL Editor**
2. 点击 **New query** 创建新查询

### 步骤 3: 执行 SQL 脚本

1. 复制以下完整 SQL 脚本
2. 粘贴到 SQL Editor
3. 点击 **Run** 执行

---

## 📋 完整 SQL 脚本

```sql
-- ============================================
-- Supabase 向量存储表创建脚本
-- ============================================

-- 1. 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 创建向量存储表
CREATE TABLE IF NOT EXISTS document_vectors (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536), -- 注意：如果 embedding 维度不是 1536，需要修改这里
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. 创建向量相似度搜索索引
CREATE INDEX IF NOT EXISTS document_vectors_embedding_idx 
ON document_vectors 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 4. 创建元数据索引（用于过滤查询）
CREATE INDEX IF NOT EXISTS document_vectors_metadata_idx 
ON document_vectors USING GIN (metadata);

-- 5. 创建内容全文搜索索引（可选）
CREATE INDEX IF NOT EXISTS document_vectors_content_idx 
ON document_vectors USING GIN (to_tsvector('english', content));

-- 6. 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_document_vectors_updated_at 
BEFORE UPDATE ON document_vectors 
FOR EACH ROW 
EXECUTE FUNCTION update_updated_at_column();

-- 7. 创建向量相似度搜索函数（LangChain 必需）
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

---

## ✅ 验证设置

执行完 SQL 后，运行检查脚本验证：

```bash
pnpm check:supabase
```

如果看到以下输出，说明设置成功：

```
✅ Supabase 配置已找到
✅ 表 'document_vectors' 存在
✅ 函数 'match_documents' 存在
```

---

## ⚠️ 重要提示

### Embedding 维度

**重要**：SQL 脚本中默认使用 `vector(1536)`。如果你的 embedding 模型维度不同，需要修改：

1. **确认维度**：运行以下代码查看实际维度
   ```typescript
   import { OpenAIEmbeddings } from "@langchain/openai";
   const embeddings = new OpenAIEmbeddings({
       model: "text-embedding-v4",
       openAIApiKey: process.env.DASHSCOPE_API_KEY,
       configuration: { baseURL: process.env.DASHSCOPE_BASE_URL },
   });
   const test = await embeddings.embedQuery("test");
   console.log("维度:", test.length);
   ```

2. **修改 SQL**：将脚本中所有的 `vector(1536)` 替换为实际维度，例如：
   - 如果是 1024 维：`vector(1024)`
   - 如果是 3072 维：`vector(3072)`

---

## 🔍 常见问题

### Q: 执行 SQL 时提示权限错误？

**A**: 确保你使用的是项目的 **Service Role Key**（不是 anon key）。可以在 Project Settings > API 中找到。

### Q: 如何确认表已创建？

**A**: 在 Supabase 左侧菜单中：
1. 点击 **Table Editor**
2. 应该能看到 `document_vectors` 表

或者运行检查脚本：
```bash
pnpm check:supabase
```

### Q: 如何删除表重新创建？

**A**: 在 SQL Editor 中执行：
```sql
DROP TABLE IF EXISTS document_vectors CASCADE;
DROP FUNCTION IF EXISTS match_documents CASCADE;
DROP FUNCTION IF EXISTS update_updated_at_column CASCADE;
```
然后重新执行创建脚本。

---

## 📝 下一步

设置完成后：

1. 确保 `.env` 中设置了：
   ```env
   VECTOR_STORE_TYPE=supabase
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_key
   ```

2. 运行测试：
   ```bash
   pnpm test:rag
   ```

3. 如果看到以下日志，说明成功：
   ```
   ✅ 使用 Supabase 向量存储（持久化）
   ✅ Supabase 向量存储初始化完成
   ✅ 已添加 X 个文档到 Supabase 向量库
   ```

