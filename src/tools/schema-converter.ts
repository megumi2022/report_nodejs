import { z } from "zod";

/**
 * 将 JSON Schema 转换为 Zod Schema
 * 用于将 MCP 工具的 JSON Schema 转换为 LangChain 工具所需的 Zod Schema
 */
export function jsonSchemaToZod(schema: any): z.ZodTypeAny {
    if (!schema || schema.type === undefined) {
        return z.any();
    }

    switch (schema.type) {
        case "string":
            if (schema.enum && Array.isArray(schema.enum) && schema.enum.length > 0) {
                return z.enum(schema.enum as [string, ...string[]]);
            }
            return z.string();
        case "number":
            return z.number();
        case "integer":
            return z.number().int();
        case "boolean":
            return z.boolean();
        case "array":
            return z.array(jsonSchemaToZod(schema.items || {}));
        case "object":
            if (schema.properties) {
                const shape: Record<string, z.ZodTypeAny> = {};
                for (const [key, value] of Object.entries(schema.properties)) {
                    const propSchema = value as any;
                    let zodProp = jsonSchemaToZod(propSchema);

                    if (!schema.required || !schema.required.includes(key)) {
                        zodProp = zodProp.optional();
                    }

                    shape[key] = zodProp;
                }
                return z.object(shape);
            }
            return z.record(z.any());
        default:
            return z.any();
    }
}

