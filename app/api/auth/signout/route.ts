import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supa = await createSupabaseServerClient()

  // Sign out through Supabase Auth - this clears the session and updates cookies
  const { error } = await supa.auth.signOut()

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    )
  }

  // Redirect to login page after successful signout
  const loginUrl = new URL('/auth/login', request.url)
  return NextResponse.json(
    { success: true, redirectTo: loginUrl.pathname },
    { status: 200 }
  )
}