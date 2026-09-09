'use client'

import * as React from 'react'
import { Users, Wallet, CreditCard, Cpu, Server, AlertCircle, Activity } from 'lucide-react'
import { StatCard } from '@/components/dashboard/stat-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { formatToman } from '@/lib/utils'

interface Overview {
  users: { total: number }
  wallet: { totalBalance: number }
  payments: { total: number; successful: number; failed: number; volume30d: number }
  usage: { requests30d: number; tokens30d: number; cost30d: number; errors30d: number }
  models: { total: number; active: number }
  providers: { total: number }
}

export default function AdminOverviewPage() {
  const [overview, setOverview] = React.useState<Overview | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    fetch('/api/admin/overview')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setOverview(data.overview)
        else setError(data.error || 'Failed to load')
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(8)].map((_, i) => (
            <Skeleton key={i} className="h-20" />
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-6 w-6" />}
        title="Failed to load"
        description={error}
      />
    )
  }

  if (!overview) return null

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Users" value={String(overview.users.total)} icon={<Users className="h-4 w-4" />} />
        <StatCard label="Total Balance" value={formatToman(overview.wallet.totalBalance)} icon={<Wallet className="h-4 w-4" />} />
        <StatCard label="Active Models" value={`${overview.models.active} / ${overview.models.total}`} icon={<Cpu className="h-4 w-4" />} />
        <StatCard label="Providers" value={String(overview.providers.total)} icon={<Server className="h-4 w-4" />} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Requests (30d)"
          value={overview.usage.requests30d.toLocaleString()}
          icon={<Activity className="h-4 w-4" />}
        />
        <StatCard label="Tokens (30d)" value={overview.usage.tokens30d.toLocaleString()} />
        <StatCard
          label="Payment Volume (30d)"
          value={formatToman(overview.payments.volume30d)}
          icon={<CreditCard className="h-4 w-4" />}
        />
        <StatCard
          label="Errors (30d)"
          value={String(overview.usage.errors30d)}
          icon={overview.usage.errors30d > 0 ? <AlertCircle className="h-4 w-4 text-destructive" /> : undefined}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Payments (30d)</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total</span>
              <span className="font-medium">{overview.payments.total}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Successful</span>
              <Badge variant="success">{overview.payments.successful}</Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Failed</span>
              <Badge variant={overview.payments.failed > 0 ? 'destructive' : 'secondary'}>
                {overview.payments.failed}
              </Badge>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Revenue</span>
              <span className="font-medium">{formatToman(overview.payments.volume30d)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Usage (30d)</h2>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Requests</span>
              <span className="font-medium">{overview.usage.requests30d.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Tokens</span>
              <span className="font-medium">{overview.usage.tokens30d.toLocaleString()}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total Cost</span>
              <span className="font-medium">{formatToman(overview.usage.cost30d)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Error Rate</span>
              <span className="font-medium">
                {overview.usage.requests30d > 0
                  ? ((overview.usage.errors30d / overview.usage.requests30d) * 100).toFixed(1)
                  : '0.0'}
                %
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
