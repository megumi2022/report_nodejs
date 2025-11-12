# 提示词管理

本目录包含所有 Agent 的提示词模板，使用 Jinja2 语法（通过 Nunjucks 实现）。

## 目录结构

```
src/prompts/
├── outline-agent/              # 大纲生成 Agent
│   ├── system.j2               # 系统提示词
│   └── generate-subtitles.j2
├── prompt-agent/               # 提示词生成 Agent
│   ├── system.j2
│   └── generate-instruction.j2
├── content-agent/              # 内容生成 Agent
│   ├── system.j2
│   └── generate-content.j2
├── retrieval-agent/            # 检索 Agent
│   ├── web-search-system.j2
│   ├── web-search-user.j2
│   ├── database-query-system.j2
│   └── database-query-user.j2
└── README.md
```

## 使用方式

### 在代码中使用

```typescript
import { PromptService } from "../services/prompt-service.ts";

const promptService = new PromptService();

// 获取系统提示词
const systemPrompt = await promptService.getSystemPrompt("outline-agent");

// 获取用户提示词（带变量）
const userPrompt = await promptService.getUserPrompt(
    "outline-agent",
    "generate-subtitles",
    {
        section: {
            id: "1.1",
            title: "项目概述",
            govern_standard: "标准内容",
        },
        project_background: { /* ... */ },
    }
);
```

## 模板语法

使用 Jinja2 语法（Nunjucks 兼容）：

- `{{ variable }}` - 变量插值
- `{% if condition %}...{% endif %}` - 条件语句
- `{% for item in list %}...{% endfor %}` - 循环
- `{{ value | filter }}` - 过滤器

### 可用过滤器

- `tojson` - 将对象转换为 JSON 字符串
  ```jinja2
  {{ project_background | tojson(indent=2) }}
  ```

- `default` - 默认值
  ```jinja2
  {{ section.govern_standard | default("无") }}
  ```

## 添加新提示词

1. 在对应的 agent 目录下创建 `.j2` 文件
2. 使用 Jinja2 语法编写模板
3. 在代码中使用 `PromptService` 加载和渲染

## 优势

- ✅ **集中管理**：所有提示词在一个地方，易于查找和修改
- ✅ **版本控制**：提示词变更可通过 Git 追踪
- ✅ **模板化**：支持变量替换，避免字符串拼接
- ✅ **A/B 测试**：可轻松切换不同版本的提示词
- ✅ **代码清晰**：业务逻辑与提示词分离

