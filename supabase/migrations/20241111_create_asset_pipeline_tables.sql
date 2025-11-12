-- 资产处理流程基础表结构
-- 在 Supabase SQL 编辑器或通过 supabase migrations 应用此脚本

-- 确保所需扩展存在
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- 通用 updated_at 触发器函数（若已存在则覆盖同名函数）
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 1. 资产索引表：记录每个上传文件的基础信息与处理状态
CREATE TABLE IF NOT EXISTS public.assets_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL,
    template_key TEXT,
    filename TEXT NOT NULL,
    storage_bucket TEXT,
    storage_path TEXT NOT NULL,
    asset_type TEXT NOT NULL CHECK (asset_type IN ('pdf', 'word', 'image', 'excel', 'json', 'other')),
    mime_type TEXT,
    size_bytes BIGINT,
    checksum TEXT,
    embed_ready BOOLEAN NOT NULL DEFAULT FALSE,
    table_ready BOOLEAN NOT NULL DEFAULT FALSE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error')),
    error_message TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS assets_index_project_id_idx ON public.assets_index (project_id);
CREATE INDEX IF NOT EXISTS assets_index_status_idx ON public.assets_index (status);
CREATE INDEX IF NOT EXISTS assets_index_embed_ready_idx ON public.assets_index (embed_ready);
CREATE INDEX IF NOT EXISTS assets_index_table_ready_idx ON public.assets_index (table_ready);
CREATE INDEX IF NOT EXISTS assets_index_asset_type_idx ON public.assets_index (asset_type);
CREATE INDEX IF NOT EXISTS assets_index_storage_path_idx ON public.assets_index (storage_path);

CREATE TRIGGER trg_assets_index_updated_at
    BEFORE UPDATE ON public.assets_index
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.assets_index IS '上传资产索引，记录文件入库与预处理状态';
COMMENT ON COLUMN public.assets_index.embed_ready IS '向量化/文本处理完成标记';
COMMENT ON COLUMN public.assets_index.table_ready IS '结构化表格/指标解析完成标记';

-- 2. 资产分块表：文本类资产分段及向量化结果
CREATE TABLE IF NOT EXISTS public.asset_chunks (
    id BIGSERIAL PRIMARY KEY,
    asset_id UUID NOT NULL REFERENCES public.assets_index (id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER,
    embedding vector(1536),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS asset_chunks_asset_idx ON public.asset_chunks (asset_id, chunk_index);
CREATE INDEX IF NOT EXISTS asset_chunks_metadata_idx ON public.asset_chunks USING GIN (metadata);
-- 向量索引：当数据量较大时可根据需要调整 lists 参数
CREATE INDEX IF NOT EXISTS asset_chunks_embedding_idx ON public.asset_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE TRIGGER trg_asset_chunks_updated_at
    BEFORE UPDATE ON public.asset_chunks
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.asset_chunks IS '资产分块与向量化结果存储';
COMMENT ON COLUMN public.asset_chunks.embedding IS '文本块的向量表示（根据实际模型维度调整）';

-- 3. Excel 结构化表：存储解析出来的 sheet/schema/数据预览
CREATE TABLE IF NOT EXISTS public.excel_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID NOT NULL REFERENCES public.assets_index (id) ON DELETE CASCADE,
    sheet_name TEXT NOT NULL,
    table_name TEXT,
    header_row JSONB,
    column_types JSONB,
    sample_rows JSONB,
    row_count INTEGER,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS excel_tables_asset_id_idx ON public.excel_tables (asset_id);
CREATE INDEX IF NOT EXISTS excel_tables_sheet_idx ON public.excel_tables (sheet_name);

CREATE TRIGGER trg_excel_tables_updated_at
    BEFORE UPDATE ON public.excel_tables
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.excel_tables IS 'Excel 解析产物，包含 sheet 结构与采样数据';

-- 4. 项目指标表：记录项目/章节/资产级别的结构化指标
CREATE TABLE IF NOT EXISTS public.project_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id TEXT NOT NULL,
    scope TEXT NOT NULL DEFAULT 'project' CHECK (scope IN ('project', 'asset', 'section')),
    target_id TEXT,
    metric_name TEXT NOT NULL,
    metric_value JSONB NOT NULL,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS project_metrics_project_idx ON public.project_metrics (project_id);
CREATE INDEX IF NOT EXISTS project_metrics_scope_idx ON public.project_metrics (scope);
CREATE INDEX IF NOT EXISTS project_metrics_target_idx ON public.project_metrics (target_id);
CREATE INDEX IF NOT EXISTS project_metrics_metric_name_idx ON public.project_metrics (metric_name);

CREATE TRIGGER trg_project_metrics_updated_at
    BEFORE UPDATE ON public.project_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE public.project_metrics IS '项目/资产级指标存储';
COMMENT ON COLUMN public.project_metrics.metric_value IS '指标值（JSON 格式，可存数值、区间、单位等）';

-- 可选视图：方便查询资产向量的准备程度
CREATE OR REPLACE VIEW public.assets_processing_status AS
SELECT
    a.id,
    a.project_id,
    a.filename,
    a.asset_type,
    a.embed_ready,
    a.table_ready,
    a.status,
    a.created_at,
    a.updated_at,
    (SELECT COUNT(*) FROM public.asset_chunks c WHERE c.asset_id = a.id) AS chunk_count,
    (SELECT COUNT(*) FROM public.excel_tables t WHERE t.asset_id = a.id) AS table_count
FROM public.assets_index a;

COMMENT ON VIEW public.assets_processing_status IS '资产处理进度视图，汇总分块与表格数量';
