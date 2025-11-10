-- Supabase 向量存储表创建脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- 1. 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;
-- 2. 创建向量存储表
-- 注意：embedding 维度需要根据你的 embedding 模型调整
-- text-embedding-v4 通常是 1536 维，但请确认你的实际维度
CREATE TABLE IF NOT EXISTS document_vectors (
    id BIGSERIAL PRIMARY KEY,
    content TEXT NOT NULL,
    embedding vector(1536),
    -- 根据实际 embedding 维度调整
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
-- 3. 创建向量相似度搜索索引（使用 ivfflat 算法）
-- lists 参数：建议设置为 rows / 1000，但至少为 10
-- 对于小数据集（< 1000 行），可以设置为 10
CREATE INDEX IF NOT EXISTS document_vectors_embedding_idx ON document_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
-- 4. 创建元数据索引（用于过滤查询）
CREATE INDEX IF NOT EXISTS document_vectors_metadata_idx ON document_vectors USING GIN (metadata);
-- 5. 创建内容全文搜索索引（可选，用于文本搜索）
CREATE INDEX IF NOT EXISTS document_vectors_content_idx ON document_vectors USING GIN (to_tsvector('english', content));
-- 6. 创建更新时间触发器
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW();
RETURN NEW;
END;
$$ language 'plpgsql';
CREATE TRIGGER update_document_vectors_updated_at BEFORE
UPDATE ON document_vectors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- 7. 创建向量相似度搜索函数（LangChain 使用）
-- 这个函数会被 SupabaseVectorStore 调用
CREATE OR REPLACE FUNCTION match_documents(
        query_embedding vector(1536),
        match_count int DEFAULT 5,
        filter jsonb DEFAULT '{}'::jsonb
    ) RETURNS TABLE (
        id bigint,
        content text,
        metadata jsonb,
        similarity float
    ) LANGUAGE plpgsql AS $$ BEGIN RETURN QUERY
SELECT document_vectors.id,
    document_vectors.content,
    document_vectors.metadata,
    1 - (document_vectors.embedding <=> query_embedding) AS similarity
FROM document_vectors
WHERE -- 应用元数据过滤
    (
        filter = '{}'::jsonb
        OR document_vectors.metadata @> filter
    )
ORDER BY document_vectors.embedding <=> query_embedding
LIMIT match_count;
END;
$$;
-- 8. 添加注释
COMMENT ON TABLE document_vectors IS '存储文档向量，用于 RAG 系统的语义搜索';
COMMENT ON COLUMN document_vectors.embedding IS '文档的向量表示（embedding）';
COMMENT ON COLUMN document_vectors.metadata IS '文档的元数据（JSON格式）';
COMMENT ON FUNCTION match_documents IS '向量相似度搜索函数，用于 LangChain SupabaseVectorStore';