"use strict";

/**
 * App Memory — REST endpoint for the user's long-term memories.
 *
 * GET            → list memories (newest first)
 * POST {content} → add a manual memory
 * DELETE ?id=N   → forget one memory
 * DELETE ?all=1  → forget everything
 *
 * Auth: Supabase session (same as chat). Storage: `user_memory` table,
 * accessed with the service-role client keyed to the session user.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { supabaseAdmin } from '@/supabase/admin'

export const runtime = 'nodejs'

interface MemoryRow {
  id: number
  content: string
  source: string
  created_at: string
}

export async function GET() {
  let user
  try {
    user = await getServerUser()
  } catch {
    return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('user_memory')
    .select('id, content, source, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200)

  if (error) {
    return NextResponse.json({ success: false, error: 'memory_read_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, memories: (data ?? []) as MemoryRow[] })
}

export async function POST(req: NextRequest) {
  let user
  try {
    user = await getServerUser()
  } catch {
    return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 })
  }

  let body: { content?: unknown }
  try {
    body = (await req.json()) as { content?: unknown }
  } catch {
    return NextResponse.json({ success: false, error: 'invalid_json' }, { status: 400 })
  }

  const content = typeof body.content === 'string' ? body.content.trim() : ''
  if (content.length < 3 || content.length > 500) {
    return NextResponse.json({ success: false, error: 'content_3_to_500' }, { status: 400 })
  }

  const { count, error } = await supabaseAdmin
    .from('user_memory')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)

  if (error) {
    return NextResponse.json({ success: false, error: 'memory_read_failed' }, { status: 500 })
  }
  if ((count ?? 0) >= 200) {
    return NextResponse.json({ success: false, error: 'memory_full' }, { status: 429 })
  }

  const { data, error: insertError } = await supabaseAdmin
    .from('user_memory')
    .insert({ user_id: user.id, content, source: 'manual' })
    .select('id, content, source, created_at')
    .single()

  if (insertError || !data) {
    return NextResponse.json({ success: false, error: 'memory_write_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true, memory: data })
}

export async function DELETE(req: NextRequest) {
  let user
  try {
    user = await getServerUser()
  } catch {
    return NextResponse.json({ success: false, error: 'unauthenticated' }, { status: 401 })
  }

  const id = req.nextUrl.searchParams.get('id')
  const all = req.nextUrl.searchParams.get('all')

  if (all) {
    const { error } = await supabaseAdmin
      .from('user_memory')
      .delete()
      .eq('user_id', user.id)
    if (error) {
      return NextResponse.json({ success: false, error: 'memory_delete_failed' }, { status: 500 })
    }
    return NextResponse.json({ success: true })
  }

  const idNum = Number(id)
  if (!Number.isInteger(idNum) || idNum <= 0) {
    return NextResponse.json({ success: false, error: 'id_required' }, { status: 400 })
  }

  const { error } = await supabaseAdmin
    .from('user_memory')
    .delete()
    .eq('user_id', user.id)
    .eq('id', idNum)

  if (error) {
    return NextResponse.json({ success: false, error: 'memory_delete_failed' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
