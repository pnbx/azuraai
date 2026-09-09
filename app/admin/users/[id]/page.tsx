'use client'

import * as React from 'react'
import { useParams } from 'next/navigation'
import { ArrowLeft, Key, CreditCard, Activity } from 'lucide-react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatToman, formatDate, maskApiKey } from '@/lib/utils'

interface UserDetail {
  user: {
    id: string
    email: string
    fullName: string | null
    phone: string | null
    isActive: boolean
    role: string
    preferredLanguage: string
    createdAt: string
    updatedAt: string
  }
  wallet: { balance: number; currency: string }
  apiKeys: {
    total: number
    active: number
    keys: Array<{
      id: string
      name: string
      createdAt: string
      lastUsedAt: string | null
      revokedAt: string | null
    }>
  }
  payments: Array<{
    id: string
    amountToman: number
    status: string
    provider: string
    createdAt: string
  }>
  usage: {
    totalRequests: number
    totalTokens: number
    totalCost: number
    recent: Array<{
      id: string
      model: string
      inputTokens: number
      outputTokens: number
      status: string
      requestTs: string
    }>
  }
}

export default function AdminUserDetailPage() {
  const params = useParams()
  const userId = params.id as string
  const [data, setData] = React.useState<UserDetail | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    fetch(`/api/admin/users/${userId}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d)
        else setError(d.error || 'Failed to load')
      })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false))
  }, [userId])

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-48" />
        <Skeleton className="h-32" />
      </div>
    )
  }

  if (error || !data) {
    return (
      <EmptyState
        title="Error"
        description={error || 'User not found'}
      />
    )
  }

  const { user, wallet, apiKeys, payments, usage } = data

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/admin/users" className="text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div>
          <h2 className="text-sm font-semibold">{user.email}</h2>
          {user.fullName && (
            <p className="text-xs text-muted-foreground">{user.fullName}</p>
          )}
        </div>
        <Badge variant={user.role === 'admin' ? 'info' : 'secondary'}>{user.role}</Badge>
        <Badge variant={user.isActive ? 'success' : 'destructive'}>
          {user.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </div>

      {/* Account */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-xs font-semibold uppercase tracking-wider">Account</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <div><span className="text-muted-foreground">ID:</span> <span className="font-mono text-xs">{user.id}</span></div>
            <div><span className="text-muted-foreground">Phone:</span> {user.phone || '—'}</div>
            <div><span className="text-muted-foreground">Language:</span> {user.preferredLanguage}</div>
            <div><span className="text-muted-foreground">Joined:</span> {formatDate(user.createdAt)}</div>
          </div>
        </CardContent>
      </Card>

      {/* Wallet + Usage Stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Balance</div>
            <div className="text-lg font-semibold">{formatToman(wallet.balance)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">API Keys</div>
            <div className="text-lg font-semibold">{apiKeys.active} active</div>
            <div className="text-[10px] text-muted-foreground">{apiKeys.total} total</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-xs text-muted-foreground">Usage</div>
            <div className="text-lg font-semibold">{usage.totalRequests} reqs</div>
            <div className="text-[10px] text-muted-foreground">{usage.totalTokens.toLocaleString()} tokens</div>
          </CardContent>
        </Card>
      </div>

      {/* API Keys */}
      {apiKeys.keys.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <Key className="h-3.5 w-3.5" /> API Keys
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Created</TableHead>
                  <TableHead className="hidden sm:table-cell">Last Used</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apiKeys.keys.map((k) => (
                  <TableRow key={k.id}>
                    <TableCell className="text-sm font-medium">{k.name || 'Unnamed'}</TableCell>
                    <TableCell>
                      <Badge variant={k.revokedAt ? 'destructive' : 'success'}>
                        {k.revokedAt ? 'Revoked' : 'Active'}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {formatDate(k.createdAt)}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {k.lastUsedAt ? formatDate(k.lastUsedAt) : 'Never'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Payments */}
      {payments.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <CreditCard className="h-3.5 w-3.5" /> Recent Payments
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Provider</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payments.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm font-medium">{formatToman(p.amountToman)}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          p.status === 'succeeded'
                            ? 'success'
                            : p.status === 'failed'
                              ? 'destructive'
                              : 'secondary'
                        }
                      >
                        {p.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {p.provider}
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {formatDate(p.createdAt)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Recent Usage */}
      {usage.recent.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
              <Activity className="h-3.5 w-3.5" /> Recent Usage
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Model</TableHead>
                  <TableHead>Tokens</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="hidden sm:table-cell">Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usage.recent.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="text-sm font-mono">{l.model}</TableCell>
                    <TableCell className="text-xs">{(l.inputTokens + l.outputTokens).toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge variant={l.status === 'succeeded' ? 'success' : 'destructive'}>
                        {l.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                      {formatDate(l.requestTs)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
