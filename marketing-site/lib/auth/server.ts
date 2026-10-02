/**
 * Azura Server Authentication Helpers
 *
 * Contains server-only helpers for authenticating users in Route Handlers
 * and Server Components. These helpers MUST only be imported in server-side code.
 *
 * Security:
 * - Uses getUser() (not getSession()) for server-side authorization
 * - Verifies the user's identity by fetching from the Supabase Auth server
 * - No client-provided identity is trusted
 * - service_role key is NEVER used
 */

import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * getServerUser - Get the authenticated user from Supabase Auth.
 *
 * This function:
 * - Creates a Supabase server client (reads auth cookie, validates session)
 * - Calls getUser() to fetch the user object from the Auth server
 * - Returns the verified user or throws if not authenticated
 *
 * This must be called in Server Components or Route Handlers.
 * Never call this in client-side code.
 *
 * @returns {Promise<User>} The authenticated Supabase user
 * @throws {Error} If the user is not authenticated
 */
export async function getServerUser() {
  const supa = await createSupabaseServerClient()
  const { data: { user }, error } = await supa.auth.getUser()

  if (error || !user) {
    throw new Error('Unauthenticated')
  }

  return user
}

/**
 * requireServerUser - Ensure the request is authenticated.
 *
 * This function:
 * - Calls getServerUser() to verify authentication
 * - Returns the user if authenticated
 * - Throws 'Unauthenticated' if not
 *
 * Use this in Route Handlers and Server Components that require authentication.
 *
 * @returns {Promise<User>} The authenticated Supabase user
 * @throws {Error} If the user is not authenticated
 */
export async function requireServerUser() {
  return await getServerUser()
}