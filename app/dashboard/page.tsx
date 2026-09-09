'use client'

import * as React from 'react'
import { CreditCard, Activity, Key, Cpu } from 'lucide-react'
import { StatCard } from '@/components/dashboard/stat-card'
import { PageHeader } from '@/components/dashboard/page-header'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { formatToman, formatDateTime } from '@/lib/utils'

interface WalletData {
  balance: { amount: number; currency: string; updatedAt: string }
  transactions: Array<{
    id: string; type: string; amount: number; status: string; createdAt: string
  }>
}

interface KeysData {
  keys: Array<{ id: string; name: string; revokedAt: string | null; createdAt: string }>
}

export default function OverviewPage() {
  const [wallet, setWallet] = React.useState<WalletData | null>(null)
  const [keys, setKeys] = React.useState<KeysData | null>(null)
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    Promise.all([
      fetch('/api/wallet').then((r) => r.json()),
      fetch('/api/api-keys').then((r) => r.json()),
    ]).then(([w, k]) => {
      if (w.success) setWallet(w)
      if (k.success) setKeys(k)
    }).finally(() => setLoading(false))
  }, [])

  const activeKeys = keys?.keys.filter((k) => !k.revokedAt).length ?? 0
  const recentTx = wallet?.transactions.slice(0, 5) ?? []

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" description="Your AzuraAI dashboard at a glance." />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Wallet Balance"
          value={wallet ? formatToman(wallet.balance.amount) : '0 Toman'}
          icon={<CreditCard className="h-4 w-4" />}
        />
        <StatCard
          label="Active API Keys"
          value={String(activeKeys)}
          icon={<Key className="h-4 w-4" />}
        />
        <StatCard
          label="Total Transactions"
          value={String(wallet?.transactions.length ?? 0)}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard
          label="Status"
          value="Operational"
          description="All systems normal"
          icon={<Cpu className="h-4 w-4" />}
        />
      </div>

      {/* Recent Activity */}
      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold text-card-foreground">Recent Activity</h2>
        </div>
        {recentTx.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-muted-foreground">No recent activity.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {recentTx.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-card-foreground capitalize">
                    {tx.type.replace('_', ' ')}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateTime(tx.createdAt)}</p>
                </div>
                <div className="ml-4 flex items-center gap-3">
                  <span className="text-sm font-medium text-card-foreground">
                    {tx.amount >= 0 ? '+' : ''}{formatToman(tx.amount)}
                  </span>
                  <Badge variant={tx.status === 'completed' ? 'success' : 'secondary'}>
                    {tx.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
