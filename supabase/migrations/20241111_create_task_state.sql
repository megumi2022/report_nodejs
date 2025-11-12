-- 任务状态存储表，用于 DAG 调度
CREATE TABLE IF NOT EXISTS public.task_state (
    project_id TEXT NOT NULL,
    node_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    dependencies TEXT[] DEFAULT ARRAY[]::TEXT[],
    dependents TEXT[] DEFAULT ARRAY[]::TEXT[],
    metadata JSONB DEFAULT '{}'::jsonb,
    result JSONB,
    error TEXT,
    retries INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (project_id, node_id)
);

CREATE INDEX IF NOT EXISTS task_state_status_idx ON public.task_state (status);
CREATE INDEX IF NOT EXISTS task_state_project_idx ON public.task_state (project_id);
CREATE INDEX IF NOT EXISTS task_state_type_idx ON public.task_state (type);

CREATE TRIGGER trg_task_state_updated_at
    BEFORE UPDATE ON public.task_state
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- 函数：列出就绪任务（所有依赖完成且自身为 pending）
CREATE OR REPLACE FUNCTION public.list_ready_tasks(input_project_id TEXT)
RETURNS TABLE (
    project_id TEXT,
    node_id TEXT,
    type TEXT,
    status TEXT,
    dependencies TEXT[],
    dependents TEXT[],
    metadata JSONB,
    retries INTEGER,
    updated_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        ts.project_id,
        ts.node_id,
        ts.type,
        ts.status,
        ts.dependencies,
        ts.dependents,
        ts.metadata,
        ts.retries,
        ts.updated_at
    FROM public.task_state ts
    WHERE ts.project_id = input_project_id
      AND ts.status = 'pending'
      AND NOT EXISTS (
          SELECT 1
          FROM unnest(ts.dependencies) dep
          JOIN public.task_state dep_state
            ON dep_state.project_id = ts.project_id
           AND dep_state.node_id = dep
          WHERE dep_state.status NOT IN ('completed')
      );
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE public.task_state IS '任务 DAG 状态存储';
COMMENT ON FUNCTION public.list_ready_tasks IS '返回指定项目下所有依赖已完成的 pending 任务';
