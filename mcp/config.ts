/**
 * 统一的 MCP Server 配置文件
 * 支持 Stdio 和 HTTP 两种传输方式
 */

import { MCPServerConfig } from "./types.ts";

/**
 * MCP Server 配置列表
 * 可以根据需要混合使用 stdio 和 http 两种方式
 */
export const mcpServerConfigs: MCPServerConfig[] = [
    // Stdio 方式（本地进程）
    {
        type: "stdio",
        name: "playwright",
        command: "npx",
        args: ["@playwright/mcp@latest"],
        description: "Playwright MCP Server (Stdio)",
        enabled: true,
    },
    {
        type: "stdio",
        name: "open-websearch-local",
        command: "npx",
        args: ["open-websearch@latest"],
        env: {
            MODE: "stdio",
            DEFAULT_SEARCH_ENGINE: "duckduckgo",
            ENABLE_CORS: "true",
            ALLOWED_SEARCH_ENGINES: "duckduckgo,bing,exa",
        },
        description: "Open WebSearch local MCP server",
        enabled: true,
    },



    // HTTP 方式（独立服务）

    {
        type: "http",
        name: "zhipu-web-search-sse",
        baseURL: "https://open.bigmodel.cn/api/mcp/web_search/sse",
        headers: {
            Authorization: `Bearer ${process.env.ZHIPU_API_KEY}`,
        },
        description: "Zhipu Web Search SSE MCP Server (HTTP)",
        enabled: true,
    },

];

