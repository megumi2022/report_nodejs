/**
 * MCP Agent Pipeline - 使用统一的 MCP Client Manager
 * 管理 MCP 工具的发现、加载和 Agent 执行
 */

import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { MCPClientManager, IMCPClient, MCPTool } from "../../mcp/index.ts";
import { mcpServerConfigs } from "../../mcp/config.ts";
import { jsonSchemaToZod } from "../tools/schema-converter.ts";
import * as dotenv from "dotenv";

dotenv.config();

/**
 * MCP Agent Pipeline
 * 负责管理 MCP 工具和 Agent 的执行流程
 */
export class MCPAgentPipeline {
    private mcpManager: MCPClientManager;
    private agent: any;
    private tools: DynamicStructuredTool[] = [];
    private initialized = false;

    constructor(mcpManager?: MCPClientManager) {
        this.mcpManager = mcpManager || new MCPClientManager();
    }

    /**
     * 初始化：发现并加载所有工具
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            console.log("⚠️  Pipeline 已经初始化，跳过");
            return;
        }

        console.log("🔍 发现 MCP 工具...");

        // 注册配置
        this.mcpManager.registerServers(mcpServerConfigs);

        // 连接所有启用的 Server
        const configs = this.mcpManager.getConfigs();
        for (const config of configs) {
            if (config.enabled !== false) {
                try {
                    await this.mcpManager.connectServer(config.name);
                } catch (error) {
                    console.error(`连接 ${config.name} 失败:`, error);
                }
            }
        }

        // 从所有已连接的客户端获取工具
        const statuses = this.mcpManager.getStatuses();
        for (const [name, status] of statuses) {
            if (status.connected) {
                const client = this.mcpManager.getClient(name);
                if (client) {
                    try {
                        const tools = await client.listTools();
                        console.log(`📦 从 "${name}" 获取到 ${tools.length} 个工具`);

                        for (const tool of tools) {
                            const langchainTool = this.convertToLangChainTool(
                                tool,
                                name,
                                client
                            );
                            this.tools.push(langchainTool);
                        }
                    } catch (error) {
                        console.error(`从 "${name}" 加载工具失败:`, error);
                    }
                }
            }
        }

        console.log(`✅ 总共加载了 ${this.tools.length} 个工具`);

        // 创建模型实例
        const model = new ChatOpenAI({
            model: process.env.MODEL_NAME || "qwen3-32b",
            temperature: parseFloat(process.env.TEMPERATURE || "0.7"),
            apiKey: process.env.QWEN_API_KEY,
            configuration: {
                baseURL: process.env.QWEN_API_BASE,
            },
        });

        // 工具筛选：只使用必要的工具，避免请求体过大
        const toolsToUse = this.filterEssentialTools(this.tools);

        if (toolsToUse.length < this.tools.length) {
            console.log(`📦 从 ${this.tools.length} 个工具中筛选出 ${toolsToUse.length} 个必要工具`);
        }

        if (toolsToUse.length > 20) {
            console.warn(`⚠️  工具数量较多 (${toolsToUse.length})，某些模型 API 可能不支持`);
            console.warn("   建议：只启用需要的工具，或使用支持更多工具的模型");
        }

        this.agent = createAgent({
            model: model,
            tools: toolsToUse,
        });

        this.initialized = true;
        console.log("✅ Pipeline 初始化完成");
    }

    /**
     * 执行：控制 Agent 的执行流程
     */
    async execute(userInput: string, systemPrompt?: string): Promise<string> {
        if (!this.initialized) {
            await this.initialize();
        }

        const messages: any[] = [];

        if (systemPrompt) {
            messages.push({ role: "system", content: systemPrompt });
        }

        messages.push({ role: "user", content: userInput });

        try {
            const result = await this.agent.invoke({ messages });
            const lastMessage = result.messages[result.messages.length - 1];
            return lastMessage.content || "没有返回内容";
        } catch (error) {
            let errorMsg = "未知错误";
            let errorDetails: any = {};

            if (error instanceof Error) {
                errorMsg = error.message;
                errorDetails = {
                    name: error.name,
                    message: error.message,
                };

                const openaiError = error as any;
                if (openaiError.status) {
                    errorDetails.status = openaiError.status;
                }
                if (openaiError.statusText) {
                    errorDetails.statusText = openaiError.statusText;
                }
                if (openaiError.body) {
                    errorDetails.body = openaiError.body;
                }

                if (errorMsg.includes("400") || errorMsg.includes("status code")) {
                    console.error("\n❌ 400 错误诊断:");
                    console.error("   可能原因：");
                    console.error("   1. 工具数量过多（当前:", this.tools.length, "个）");
                    console.error("   2. 工具 schema 格式不符合模型 API 要求");
                    console.error("   3. 模型 API 不支持 function calling 或工具数量有限制");
                    console.error("\n   建议：");
                    console.error("   - 减少工具数量（已自动筛选必要工具）");
                    console.error("   - 检查模型 API 是否支持 function calling");
                    console.error("   - 尝试使用更少的工具进行测试");

                    if (errorDetails.body) {
                        console.error("\n   错误响应体:", errorDetails.body);
                    }
                }
            } else {
                errorDetails = { raw: error };
            }

            throw new Error(`Agent 执行失败: ${errorMsg}`);
        }
    }

