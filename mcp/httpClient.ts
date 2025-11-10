/**
 * HTTP MCP Client 实现
 */

import {
    IMCPClient,
    MCPTool,
    MCPToolCallResult,
    MCPResource,
    MCPServerHTTPConfig,
} from "./types.ts";

export class HTTPMCPClient implements IMCPClient {
    private config: MCPServerHTTPConfig;
    private connected = false;
    private defaultTimeout = 30000;

    constructor(config: MCPServerHTTPConfig) {
        this.config = config;
    }

    getName(): string {
        return this.config.name;
    }

    async connect(): Promise<boolean> {
        // HTTP 客户端不需要显式连接，通过健康检查验证
        const isHealthy = await this.healthCheck();
        this.connected = isHealthy;
        return isHealthy;
    }

    async disconnect(): Promise<void> {
        // HTTP 客户端不需要显式断开
        this.connected = false;
    }

    isConnected(): boolean {
        return this.connected;
    }

    async healthCheck(): Promise<boolean> {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(`${this.config.baseURL}/health`, {
                method: "GET",
                headers: this.buildHeaders(),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            const isHealthy = response.ok;
            this.connected = isHealthy;
            return isHealthy;
        } catch {
            this.connected = false;
            return false;
        }
    }

    async listTools(): Promise<MCPTool[]> {
        const controller = new AbortController();
        const timeout = this.config.timeout || this.defaultTimeout;
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(`${this.config.baseURL}/tools`, {
                method: "GET",
                headers: this.buildHeaders(),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Failed to list tools: ${response.statusText}`);
            }

            const data = await response.json();
            return data.tools || [];
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(`Request timeout for server "${this.config.name}"`);
            }
            throw error;
        }
    }

    async callTool(toolName: string, args: any): Promise<MCPToolCallResult> {
        const controller = new AbortController();
        const timeout = this.config.timeout || this.defaultTimeout;
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(
                `${this.config.baseURL}/tools/${toolName}`,
                {
                    method: "POST",
                    headers: {
                        ...this.buildHeaders(),
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({ arguments: args }),
                    signal: controller.signal,
                }
            );

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(
                    `Tool call failed: ${response.statusText} - ${errorText}`
                );
            }

            return await response.json();
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(
                    `Request timeout for tool "${toolName}" on server "${this.config.name}"`
                );
            }
            throw error;
        }
    }

    async listResources(): Promise<MCPResource[]> {
        const controller = new AbortController();
        const timeout = this.config.timeout || this.defaultTimeout;
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(`${this.config.baseURL}/resources`, {
                method: "GET",
                headers: this.buildHeaders(),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Failed to list resources: ${response.statusText}`);
            }

            const data = await response.json();
            return data.resources || [];
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(`Request timeout for server "${this.config.name}"`);
            }
            throw error;
        }
    }

    async getResource(uri: string): Promise<any> {
        const controller = new AbortController();
        const timeout = this.config.timeout || this.defaultTimeout;
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const response = await fetch(
                `${this.config.baseURL}/resources/${encodeURIComponent(uri)}`,
                {
                    method: "GET",
                    headers: this.buildHeaders(),
                    signal: controller.signal,
                }
            );

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`Failed to get resource: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            if (error instanceof Error && error.name === "AbortError") {
                throw new Error(`Request timeout for server "${this.config.name}"`);
            }
            throw error;
        }
    }

    private buildHeaders(): Record<string, string> {
        const headers: Record<string, string> = {
            ...this.config.headers,
        };

        if (this.config.apiKey) {
            headers["Authorization"] = `Bearer ${this.config.apiKey}`;
        }

        return headers;
    }
}

