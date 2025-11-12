# Demo API 请求示例

以下示例基于 `src/server.ts` 中提供的 Demo API，默认服务运行在 `http://localhost:3000`。

在开始前，请确保：

- 已执行最新 Supabase 迁移（资产表、任务表等）
- `.env` 配置好 `SUPABASE_URL`, `SUPABASE_KEY`, `REDIS_URL`，以及必要的 OpenAI/Qwen/DashScope API Key
- 执行 `pnpm install`
- 运行 `pnpm demo:server`

示例使用 `projectId=demo-project`，可按需替换。

## 1. 注册资产并启动预处理

```bash
curl -X POST "http://localhost:3000/api/projects/demo-project/assets" \
  -H "Content-Type: application/json" \
  -d '{
    "templateKey": "feasibility_v1",
    "assets": [
      {
        "filename": "全国乡村产业发展规划（2020‑2025年）（农业农村部印发）.pdf",
        "storagePath": "/Users/huimin/Desktop/report_nodejs/data/全国乡村产业发展规划（2020‑2025年）（农业农村部印发）.pdf",
        "assetType": "pdf"
      },
      {
        "filename": "测算数据.xlsx",
        "storagePath": "/Users/huimin/Desktop/report_nodejs/data/九江市八里湖新区九龙村农村产业融合示范园建设项目.xlsx",
        "assetType": "excel"
      },
      {
        "filename": "项目背景.json",
        "storagePath": "/Users/huimin/Desktop/report_nodejs/data/yizhengtong_dev_hamutact_letter_base_info.json",
        "assetType": "json"
      
      }
    ]
  }'
```

- `storagePath` 可以是本地绝对路径，或 Supabase Storage 的下载路径（此时需要在 `metadata` 中带上其他信息，并在 `AssetStorageService` 中调整下载逻辑）。
- 默认 `startPreprocess=true`，会立即将资产送入预处理队列。

## 2. 查询资产预处理状态

```bash
curl "http://localhost:3000/api/projects/demo-project/assets"
```

返回示例中 `embed_ready`/`table_ready` 字段表示预处理是否完成。

## 3. 生成大纲草案

```bash
curl -X POST "http://localhost:3000/api/projects/demo-project/outline/draft" \
  -H "Content-Type: application/json" \
  -d '{
    "templateKey": "standard_report_v1",
    "projectContext": {
      "project_name": "智慧园区建设项目",
      "location": "江苏省苏州市",
      "core_metrics": [
        { "name": "总投资", "value": "8.5亿元" },
        { "name": "建设周期", "value": "24个月" }
      ]
    }
  }'
```

响应包含 `outline`、版本号及落盘路径，可供前端展示或人工确认。

## 4. 启动报告生成 DAG

确认大纲后（可直接使用生成的 `outline`，也可在前端做微调），调用：

```bash
curl -X POST "http://localhost:3000/api/projects/demo-project/dag/run" \
  -H "Content-Type: application/json" \
  -d '{
    "outline": [
      {
        "chapter_number": "1",
        "title": "项目概况",
        "generate_prompt": true,
        "outline_structure": [
          { "chapter_number": "1.1", "title": "建设背景", "generate_prompt": true },
          { "chapter_number": "1.2", "title": "建设目标", "generate_prompt": true }
        ]
      }
    ],
    "projectContext": {
      "project_name": "智慧园区建设项目"
    }
  }'
```

响应返回 DAG 的节点、边、类型统计等信息，同时后端会把任务写入 `task_state` 并进入队列执行。

## 5. （可选）恢复挂起任务

若曾暂停或服务重启后需重新调度，就调用：

```bash
curl -X POST "http://localhost:3000/api/projects/demo-project/dag/resume"
```

## 6. 查询任务执行进度

- 查看全部任务：
  ```bash
  curl "http://localhost:3000/api/projects/demo-project/tasks"
  ```

- 按状态过滤（示例：pending、running、blocked）：
  ```bash
  curl "http://localhost:3000/api/projects/demo-project/tasks?status=pending,running,blocked"
  ```

- 查看当前所有 ready 节点：
  ```bash
  curl "http://localhost:3000/api/projects/demo-project/tasks/ready"
  ```

返回中 `tasks[].result` 字段会存放 Worker 的输出，例如 `write:*` 节点的草稿、`assemble:*` 节点的章节内容等，便于前端渲染或导出。

## 7. 获取最终章节内容

等 DAG 执行完成后，过滤 `status=completed`，根据 `nodeId` 和 `result` 取到最终内容。例如 `assemble:1` 对应章节结果，`assemble:document` 则是整份报告的合成文档。可以结合 `RenderService` 转成 Markdown/HTML 再下发给用户。

---

如需更多示例（例如使用 Supabase Storage、扩展业务字段、或前端伪代码），可以在此文档基础上继续补充。MD