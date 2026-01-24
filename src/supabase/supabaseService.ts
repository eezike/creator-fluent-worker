import { createClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * Create a Supabase admin client for background work.
 */
export function createSupabaseClient(
  supabaseUrl: string,
  serviceRoleKey: string
): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}
