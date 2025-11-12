import { createClient, SupabaseClient } from "@supabase/supabase-js";
import "dotenv/config";

let cachedClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
    if (cachedClient) {
        return cachedClient;
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_KEY;

    if (!supabaseUrl || !supabaseKey) {
        throw new Error("Supabase URL/Key 未配置，请在 .env 中设置 SUPABASE_URL 和 SUPABASE_KEY");
    }

    cachedClient = createClient(supabaseUrl, supabaseKey);
    return cachedClient;
}
