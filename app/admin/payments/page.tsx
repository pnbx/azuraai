'use client'

import * as React from 'react'
import { CreditCard, ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatToman, formatDate } from '@/lib/utils'

interface Payment {
  id: string
  userId: string
  amountToman: number
  currency: string
  provider: string
  status: string
  providerPaymentId: string | null
  failureReason: string | null
  createdAt: string
  succeededAt: string | null
  failedAt: string | null
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function AdminPaymentsPage() {
  const [payments, setPayments] = React.useState<Payment[]>([])
  const [pagination, setPagination] = React.useState<Pagination | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [status, setStatus] = React.useState('')
  const [page, setPage] = React.useState(1)

  React.useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (status) params.set('status', status)
    fetch(`/api/admin/payments?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setPayments(data.payments)
          setPagination(data.pagination)
        }
      })
      .finally(() => setLoading(false))
  }, [page, status])

  const statusBadge = (s: string) => {
    const variants: Record<string, 'success' | 'destructive' | 'warning' | 'secondary' | 'info'> = {
      succeeded: 'success',
      failed: 'destructive',
      cancelled: 'warning',
      pending: 'info',
      processing: 'info',
      created: 'secondary',
    }
    return <Badge variant={variants[s] ?? 'secondary'}>{s}</Badge>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1) }}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'created', label: 'Created' },
            { value: 'pending', label: 'Pending' },
            { value: 'processing', label: 'Processing' },
            { value: 'succeeded', label: 'Succeeded' },
            { value: 'failed', label: 'Failed' },
            { value: 'cancelled', label: 'Cancelled' },
          ]}
          className="w-40 h-8 text-sm"
        />
        {pagination && (
          <span className="text-xs text-muted-foreground">{pagination.total} payments</span>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : payments.length === 0 ? (
        <EmptyState
          icon={<CreditCard className="h-6 w-6" />}
          title="No payments"
          description="No payment intents match the current filter."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Provider</TableHead>
                <TableHead className="hidden md:table-cell">User</TableHead>
                <TableHead className="hidden sm:table-cell">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="text-sm font-medium">{formatToman(p.amountToman)}</TableCell>
                  <TableCell>{statusBadge(p.status)}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{p.provider}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    <span className="text-xs font-mono">{p.userId.slice(0, 8)}...</span>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                    {formatDate(p.createdAt)}
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
