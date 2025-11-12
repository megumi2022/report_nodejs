import { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabase-client.ts";

export interface ExcelTableInput {
    assetId: string;
    sheetName: string;
    tableName?: string;
    headerRow?: string[];
    columnTypes?: Record<string, string>;
    sampleRows?: any[];
    rowCount?: number;
    notes?: string;
}

export class ExcelTableService {
    constructor(private readonly supabase: SupabaseClient = getSupabaseClient()) {}

    async saveTables(tables: ExcelTableInput[]): Promise<void> {
        if (tables.length === 0) return;

        const payload = tables.map((table) => ({
            asset_id: table.assetId,
            sheet_name: table.sheetName,
            table_name: table.tableName ?? null,
            header_row: table.headerRow ?? null,
            column_types: table.columnTypes ?? null,
            sample_rows: table.sampleRows ?? null,
            row_count: table.rowCount ?? null,
            notes: table.notes ?? null,
        }));

        const { error } = await this.supabase.from("excel_tables").insert(payload);
        if (error) {
            throw new Error(`保存 Excel 解析结果失败: ${error.message}`);
        }
    }
}
