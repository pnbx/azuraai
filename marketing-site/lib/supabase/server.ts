/**
 * Supabase Server Client
 *
 * This client is used in Server Components, Server Actions, and Route Handlers.
 * It correctly handles Supabase Auth session cookies for SSR.
 *
 * IMPORTANT: This file MUST only be imported in server-side code.
 * The server client uses the anon key but reads/writes the auth cookies
 * from the request/response headers.
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Creates a Supabase client for use in Server Components and Route Handlers.
 * The client automatically reads the auth cookie from the request headers
 * and writes any refreshed session cookie to the response headers.
 *
 * Usage in Server Components/Route Handlers:
 *   const supa = await createSupabaseServerClient()
 *   const { data: { session } } = await supa.auth.getSession()
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
}