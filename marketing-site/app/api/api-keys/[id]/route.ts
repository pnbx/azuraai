import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    let user
    try {
      user = await getServerUser()
    } catch {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }

    const { id } = await params

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid key ID' },
        { status: 400 }
      )
    }

    const supa = await createSupabaseServerClient()

    // Verify ownership and revoke
    const { data, error: fetchError } = await supa
      .from('api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .select('id')
      .single()

    if (fetchError || !data) {
      return NextResponse.json(
        { success: false, error: 'API key not found or already revoked' },
        { status: 404 }
      )
    }

    return NextResponse.json({ success: true, id: data.id })
  } catch (error) {
    console.error('[API Keys] DELETE error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
