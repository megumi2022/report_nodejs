/**
 * MCP 统一类型定义
 */

export interface MCPTool {
    name: string;
    description?: string;
    inputSchema?: any; // JSON Schema
}

export interface MCPToolCallResult {
    content: Array<{
        type: "text" | "resource" | "image";
        text?: string;
        resource?: any;
        [key: string]: any;
    }>;
    isError?: boolean;
}

export interface MCPResource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}

/**
 * MCP Client 统一接口
 */
export interface IMCPClient {
    /**
     * 获取客户端名称
     */
    getName(): string;

    /**
     * 连接/初始化客户端
     */
    connect(): Promise<boolean>;

    /**
     * 断开连接
     */
    disconnect(): Promise<void>;

    /**
     * 检查连接状态
     */
    isConnected(): boolean;

    /**
     * 健康检查
     */
    healthCheck(): Promise<boolean>;

    /**
     * 获取工具列表
     */
    listTools(): Promise<MCPTool[]>;

    /**
     * 调用工具
     */
    callTool(toolName: string, args: any): Promise<MCPToolCallResult>;

    /**
     * 获取资源列表
     */
    listResources(): Promise<MCPResource[]>;

    /**
     * 获取资源内容
     */
    getResource(uri: string): Promise<any>;
}

/**
 * MCP Server 配置（统一配置接口）
 */
export interface MCPServerConfigBase {
    name: string;
    description?: string;
    enabled?: boolean; // 是否启用，默认 true
}

/**
 * Stdio 传输配置
 */
export interface MCPServerStdioConfig extends MCPServerConfigBase {
    type: "stdio";
    command: string;
    args?: string[];
    env?: Record<string, string>;
}

/**
 * HTTP 传输配置
 */
export interface MCPServerHTTPConfig extends MCPServerConfigBase {
    type: "http";
    baseURL: string;
    apiKey?: string;
    timeout?: number;
    headers?: Record<string, string>;
}

/**
 * 联合类型：所有支持的配置类型
 */
export type MCPServerConfig = MCPServerStdioConfig | MCPServerHTTPConfig;

/**
 * 客户端状态
 */
export interface MCPClientStatus {
    name: string;
    type: "stdio" | "http";
    connected: boolean;
    error?: string;
    lastCheck?: Date;
    tools?: number;
    resources?: number;
}

