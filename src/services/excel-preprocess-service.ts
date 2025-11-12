import xlsx from "xlsx";
import { AssetIndexRecord } from "./asset-registry-service.ts";
import { ExcelTableService, ExcelTableInput } from "./excel-table-service.ts";
import { ProjectMetricService } from "./project-metric-service.ts";

export class ExcelPreprocessService {
    constructor(
        private readonly tableService = new ExcelTableService(),
        private readonly metricService = new ProjectMetricService()
    ) { }

    async process(asset: AssetIndexRecord, buffer: Buffer): Promise<number> {
        const workbook = xlsx.read(buffer, { type: "buffer" });
        const tables: ExcelTableInput[] = [];
        let totalRows = 0;

        const sheetMetrics: Array<{ sheet: string; totals: Record<string, any> }> = [];

        workbook.SheetNames.forEach((sheetName) => {
            const sheet = workbook.Sheets[sheetName];
            const sheetJson = xlsx.utils.sheet_to_json(sheet, {
                header: 1,
                defval: "",
            }) as (string | number | null)[][];

            if (sheetJson.length === 0) return;

            const headerRow = sheetJson[0].map((cell) => String(cell ?? "").trim());
            const dataRows = sheetJson.slice(1).filter((row) => row.some((cell) => String(cell ?? "").trim() !== ""));
            totalRows += dataRows.length;

            const columnTypes: Record<string, string> = {};
            headerRow.forEach((header, idx) => {
                const key = header || `列${idx + 1}`;
                const columnValues = dataRows.map((row) => row[idx]);
                columnTypes[key] = this.detectColumnType(columnValues);
            });

            const columnStats: Record<string, any> = {};

            tables.push({
                assetId: asset.id,
                sheetName,
                headerRow,
                columnTypes,
                sampleRows: dataRows.slice(0, 5),
                rowCount: dataRows.length,
            });

            headerRow.forEach((header, idx) => {
                const key = header || `列${idx + 1}`;
                const type = columnTypes[key];
                if (type === "number") {
                    const numbers = dataRows
                        .map((row) => Number(row[idx]))
                        .filter((value) => !Number.isNaN(value));

                    if (numbers.length > 0) {
                        const sum = numbers.reduce((acc, cur) => acc + cur, 0);
                        columnStats[key] = {
                            count: numbers.length,
                            sum,
                            average: sum / numbers.length,
                            min: Math.min(...numbers),
                            max: Math.max(...numbers),
                        };
                    }
                }
            });

            sheetMetrics.push({
                sheet: sheetName,
                totals: {
                    rowCount: dataRows.length,
                    numericColumns: columnStats,
                },
            });
        });

        await this.tableService.saveTables(tables);

        await this.metricService.upsertMetric({
            projectId: asset.project_id,
            metricName: "excel_row_count",
            metricValue: { assetId: asset.id, totalRows },
            scope: "asset",
            targetId: asset.id,
        });

        for (const metric of sheetMetrics) {
            await this.metricService.upsertMetric({
                projectId: asset.project_id,
                metricName: "excel_sheet_stats",
                metricValue: {
                    assetId: asset.id,
                    sheet: metric.sheet,
                    totals: metric.totals,
                },
                scope: "asset",
                targetId: `${asset.id}:${metric.sheet}`,
            });
        }

        return tables.length;
    }

    private detectColumnType(values: any[]): string {
        let numberCount = 0;
        let dateCount = 0;
        let stringCount = 0;

        values.forEach((value) => {
            if (value === null || value === undefined || value === "") {
                return;
            }

            const numeric = Number(value);
            if (!Number.isNaN(numeric) && isFinite(numeric)) {
                numberCount++;
                return;
            }

            const date = new Date(value);
            if (!Number.isNaN(date.getTime())) {
                dateCount++;
                return;
            }

            stringCount++;
        });

        if (numberCount > stringCount && numberCount > dateCount) {
            return "number";
        }
        if (dateCount > numberCount && dateCount > stringCount) {
            return "date";
        }
        return "string";
    }
}
