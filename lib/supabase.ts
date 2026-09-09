import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/**
 * Creates a Supabase client for use in Route Handlers and API routes.
 * This client uses the public (anon) key and is appropriate for
 * authenticated API requests that need to interact with Supabase.
 *
 * This is different from the server client used in middleware
 * and Server Components, which also handles session cookies.
 */
export function createSupabaseBrowserClient() {
  return createClient(supabaseUrl, supabaseAnonKey)
}

/**
 * Direct Supabase client instance for browser usage.
 * This client doesn't handle session cookies and is appropriate for
 * client-side React components that need to access Supabase data.
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey)