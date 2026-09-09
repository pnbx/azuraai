'use client'

import * as React from 'react'
import { Key, Plus, Trash2, Copy, Check, AlertTriangle } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatDate, maskApiKey } from '@/lib/utils'

interface ApiKey {
  id: string
  name: string
  scope: string
  expiresAt: string | null
  lastUsedAt: string | null
  revokedAt: string | null
  createdAt: string
}

export default function ApiKeysPage() {
  const [keys, setKeys] = React.useState<ApiKey[]>([])
  const [loading, setLoading] = React.useState(true)
  const [showCreate, setShowCreate] = React.useState(false)
  const [newKeyName, setNewKeyName] = React.useState('')
  const [creating, setCreating] = React.useState(false)
  const [createdSecret, setCreatedSecret] = React.useState('')
  const [copied, setCopied] = React.useState(false)
  const [error, setError] = React.useState('')
  const [revoking, setRevoking] = React.useState<string | null>(null)

  const fetchKeys = () => {
    fetch('/api/api-keys')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setKeys(data.keys)
      })
      .finally(() => setLoading(false))
  }

  React.useEffect(() => { fetchKeys() }, [])

  const handleCreate = async () => {
    if (!newKeyName.trim()) return
    setCreating(true)
    setError('')

    try {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newKeyName.trim() }),
      })
      const data = await res.json()

      if (data.success) {
        setCreatedSecret(data.key.secret)
        setNewKeyName('')
        setShowCreate(false)
        fetchKeys()
      } else {
        setError(data.error || 'Failed to create key')
      }
    } catch {
      setError('Network error')
    } finally {
      setCreating(false)
    }
  }

  const handleRevoke = async (id: string) => {
    setRevoking(id)
    try {
      const res = await fetch(`/api/api-keys/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.success) fetchKeys()
    } finally {
      setRevoking(null)
    }
  }

  const handleCopySecret = () => {
    navigator.clipboard.writeText(createdSecret)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="API Keys"
        description="Manage your API keys for accessing AzuraAI services."
        action={
          <Button size="sm" onClick={() => { setShowCreate(true); setCreatedSecret('') }}>
            <Plus className="h-3.5 w-3.5" /> Create Key
          </Button>
        }
      />

      {/* Newly created key display */}
      {createdSecret && (
        <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-warning shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-foreground">API Key Created</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Copy this key now. For security, you won&apos;t be able to view it again.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="flex-1 rounded bg-muted px-3 py-2 text-xs font-mono break-all">
                  {createdSecret}
                </code>
                <Button size="sm" variant="outline" onClick={handleCopySecret}>
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create form */}
      {showCreate && !createdSecret && (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="text-sm font-medium text-card-foreground mb-3">Create New API Key</h3>
          {error && <p className="mb-3 text-xs text-destructive">{error}</p>}
          <div className="flex items-end gap-3">
            <div className="flex-1 max-w-xs">
              <label className="mb-1.5 block text-xs font-medium text-foreground">Key Name</label>
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder="e.g., production-server"
              />
            </div>
            <Button size="sm" onClick={handleCreate} disabled={creating || !newKeyName.trim()}>
              {creating ? 'Creating...' : 'Create'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setShowCreate(false); setError('') }}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* Keys Table */}
      {keys.length === 0 && !showCreate ? (
        <EmptyState
          icon={<Key className="h-6 w-6" />}
          title="No API keys"
          description="Create an API key to start using AzuraAI services."
          action={
            <Button size="sm" onClick={() => setShowCreate(true)}>
              <Plus className="h-3.5 w-3.5" /> Create Key
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Used</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.map((key) => (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium text-sm">{key.name}</TableCell>
                    <TableCell>
                      <code className="text-xs text-muted-foreground font-mono">
                        {maskApiKey(key.id)}
                      </code>
                    </TableCell>
                    <TableCell>
                      {key.revokedAt ? (
                        <Badge variant="destructive">Revoked</Badge>
                      ) : (
                        <Badge variant="success">Active</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {key.lastUsedAt ? formatDate(key.lastUsedAt) : 'Never'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(key.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {!key.revokedAt && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRevoke(key.id)}
                          disabled={revoking === key.id}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  )
}
