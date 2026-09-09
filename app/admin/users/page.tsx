'use client'

import * as React from 'react'
import Link from 'next/link'
import { Users, Search, ChevronLeft, ChevronRight } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatToman, formatDate } from '@/lib/utils'

interface AdminUser {
  id: string
  email: string
  fullName: string | null
  isActive: boolean
  role: string
  balance: number
  createdAt: string
}

interface Pagination {
  page: number
  limit: number
  total: number
  totalPages: number
}

export default function AdminUsersPage() {
  const [users, setUsers] = React.useState<AdminUser[]>([])
  const [pagination, setPagination] = React.useState<Pagination | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [search, setSearch] = React.useState('')
  const [page, setPage] = React.useState(1)

  React.useEffect(() => {
    const params = new URLSearchParams({ page: String(page), limit: '20' })
    if (search) params.set('search', search)
    fetch(`/api/admin/users?${params}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setUsers(data.users)
          setPagination(data.pagination)
        }
      })
      .finally(() => setLoading(false))
  }, [page, search])

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search by email or name..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1) }}
            className="pl-8 h-8 text-sm"
          />
        </div>
        {pagination && (
          <span className="text-xs text-muted-foreground">{pagination.total} users</span>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={<Users className="h-6 w-6" />}
          title="No users found"
          description={search ? 'Try a different search term.' : 'No users registered yet.'}
        />
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Balance</TableHead>
                <TableHead className="hidden sm:table-cell">Status</TableHead>
                <TableHead className="hidden md:table-cell">Joined</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id}>
                  <TableCell>
                    <Link href={`/admin/users/${u.id}`} className="hover:underline">
                      <div className="text-sm font-medium">{u.email}</div>
                      {u.fullName && (
                        <div className="text-xs text-muted-foreground">{u.fullName}</div>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant={u.role === 'admin' ? 'info' : 'secondary'}>{u.role}</Badge>
                  </TableCell>
                  <TableCell className="text-sm">{formatToman(u.balance)}</TableCell>
                  <TableCell className="hidden sm:table-cell">
                    <Badge variant={u.isActive ? 'success' : 'destructive'}>
                      {u.isActive ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {formatDate(u.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">
            Page {pagination.page} of {pagination.totalPages}
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
