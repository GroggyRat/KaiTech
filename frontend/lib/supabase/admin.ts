import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY. Uses the service role key, which bypasses RLS entirely.
 * Never import this from a client component, and never expose
 * SUPABASE_SERVICE_ROLE_KEY with a NEXT_PUBLIC_ prefix.
 */
export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");
  }

  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
