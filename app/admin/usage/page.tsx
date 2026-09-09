'use client'

import * as React from 'react'
import { BarChart3, AlertCircle } from 'lucide-react'
import { Select } from '@/components/ui/select'
import { StatCard } from '@/components/dashboard/stat-card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatToman } from '@/lib/utils'

interface UsageData {
  days: number
  totalRequests: number
  totalInputTokens: number
  totalOutputTokens: number
  totalTokens: number
  totalCost: number
  errorCount: number
  byModel: Array<{ model: string; requests: number; tokens: number; cost: number }>
  byUser: Array<{ userId: string; requests: number; tokens: number; cost: number }>
  byDay: Array<{ date: string; requests: number; tokens: number; cost: number }>
}

export default function AdminUsagePage() {
  const [usage, setUsage] = React.useState<UsageData | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [days, setDays] = React.useState('30')

  React.useEffect(() => {
    fetch(`/api/admin/usage?days=${days}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setUsage(data.usage)
      })
      .finally(() => setLoading(false))
  }, [days])

  if (loading && !usage) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
        <Skeleton className="h-48" />
      </div>
    )
  }

  if (!usage) return null

  const maxDailyTokens = Math.max(...usage.byDay.map((d) => d.tokens), 1)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Platform usage for the last {days} days</span>
        <Select
          value={days}
          onChange={(e) => setDays(e.target.value)}
          options={[
            { value: '7', label: 'Last 7 days' },
            { value: '14', label: 'Last 14 days' },
            { value: '30', label: 'Last 30 days' },
            { value: '90', label: 'Last 90 days' },
          ]}
          className="w-36 h-8 text-sm"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Requests" value={usage.totalRequests.toLocaleString()} />
        <StatCard label="Tokens" value={usage.totalTokens.toLocaleString()} />
        <StatCard label="Cost" value={formatToman(usage.totalCost)} />
        <StatCard
          label="Errors"
          value={String(usage.errorCount)}
          icon={usage.errorCount > 0 ? <AlertCircle className="h-4 w-4 text-destructive" /> : undefined}
        />
      </div>

      {/* Daily chart */}
      {usage.byDay.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Daily Token Usage
          </h2>
          <div className="flex items-end gap-px" style={{ height: '80px' }}>
            {usage.byDay.map((d) => (
              <div key={d.date} className="group relative flex-1">
                <div
                  className="w-full rounded-t bg-primary/20 transition-colors hover:bg-primary/30"
                  style={{ height: `${(d.tokens / maxDailyTokens) * 100}%`, minHeight: '2px' }}
                />
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-1.5 py-0.5 text-[9px] text-background opacity-0 transition-opacity group-hover:opacity-100 pointer-events-none">
                  {d.tokens.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-1 flex justify-between text-[9px] text-muted-foreground">
            <span>{usage.byDay[0]?.date}</span>
            <span>{usage.byDay[usage.byDay.length - 1]?.date}</span>
          </div>
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        {/* By Model */}
        {usage.byModel.length > 0 && (
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">By Model</h2>
            </div>
            <div className="divide-y divide-border">
              {usage.byModel.slice(0, 10).map((m) => (
                <div key={m.model} className="flex items-center justify-between px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{m.model}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {m.requests} requests &middot; {m.tokens.toLocaleString()} tokens
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{formatToman(m.cost)}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* By User */}
        {usage.byUser.length > 0 && (
          <div className="rounded-lg border border-border bg-card">
            <div className="border-b border-border px-4 py-2">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">By User</h2>
            </div>
            <div className="divide-y divide-border">
              {usage.byUser.slice(0, 10).map((u) => (
                <div key={u.userId} className="flex items-center justify-between px-4 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-mono truncate">{u.userId.slice(0, 8)}...</p>
                    <p className="text-[10px] text-muted-foreground">
                      {u.requests} requests &middot; {u.tokens.toLocaleString()} tokens
                    </p>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">{formatToman(u.cost)}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {usage.totalRequests === 0 && (
        <EmptyState
          icon={<BarChart3 className="h-6 w-6" />}
          title="No usage data"
          description="No API requests recorded in this period."
        />
      )}
    </div>
  )
}
