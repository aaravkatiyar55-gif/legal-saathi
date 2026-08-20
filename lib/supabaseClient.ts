import { createClient } from "@supabase/supabase-js";

const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || "";
const configuredKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  || "";

// Primary authentication is backend-controlled in lib/authClient.ts. This
// no-storage client remains only for legacy settings code until that screen is
// migrated to backend MFA routes; it can never persist an auth token locally.
const supabaseUrl = configuredUrl || "http://127.0.0.1:54321";
const supabaseKey = configuredKey || "public-key-not-configured";

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});

export const isBrowserSupabaseConfigured = Boolean(configuredUrl && configuredKey);
