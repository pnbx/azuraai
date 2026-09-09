'use client'

import * as React from 'react'
import { ScrollText, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDateTime } from '@/lib/utils'

interface AuditEntry {
  id: string
  actorId: string
  actorEmail: string
  action: string
  targetType: string
  targetId: string | null
  result: string
  metadata: Record<string, unknown> | null
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function AdminAuditPage() {
  const [logs, setLogs] = React.useState<AuditEntry[]>([])
  const [pagination, setPagination] = React.useState<Pagination | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [actionFilter, setActionFilter] = React.useState('')
  const [page, setPage] = React.useState(1)

  React.useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (actionFilter) params.set('action', actionFilter)
    fetch(`/api/admin/audit?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setLogs(data.logs)
          setPagination(data.pagination)
        }
      })
      .finally(() => setLoading(false))
  }, [page, actionFilter])

  const resultBadge = (r: string) => {
    const variants: Record<string, 'success' | 'destructive' | 'warning' | 'secondary'> = {
      success: 'success',
      failure: 'destructive',
      denied: 'warning',
    }
    return <Badge variant={variants[r] ?? 'secondary'}>{r}</Badge>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative max-w-xs flex-1">
          <Input
            placeholder="Filter by action..."
            value={actionFilter}
            onChange={(e) => { setActionFilter(e.target.value); setPage(1) }}
            className="h-8 text-sm"
          />
        </div>
        {pagination && (
          <span className="text-xs text-muted-foreground">{pagination.total} events</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-10" />)}
        </div>
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<ScrollText className="h-6 w-6" />}
          title="No audit events"
          description="No audit log entries match the current filter."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Target</TableHead>
                <TableHead>Result</TableHead>
                <TableHead className="hidden md:table-cell">Details</TableHead>
                <TableHead className="hidden sm:table-cell">Time</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>
                    <span className="text-sm">{l.actorEmail}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs font-mono">{l.action}</span>
                  </TableCell>
                  <TableCell>
                    <span className="text-xs">
                      {l.targetType}
                      {l.targetId && (
                        <span className="text-muted-foreground ml-1 font-mono">
                          {l.targetId.slice(0, 8)}...
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{resultBadge(l.result)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {l.metadata && Object.keys(l.metadata).length > 0 && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        {Object.entries(l.metadata)
                          .filter(([k]) => k !== 'admin_id')
                          .map(([k, v]) => `${k}=${typeof v === 'string' ? v : JSON.stringify(v)}`)
                          .join(' ')}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                    {formatDateTime(l.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage((p) => p + 1)}>
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
