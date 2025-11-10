/**
 * Stdio MCP Client 实现
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import {
    IMCPClient,
    MCPTool,
    MCPToolCallResult,
    MCPResource,
    MCPServerStdioConfig,
} from "./types.ts";

export class StdioMCPClient implements IMCPClient {
    private config: MCPServerStdioConfig;
    private client: Client | null = null;
    private connected = false;

    constructor(config: MCPServerStdioConfig) {
        this.config = config;
    }

    getName(): string {
        return this.config.name;
    }

    async connect(): Promise<boolean> {
        if (this.connected && this.client) {
            return true;
        }

        try {
            const transport = new StdioClientTransport({
                command: this.config.command,
                args: this.config.args || [],
                env: { ...process.env, ...this.config.env },
            });

            this.client = new Client(
                {
                    name: "mcp-client",
                    version: "1.0.0",
                },
                {
                    capabilities: {},
                }
            );

            await this.client.connect(transport);
            this.connected = true;
            return true;
        } catch (error) {
            this.connected = false;
            const errorMsg = error instanceof Error ? error.message : String(error);
            throw new Error(`Failed to connect to stdio server "${this.config.name}": ${errorMsg}`);
        }
    }

    async disconnect(): Promise<void> {
        if (this.client) {
            try {
                await this.client.close();
            } catch (error) {
                // 忽略断开连接时的错误
            }
            this.client = null;
        }
        this.connected = false;
    }

    isConnected(): boolean {
        return this.connected && this.client !== null;
    }

    async healthCheck(): Promise<boolean> {
        if (!this.isConnected()) {
            return false;
        }
        try {
            // 尝试列出工具作为健康检查
            await this.client!.listTools();
            return true;
        } catch {
            return false;
        }
    }

    async listTools(): Promise<MCPTool[]> {
        if (!this.client) {
            throw new Error(`Client "${this.config.name}" not connected`);
        }

        const response = await this.client.listTools();
        return (response.tools || []).map((tool) => ({
            name: tool.name,
            description: tool.description,
            inputSchema: tool.inputSchema,
        }));
    }

    async callTool(toolName: string, args: any): Promise<MCPToolCallResult> {
        if (!this.client) {
            throw new Error(`Client "${this.config.name}" not connected`);
        }

        const result = await this.client.callTool({
            name: toolName,
            arguments: args,
        });

        return {
            content: result.content || [],
            isError: result.isError,
        };
    }

    async listResources(): Promise<MCPResource[]> {
        if (!this.client) {
            throw new Error(`Client "${this.config.name}" not connected`);
        }

        const response = await this.client.listResources();
        return (response.resources || []).map((resource) => ({
            uri: resource.uri,
            name: resource.name,
            description: resource.description,
            mimeType: resource.mimeType,
        }));
    }

    async getResource(uri: string): Promise<any> {
        if (!this.client) {
            throw new Error(`Client "${this.config.name}" not connected`);
        }

        const result = await this.client.readResource({ uri });
        return result;
    }
}

