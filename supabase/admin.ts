import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase admin client.
 *
 * IMPORTANT:
 * - This file must NEVER be imported by any client-side code.
 * - It uses the SUPABASE_SERVICE_ROLE_KEY which bypasses Row Level Security.
 * - Only use it inside serverless functions / API routes for privileged
 *   operations (e.g., creating API keys, updating balances, writing usage logs).
 */

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error(
    'Missing required environment variables for Supabase admin client: ' +
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.'
  )
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})