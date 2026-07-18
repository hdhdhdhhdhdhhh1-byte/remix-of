// External Supabase client (locked). Do NOT let auto-gen overwrite.
// Env vars are read at build time from VITE_SUPABASE_*.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

const url = import.meta.env.VITE_SUPABASE_URL as string;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!url || !key) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. Set them in .env.local and in Netlify env.",
  );
}

export const supabase = createClient<Database>(url, key, {
  auth: {
    storage: typeof window !== "undefined" ? window.localStorage : undefined,
    persistSession: true,
    autoRefreshToken: true,
  },
});
