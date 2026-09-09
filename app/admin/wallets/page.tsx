'use client'

import * as React from 'react'
import Link from 'next/link'
import { Wallet, ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatToman, formatDate } from '@/lib/utils'

interface WalletRow {
  id: string
  userId: string
  email: string
  balance: number
  currency: string
  updatedAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function AdminWalletsPage() {
  const [wallets, setWallets] = React.useState<WalletRow[]>([])
  const [pagination, setPagination] = React.useState<Pagination | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [page, setPage] = React.useState(1)

  React.useEffect(() => {
    fetch(`/api/admin/wallets?page=${page}&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setWallets(data.wallets)
          setPagination(data.pagination)
        }
      })
      .finally(() => setLoading(false))
  }, [page])

  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-4">
        <span className="text-xs text-muted-foreground">
          {pagination?.total ?? 0} wallets &middot; Total: {formatToman(totalBalance)}
        </span>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : wallets.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" />}
          title="No wallets"
          description="No wallets found."
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead className="hidden sm:table-cell">Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {wallets.map((w) => (
                <TableRow key={w.id}>
                  <TableCell>
                    <div className="text-sm font-medium">{w.email}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{w.userId.slice(0, 8)}...</div>
                  </TableCell>
                  <TableCell className="text-sm font-medium">{formatToman(w.balance)}</TableCell>
                  <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                    {formatDate(w.updatedAt)}
                  </TableCell>
                  <TableCell>
                    <Link href={`/admin/wallets/${w.id}`}>
                      <Button variant="outline" size="sm">View</Button>
                    </Link>
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
