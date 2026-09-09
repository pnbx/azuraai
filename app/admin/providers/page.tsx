'use client'

import * as React from 'react'
import { Server } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'

interface AdminProvider {
  id: string
  name: string
  baseUrl: string
  apiVersion: string | null
  authMethod: string | null
  registryId: string | null
  enabledModels: number
  createdAt: string
}

export default function AdminProvidersPage() {
  const [providers, setProviders] = React.useState<AdminProvider[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetch('/api/admin/providers')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setProviders(data.providers)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12" />)}
      </div>
    )
  }

  if (providers.length === 0) {
    return (
      <EmptyState
        icon={<Server className="h-6 w-6" />}
        title="No providers"
        description="No providers configured."
      />
    )
  }

  return (
    <div className="space-y-4">
      <span className="text-xs text-muted-foreground">{providers.length} providers</span>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Provider</TableHead>
              <TableHead>Registry ID</TableHead>
              <TableHead className="hidden sm:table-cell">Auth Method</TableHead>
              <TableHead>Models</TableHead>
              <TableHead className="hidden sm:table-cell">Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {providers.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <div className="text-sm font-medium">{p.name}</div>
                  <div className="text-[10px] font-mono text-muted-foreground truncate max-w-[200px]">
                    {p.baseUrl}
                  </div>
                </TableCell>
                <TableCell className="text-xs font-mono">{p.registryId ?? '—'}</TableCell>
                <TableCell className="hidden sm:table-cell">
                  <Badge variant="secondary">{p.authMethod ?? 'Unknown'}</Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="info">{p.enabledModels} enabled</Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                  {formatDate(p.createdAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
