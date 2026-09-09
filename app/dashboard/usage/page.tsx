'use client'

import * as React from 'react'
import { BarChart3, AlertCircle } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header'
import { StatCard } from '@/components/dashboard/stat-card'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/empty-state'
import { Select } from '@/components/ui/select'

interface UsageStats {
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalCost: number
  errorCount: number
  avgLatency: number
}

interface DailyUsage {
  date: string
  requests: number
  tokens: number
  cost: number
}

interface ModelUsage {
  model: string
  requests: number
  tokens: number
  cost: number
}

export default function UsagePage() {
  const [stats, setStats] = React.useState<UsageStats | null>(null)
  const [daily, setDaily] = React.useState<DailyUsage[]>([])
  const [byModel, setByModel] = React.useState<ModelUsage[]>([])
  const [loading, setLoading] = React.useState(true)
  const [days, setDays] = React.useState('30')

  React.useEffect(() => {
    const controller = new AbortController()
    fetch(`/api/usage?days=${days}`, { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setStats(data.stats)
          setDaily(data.daily)
          setByModel(data.byModel)
        }
      })
      .finally(() => setLoading(false))
    return () => controller.abort()
  }, [days])

  if (loading && !stats) {
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

  const maxDailyTokens = Math.max(...daily.map((d) => d.tokens), 1)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Usage"
        description="Monitor your API usage and costs."
        action={
          <Select
            value={days}
            onChange={(e) => setDays(e.target.value)}
            options={[
              { value: '7', label: 'Last 7 days' },
              { value: '14', label: 'Last 14 days' },
              { value: '30', label: 'Last 30 days' },
              { value: '90', label: 'Last 90 days' },
            ]}
            className="w-40"
          />
        }
      />

      {stats && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total Requests" value={String(stats.totalRequests)} />
          <StatCard label="Total Tokens" value={stats.totalTokens.toLocaleString()} />
          <StatCard label="Avg Latency" value={`${stats.avgLatency}ms`} />
          <StatCard
            label="Errors"
            value={String(stats.errorCount)}
            icon={stats.errorCount > 0 ? <AlertCircle className="h-4 w-4 text-destructive" /> : undefined}
          />
        </div>
      )}

      {/* Token Usage Chart (simple bar visualization) */}
      {daily.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold text-card-foreground">Daily Token Usage</h2>
          <div className="flex items-end gap-1" style={{ height: '120px' }}>
            {daily.map((d) => (
              <div key={d.date} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-primary/20 transition-colors hover:bg-primary/30"
                  style={{ height: `${(d.tokens / maxDailyTokens) * 100}%`, minHeight: '2px' }}
                />
                <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-[10px] text-background opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
                  {d.tokens.toLocaleString()} tokens
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
            <span>{daily[0]?.date}</span>
            <span>{daily[daily.length - 1]?.date}</span>
          </div>
        </div>
      )}

      {/* Model Breakdown */}
      {byModel.length > 0 && (
        <div className="rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="text-sm font-semibold text-card-foreground">By Model</h2>
          </div>
          <div className="divide-y divide-border">
            {byModel.map((m) => (
              <div key={m.model} className="flex items-center justify-between px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-card-foreground truncate">{m.model}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.requests} requests &middot; {m.tokens.toLocaleString()} tokens
                  </p>
                </div>
                <Badge variant="secondary">{m.cost.toLocaleString()} TOMAN</Badge>
              </div>
            ))}
          </div>
        </div>
      )}

      {!loading && stats && stats.totalRequests === 0 && (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="No usage data yet"
          description="Start making API requests to see your usage statistics here."
        />
      )}
    </div>
  )
}
