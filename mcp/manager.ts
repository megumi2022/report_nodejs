/**
 * 统一的 MCP Client 管理器
 * 支持 Stdio 和 HTTP 两种传输方式
 */

import { IMCPClient, MCPServerConfig, MCPClientStatus } from "./types.ts";
import { StdioMCPClient } from "./stdioClient.ts";
import { HTTPMCPClient } from "./httpClient.ts";

export class MCPClientManager {
    private clients: Map<string, IMCPClient> = new Map();
    private configs: Map<string, MCPServerConfig> = new Map();
    private statuses: Map<string, MCPClientStatus> = new Map();

    /**
     * 注册 MCP Server 配置
     */
    registerServer(config: MCPServerConfig): void {
        this.configs.set(config.name, config);
        this.statuses.set(config.name, {
            name: config.name,
            type: config.type,
            connected: false,
        });
    }

    /**
     * 批量注册 MCP Server
     */
    registerServers(configs: MCPServerConfig[]): void {
        configs.forEach((config) => {
            if (config.enabled !== false) {
                this.registerServer(config);
            }
        });
    }

    /**
     * 创建并连接客户端
     */
    async connectServer(name: string): Promise<boolean> {
        const config = this.configs.get(name);
        if (!config) {
            throw new Error(`Server "${name}" not found`);
        }

        // 如果已连接，先断开
        if (this.clients.has(name)) {
            await this.disconnectServer(name);
        }

        try {
            let client: IMCPClient;

            // 根据配置类型创建对应的客户端
            if (config.type === "stdio") {
                client = new StdioMCPClient(config);
            } else if (config.type === "http") {
                client = new HTTPMCPClient(config);
            } else {
                throw new Error(`Unsupported transport type: ${(config as any).type}`);
            }

            // 连接客户端
            const connected = await client.connect();

            if (connected) {
                this.clients.set(name, client);
                this.updateStatus(name, {
                    connected: true,
                    lastCheck: new Date(),
                });

                // 获取工具和资源数量
                try {
                    const tools = await client.listTools();
                    const resources = await client.listResources();
                    this.updateStatus(name, {
                        tools: tools.length,
                        resources: resources.length,
                    });
                } catch (error) {
                    // 忽略获取工具/资源时的错误
                }

                console.log(`✅ 成功连接到 MCP Server: ${name} (${config.type})`);
                return true;
            }

            return false;
        } catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.updateStatus(name, {
                connected: false,
                error: errorMsg,
                lastCheck: new Date(),
            });
            console.error(`❌ 连接 MCP Server "${name}" 失败:`, errorMsg);
            return false;
        }
    }

    /**
     * 断开指定 Server
     */
    async disconnectServer(name: string): Promise<void> {
        const client = this.clients.get(name);
        if (client) {
            try {
                await client.disconnect();
            } catch (error) {
                console.error(`断开连接 "${name}" 时出错:`, error);
            }
            this.clients.delete(name);
            this.updateStatus(name, { connected: false });
        }
    }

    /**
     * 获取客户端
     */
    getClient(name: string): IMCPClient | undefined {
        return this.clients.get(name);
    }

    /**
     * 测试指定 Server 的连通性
     */
    async testServer(name: string): Promise<MCPClientStatus> {
        const config = this.configs.get(name);
        if (!config) {
            throw new Error(`Server "${name}" not found`);
        }

        const connected = await this.connectServer(name);
        const status = this.statuses.get(name)!;

        if (connected) {
            try {
                const client = this.clients.get(name)!;
                const isHealthy = await client.healthCheck();
                this.updateStatus(name, {
                    connected: isHealthy,
                    lastCheck: new Date(),
                });
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : String(error);
                this.updateStatus(name, {
                    error: `Health check failed: ${errorMsg}`,
                });
            }
        }

        return { ...this.statuses.get(name)! };
    }

    /**
     * 测试所有 Server 的连通性
     */
    async testAllServers(): Promise<Map<string, MCPClientStatus>> {
        console.log("\n🔍 开始测试所有 MCP Server...\n");

        const results = new Map<string, MCPClientStatus>();

        for (const name of this.configs.keys()) {
            console.log(`测试 ${name}...`);
            const status = await this.testServer(name);
            results.set(name, status);

            if (status.connected) {
                console.log(`  ✅ ${name} (${status.type}): 已连接`);
                console.log(`     - 工具: ${status.tools || 0}`);
                console.log(`     - 资源: ${status.resources || 0}\n`);
            } else {
                console.log(`  ❌ ${name} (${status.type}): 连接失败`);
                if (status.error) {
                    console.log(`     错误: ${status.error}\n`);
                }
            }
        }

        return results;
    }

    /**
     * 获取所有已注册的配置
     */
    getConfigs(): MCPServerConfig[] {
        return Array.from(this.configs.values());
    }

    /**
     * 获取所有 Server 的状态
     */
    getStatuses(): Map<string, MCPClientStatus> {
        return new Map(this.statuses);
    }

    /**
     * 获取指定 Server 的状态
     */
    getStatus(name: string): MCPClientStatus | undefined {
        return this.statuses.get(name);
    }

    /**
     * 断开所有连接
     */
    async disconnectAll(): Promise<void> {
        const names = Array.from(this.clients.keys());
        await Promise.all(names.map((name) => this.disconnectServer(name)));
    }

    /**
     * 更新状态
     */
    private updateStatus(name: string, updates: Partial<MCPClientStatus>): void {
        const current = this.statuses.get(name);
        if (current) {
            this.statuses.set(name, { ...current, ...updates });
        }
    }
}

