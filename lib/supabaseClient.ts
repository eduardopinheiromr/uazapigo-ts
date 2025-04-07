// lib/supabaseClient.ts

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing Supabase environment variables");
}

/**
 * Cliente Supabase configurado para uso em todo o aplicativo
 */
const supabaseClient = createClient(supabaseUrl, supabaseKey);

export default supabaseClient;
