import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, logAuditEvent } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/supabase/admin'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid user ID' }, { status: 400 })
    }

    const { data: user, error: userError } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name, phone, is_active, role, preferred_language, created_at, updated_at')
      .eq('id', id)
      .single()

    if (userError || !user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 })
    }

    const [balanceResult, keysResult, paymentsResult, usageResult] = await Promise.all([
      supabaseAdmin.from('balances').select('balance_cents, currency').eq('user_id', id).single(),
      supabaseAdmin
        .from('api_keys')
        .select('id, name, is_active:scope, created_at, last_used_at, revoked_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false }),
      supabaseAdmin
        .from('payment_intents')
        .select('id, amount_toman, status, provider, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabaseAdmin
        .from('usage_logs')
        .select('id, azura_model_id, input_tokens, output_tokens, status, request_ts')
        .eq('user_id', id)
        .order('request_ts', { ascending: false })
        .limit(20),
    ])

    const usageStats = await supabaseAdmin
      .from('usage_logs')
      .select('input_tokens, output_tokens, azura_customer_charge_cents, status')
      .eq('user_id', id)

    const logs = usageStats.data ?? []
    const totalTokens = logs.reduce((s, l) => s + (l.input_tokens ?? 0) + (l.output_tokens ?? 0), 0)
    const totalCost = logs.reduce((s, l) => s + (l.azura_customer_charge_cents ?? 0), 0)
    const totalRequests = logs.length

    await logAuditEvent({
      actorId: admin.id,
      action: 'admin.user.view',
      targetType: 'user',
      targetId: id,
    })

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        fullName: user.full_name,
        phone: user.phone,
        isActive: user.is_active,
        role: user.role,
        preferredLanguage: user.preferred_language,
        createdAt: user.created_at,
        updatedAt: user.updated_at,
      },
      wallet: {
        balance: balanceResult.data?.balance_cents ?? 0,
        currency: balanceResult.data?.currency ?? 'TOMAN',
      },
      apiKeys: {
        total: keysResult.data?.length ?? 0,
        active: (keysResult.data ?? []).filter((k) => !k.revoked_at).length,
        keys: (keysResult.data ?? []).map((k) => ({
          id: k.id,
          name: k.name,
          createdAt: k.created_at,
          lastUsedAt: k.last_used_at,
          revokedAt: k.revoked_at,
        })),
      },
      payments: (paymentsResult.data ?? []).map((p) => ({
        id: p.id,
        amountToman: p.amount_toman,
        status: p.status,
        provider: p.provider,
        createdAt: p.created_at,
      })),
      usage: {
        totalRequests,
        totalTokens,
        totalCost,
        recent: (usageResult.data ?? []).map((l) => ({
          id: l.id,
          model: l.azura_model_id,
          inputTokens: l.input_tokens,
          outputTokens: l.output_tokens,
          status: l.status,
          requestTs: l.request_ts,
        })),
      },
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }
    console.error('[Admin User Detail] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