    /**
     * 获取所有已加载的工具
     */
    getTools(): DynamicStructuredTool[] {
        return [...this.tools];
    }

    /**
     * 获取工具数量
     */
    getToolCount(): number {
        return this.tools.length;
    }

    /**
     * 直接调用工具（不通过 Agent）
     */
    async callToolDirectly(
        serverName: string,
        toolName: string,
        args: any
    ): Promise<any> {
        const client = this.mcpManager.getClient(serverName);
        if (!client) {
            throw new Error(`Server "${serverName}" not connected`);
        }
        return await client.callTool(toolName, args);
    }

    /**
     * 获取 MCP Manager（用于高级操作）
     */
    getMCPManager(): MCPClientManager {
        return this.mcpManager;
    }

    /**
     * 筛选必要的工具
     * 只保留最常用的工具，避免请求体过大
     */
    private filterEssentialTools(tools: DynamicStructuredTool[]): DynamicStructuredTool[] {
        // 从环境变量读取最大工具数量限制
        const maxTools = parseInt(process.env.MAX_TOOLS || "10", 10);

        // 如果工具数量已经很少，直接返回
        if (tools.length <= maxTools) {
            return tools;
        }

        // 定义必要的工具关键词（按优先级排序）
        const essentialKeywords = [
            'navigate',      // 导航 - 最常用
            'snapshot',      // 快照 - 用于页面分析
            'click',         // 点击
            'type',          // 输入
            'screenshot',    // 截图
            'wait',          // 等待
            'evaluate',      // 执行脚本
        ];

        // 筛选包含关键词的工具
        const essentialTools = tools.filter(tool => {
            const name = tool.name.toLowerCase();
            return essentialKeywords.some(keyword => name.includes(keyword));
        });

        // 如果筛选后工具数量合适，返回筛选结果
        if (essentialTools.length > 0 && essentialTools.length <= maxTools) {
            return essentialTools;
        }

        // 如果筛选后工具太多，按优先级排序并截取
        if (essentialTools.length > maxTools) {
            const sorted = essentialTools.sort((a, b) => {
                const aPriority = essentialKeywords.findIndex(k => a.name.toLowerCase().includes(k));
                const bPriority = essentialKeywords.findIndex(k => b.name.toLowerCase().includes(k));
                return (aPriority === -1 ? 999 : aPriority) - (bPriority === -1 ? 999 : bPriority);
            });
            return sorted.slice(0, maxTools);
        }

        // 如果筛选后工具太少，至少保留前 maxTools 个
        if (essentialTools.length < 5 && tools.length > 0) {
            console.log(`⚠️  筛选后工具太少，使用前 ${maxTools} 个工具`);
            return tools.slice(0, maxTools);
        }

        return essentialTools.length > 0 ? essentialTools : tools.slice(0, maxTools);
    }

    /**
     * 将 MCP 工具转换为 LangChain 工具
     */
    private convertToLangChainTool(
        tool: MCPTool,
        serverName: string,
        client: IMCPClient
    ): DynamicStructuredTool {
        const inputSchema = tool.inputSchema || {};
        const zodSchema = jsonSchemaToZod(inputSchema);

        const toolName = `${serverName}_${tool.name}`;

        return new DynamicStructuredTool({
            name: toolName,
            description:
                tool.description ||
                `MCP tool "${tool.name}" from server "${serverName}"`,
            schema: zodSchema,
            func: async (input: any) => {
                try {
                    console.log(`🔧 调用工具: ${toolName}`, input);

                    const result = await client.callTool(tool.name, input);

                    if (result.content && result.content.length > 0) {
                        const contents = result.content
                            .map((item: any) => {
                                if (item.type === "text") {
                                    return item.text;
                                } else if (item.type === "resource") {
                                    return JSON.stringify(item);
                                }
                                return String(item);
                            })
                            .join("\n");

                        console.log(`✅ 工具 ${toolName} 执行成功`);
                        return contents;
                    }

                    return JSON.stringify(result);
                } catch (error) {
                    const errorMsg =
                        error instanceof Error ? error.message : String(error);
                    console.error(`❌ 工具 ${toolName} 执行失败:`, errorMsg);
                    return `错误: ${errorMsg}`;
                }
            },
        });
    }
}

