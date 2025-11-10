/**
 * 模板服务 - 从 Supabase 获取报告模板
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config();

export interface ReportTemplate {
    template_id: string;
    template_key: string;
    outline_structure: any;
}

export class TemplateService {
    private supabase: ReturnType<typeof createClient>;

    constructor() {
        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_KEY;

        if (!supabaseUrl || !supabaseKey) {
            throw new Error("Supabase URL 和 Key 未配置");
        }

        this.supabase = createClient(supabaseUrl, supabaseKey);
    }

    /**
     * 根据 template_key 获取模板
     */
    async getTemplate(templateKey: string): Promise<ReportTemplate | null> {
        try {
            const { data, error } = await this.supabase
                .from("report_template")
                .select("template_id, template_key, outline_structure")
                .eq("template_key", templateKey)
                .maybeSingle();

            if (error) {
                console.error(`获取模板失败: ${error.message}`);
                return null;
            }

            if (!data) {
                console.warn(`未找到模板: ${templateKey}`);
                return null;
            }

            return data as ReportTemplate;
        } catch (error: any) {
            console.error(`模板查询异常: ${error.message}`);
            return null;
        }
    }

    /**
     * 获取所有可用模板
     */
    async getAllTemplates(): Promise<ReportTemplate[]> {
        try {
            const { data, error } = await this.supabase
                .from("report_template")
                .select("template_id, template_key, outline_structure");

            if (error) {
                console.error(`获取模板列表失败: ${error.message}`);
                return [];
            }

            return (data || []) as ReportTemplate[];
        } catch (error: any) {
            console.error(`模板列表查询异常: ${error.message}`);
            return [];
        }
    }
}

