'use client'

import * as React from 'react'
import { Cpu, Zap } from 'lucide-react'
import { PageHeader } from '@/components/dashboard/page-header'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/ui/empty-state'

interface Model {
  id: string
  publicSlug: string
  displayName: string
  capabilities: string[]
  status: string
  createdAt: string
}

export default function ModelsPage() {
  const [models, setModels] = React.useState<Model[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setModels(data.models)
      })
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="space-y-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Models"
        description="Available AI models on the AzuraAI platform."
      />

      {models.length === 0 ? (
        <EmptyState
          icon={<Cpu className="h-6 w-6" />}
          title="No models available"
          description="Models will appear here once they are enabled by the platform administrator."
        />
      ) : (
        <div className="space-y-3">
          {models.map((model) => (
            <div
              key={model.id}
              className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-medium text-card-foreground">
                    {model.displayName}
                  </h3>
                  <Badge variant={model.status === 'active' ? 'success' : 'secondary'}>
                    {model.status}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground font-mono">
                  {model.publicSlug}
                </p>
                {model.capabilities && model.capabilities.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {model.capabilities.map((cap) => (
                      <Badge key={cap} variant="outline" className="text-[10px]">
                        <Zap className="mr-1 h-2.5 w-2.5" />
                        {cap}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
