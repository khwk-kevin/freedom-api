import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Server-side client with service role — bypasses RLS, server-only
export function createServiceClient() {
  return createSupabaseClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
