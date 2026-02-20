import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY as string | undefined;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured && typeof window !== "undefined") {
  const key = "supabase_env_warned";
  if (!sessionStorage.getItem(key)) {
    sessionStorage.setItem(key, "1");
    console.warn("Missing Supabase env. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY. App will run without sign-in and chat persistence.");
  }
}

// Supabase client requires a non-empty URL. When not configured, use a placeholder so the app
// still loads for local testing; auth and storage are skipped via isSupabaseConfigured.
const url = supabaseUrl || "https://placeholder.supabase.co";
const key = supabaseAnonKey || "placeholder-anon-key";
export const supabase: SupabaseClient = createClient(url, key);

