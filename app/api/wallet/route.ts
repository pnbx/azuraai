import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { getBalance, getWalletTransactions } from '@/lib/wallet'

export async function GET() {
  try {
    let user
    try {
      user = await getServerUser()
    } catch {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }

    const [balance, transactions] = await Promise.all([
      getBalance(user.id),
      getWalletTransactions(user.id, 20),
    ])

    return NextResponse.json({
      success: true,
      balance: {
        amount: balance.balanceCents,
        currency: balance.currency,
        updatedAt: balance.updatedAt,
      },
      transactions: transactions.map((tx) => ({
        id: tx.id,
        type: tx.transactionType,
        amount: tx.amountCents,
        currency: tx.currency,
        balanceBefore: tx.balanceBeforeCents,
        balanceAfter: tx.balanceAfterCents,
        referenceId: tx.referenceId,
        status: tx.status,
        createdAt: tx.createdAt,
      })),
    })
  } catch (error) {
    console.error('[Wallet API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
