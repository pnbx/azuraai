'use client'

import * as React from 'react'
import { Cpu, AlertCircle, Save } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { formatDate } from '@/lib/utils'

interface AdminModel {
  id: string
  azuraModelId: string
  publicSlug: string
  displayName: string
  providerName: string
  providerModelId: string
  capabilities: unknown
  enabled: boolean
  status: string
  createdAt: string
}

export default function AdminModelsPage() {
  const [models, setModels] = React.useState<AdminModel[]>([])
  const [loading, setLoading] = React.useState(true)
  const [saving, setSaving] = React.useState<string | null>(null)

  const loadModels = React.useCallback(() => {
    fetch('/api/admin/models')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setModels(data.models)
      })
      .finally(() => setLoading(false))
  }, [])

  React.useEffect(() => { loadModels() }, [loadModels])

  const toggleModel = async (modelId: string, enabled: boolean) => {
    setSaving(modelId)
    try {
      const res = await fetch('/api/admin/models', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, enabled }),
      })
      const data = await res.json()
      if (data.success) {
        setModels((prev) =>
          prev.map((m) => (m.id === modelId ? { ...m, enabled } : m))
        )
      }
    } finally {
      setSaving(null)
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12" />)}
      </div>
    )
  }

  if (models.length === 0) {
    return (
      <EmptyState
        icon={<Cpu className="h-6 w-6" />}
        title="No models"
        description="No models in the catalog."
      />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{models.length} models</span>
      </div>

      <div className="rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Model</TableHead>
              <TableHead>Provider</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="hidden sm:table-cell">Created</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {models.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="text-sm font-medium">{m.displayName}</div>
                  <div className="text-[10px] font-mono text-muted-foreground">{m.publicSlug}</div>
                </TableCell>
                <TableCell className="text-sm">{m.providerName}</TableCell>
                <TableCell>
                  <Badge
                    variant={
                      m.status === 'active'
                        ? 'success'
                        : m.status === 'deprecated'
                          ? 'warning'
                          : 'destructive'
                    }
                  >
                    {m.status}
                  </Badge>
                </TableCell>
                <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                  {formatDate(m.createdAt)}
                </TableCell>
                <TableCell>
                  <Button
                    variant={m.enabled ? 'destructive' : 'default'}
                    size="sm"
                    disabled={saving === m.id}
                    onClick={() => toggleModel(m.id, !m.enabled)}
                  >
                    {saving === m.id ? 'Saving...' : m.enabled ? 'Disable' : 'Enable'}
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
