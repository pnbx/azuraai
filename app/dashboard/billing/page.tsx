'use client'

import * as React from 'react'
import { CreditCard, Plus, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EmptyState } from '@/components/ui/empty-state'
import { formatToman, formatDateTime } from '@/lib/utils'

interface WalletData {
  balance: { amount: number; currency: string; updatedAt: string }
  transactions: Array<{
    id: string; type: string; amount: number; currency: string
    balanceBefore: number; balanceAfter: number
    referenceId: string | null; status: string; createdAt: string
  }>
}

export default function BillingPage() {
  const [wallet, setWallet] = React.useState<WalletData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [funding, setFunding] = React.useState(false)
  const [fundAmount, setFundAmount] = React.useState('')
  const [showFund, setShowFund] = React.useState(false)
  const [fundMessage, setFundMessage] = React.useState('')

  const fetchWallet = () => {
    fetch('/api/wallet')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setWallet(data)
      })
      .finally(() => setLoading(false))
  }

  React.useEffect(() => { fetchWallet() }, [])

  const handleFund = async () => {
    const amount = parseInt(fundAmount, 10)
    if (isNaN(amount) || amount < 10000) {
      setFundMessage('Minimum funding is 10,000 Toman.')
      return
    }

    setFunding(true)
    setFundMessage('')

    try {
      const res = await fetch('/api/payments/intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountToman: amount,
          idempotencyKey: `fund-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        }),
      })

      const data = await res.json()

      if (data.success) {
        setFundMessage(`Payment intent created (${data.intent.status}). In production, this would open a payment provider form.`)
        setShowFund(false)
        setFundAmount('')
        fetchWallet()
      } else {
        setFundMessage(data.error || 'Failed to create payment intent.')
      }
    } catch {
      setFundMessage('Network error. Please try again.')
    } finally {
      setFunding(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-24" /><Skeleton className="h-24" /></div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Billing" description="Manage your wallet and view transaction history." />

      {/* Balance */}
      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          label="Current Balance"
          value={wallet ? formatToman(wallet.balance.amount) : '0 Toman'}
          description="Available funds"
          icon={<CreditCard className="h-4 w-4" />}
        />
        <StatCard
          label="Total Transactions"
          value={String(wallet?.transactions.length ?? 0)}
          description="All-time activity"
        />
      </div>

      {fundMessage && (
        <div className="rounded-md bg-info/10 p-3 text-sm text-info">{fundMessage}</div>
      )}

      {/* Add Funds */}
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-card-foreground">Add Funds</h2>
            <p className="text-xs text-muted-foreground">Fund your wallet with Toman.</p>
          </div>
          {!showFund && (
            <Button size="sm" onClick={() => setShowFund(true)}>
              <Plus className="h-3.5 w-3.5" /> Add Funds
            </Button>
          )}
        </div>

        {showFund && (
          <div className="mt-4 flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <label className="mb-1.5 block text-xs font-medium text-foreground">
                Amount (Toman)
              </label>
              <input
                type="number"
                value={fundAmount}
                onChange={(e) => setFundAmount(e.target.value)}
                placeholder="50,000"
                min={10000}
                max={10000000}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              />
              <p className="mt-1 text-[10px] text-muted-foreground">Min: 10,000 &middot; Max: 10,000,000</p>
            </div>
            <Button size="sm" onClick={handleFund} disabled={funding}>
              {funding ? 'Processing...' : 'Create Payment'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowFund(false); setFundMessage('') }}>
              Cancel
            </Button>
          </div>
        )}
      </div>

      {/* Transaction History */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold text-card-foreground">Transaction History</h2>
        </div>

        {!wallet || wallet.transactions.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Your wallet transactions will appear here after you add funds."
          />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Balance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {wallet.transactions.map((tx) => (
                  <TableRow key={tx.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {tx.amount >= 0 ? (
                          <ArrowDownLeft className="h-3.5 w-3.5 text-success" />
                        ) : (
                          <ArrowUpRight className="h-3.5 w-3.5 text-destructive" />
                        )}
                        <span className="text-sm capitalize">{tx.type.replace('_', ' ')}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm font-medium ${tx.amount >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {tx.amount >= 0 ? '+' : ''}{formatToman(tx.amount)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatToman(tx.balanceAfter)}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tx.status === 'completed' ? 'success' : 'secondary'}>
                        {tx.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground">
                      {formatDateTime(tx.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  )
}
