import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, logAuditEvent } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/supabase/admin'
import { creditBalance, debitBalance } from '@/lib/wallet'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid wallet ID' }, { status: 400 })
    }

    const { data: wallet, error: walletError } = await supabaseAdmin
      .from('balances')
      .select('id, user_id, balance_cents, currency, updated_at')
      .eq('id', id)
      .single()

    if (walletError || !wallet) {
      return NextResponse.json({ success: false, error: 'Wallet not found' }, { status: 404 })
    }

    const { data: user } = await supabaseAdmin
      .from('users')
      .select('id, email, full_name')
      .eq('id', wallet.user_id)
      .single()

    const { data: transactions } = await supabaseAdmin
      .from('wallet_transactions')
      .select('id, transaction_type, amount_cents, balance_before_cents, balance_after_cents, reference_id, status, metadata, created_at')
      .eq('user_id', wallet.user_id)
      .order('created_at', { ascending: false })
      .limit(50)

    await logAuditEvent({
      actorId: admin.id,
      action: 'admin.wallet.view',
      targetType: 'wallet',
      targetId: id,
      metadata: { userId: wallet.user_id },
    })

    return NextResponse.json({
      success: true,
      wallet: {
        id: wallet.id,
        userId: wallet.user_id,
        email: user?.email ?? 'Unknown',
        fullName: user?.full_name,
        balance: wallet.balance_cents,
        currency: wallet.currency,
        updatedAt: wallet.updated_at,
      },
      transactions: (transactions ?? []).map((t) => ({
        id: t.id,
        type: t.transaction_type,
        amount: t.amount_cents,
        balanceBefore: t.balance_before_cents,
        balanceAfter: t.balance_after_cents,
        referenceId: t.reference_id,
        status: t.status,
        metadata: t.metadata,
        createdAt: t.created_at,
      })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }
    console.error('[Admin Wallet Detail] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const admin = await requireAdmin()
    const { id } = await params

    if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ success: false, error: 'Invalid wallet ID' }, { status: 400 })
    }

    const body = await request.json()
    const { action, amount, reason } = body

    if (!action || !['credit', 'debit'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action must be "credit" or "debit"' },
        { status: 400 }
      )
    }

    if (!amount || typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { success: false, error: 'amount must be a positive integer (Toman)' },
        { status: 400 }
      )
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 3) {
      return NextResponse.json(
        { success: false, error: 'reason is required (min 3 characters)' },
        { status: 400 }
      )
    }

    const { data: wallet } = await supabaseAdmin
      .from('balances')
      .select('id, user_id')
      .eq('id', id)
      .single()

    if (!wallet) {
      return NextResponse.json({ success: false, error: 'Wallet not found' }, { status: 404 })
    }

    const metadata = {
      admin_id: admin.id,
      admin_action: true,
      reason: reason.trim(),
    }

    if (action === 'credit') {
      await creditBalance(wallet.user_id, amount, null, metadata)
    } else {
      await debitBalance(wallet.user_id, amount, null, metadata)
    }

    await logAuditEvent({
      actorId: admin.id,
      action: `admin.wallet.adjust.${action}`,
      targetType: 'wallet',
      targetId: id,
      metadata: {
        userId: wallet.user_id,
        amount,
        reason: reason.trim(),
      },
    })

    const { data: updated } = await supabaseAdmin
      .from('balances')
      .select('balance_cents')
      .eq('id', id)
      .single()

    return NextResponse.json({
      success: true,
      newBalance: updated?.balance_cents ?? 0,
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }
    if (error instanceof Error && error.message.includes('Insufficient balance')) {
      return NextResponse.json({ success: false, error: 'Insufficient balance' }, { status: 400 })
    }
    console.error('[Admin Wallet Adjust] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
