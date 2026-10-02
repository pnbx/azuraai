import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { generateApiKeySecret, formatApiKeyForDisplay } from '@/lib/api-keys'

export async function GET() {
  try {
    let user
    try {
      user = await getServerUser()
    } catch {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }

    const supa = await createSupabaseServerClient()
    const { data, error } = await supa
      .from('api_keys')
      .select('id, name, key_hash, scope, expires_at, last_used_at, revoked_at, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      throw new Error('Failed to fetch API keys')
    }

    return NextResponse.json({
      success: true,
      keys: data.map((k) => ({
        id: k.id,
        name: k.name,
        scope: k.scope,
        expiresAt: k.expires_at,
        lastUsedAt: k.last_used_at,
        revokedAt: k.revoked_at,
        createdAt: k.created_at,
      })),
    })
  } catch (error) {
    console.error('[API Keys] GET error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    let user
    try {
      user = await getServerUser()
    } catch {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'Key name is required' },
        { status: 400 }
      )
    }

    const { secret, hash } = generateApiKeySecret()

    const supa = await createSupabaseServerClient()
    const { data, error } = await supa
      .from('api_keys')
      .insert({
        user_id: user.id,
        key_hash: hash,
        name: name.trim(),
        scope: 'full',
      })
      .select('id, name, created_at')
      .single()

    if (error) {
      throw new Error('Failed to create API key')
    }

    return NextResponse.json({
      success: true,
      key: {
        id: data.id,
        name: data.name,
        secret: formatApiKeyForDisplay(secret),
        createdAt: data.created_at,
      },
      message: 'Copy this key now. For security, you won\'t be able to view it again.',
    })
  } catch (error) {
    console.error('[API Keys] POST error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
