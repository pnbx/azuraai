'use client'

import * as React from 'react'
import { Play, Loader2, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { PageHeader } from '@/components/dashboard/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface Model {
  id: string
  publicSlug: string
  displayName: string
  capabilities: string[]
}

export default function PlaygroundPage() {
  const [models, setModels] = React.useState<Model[]>([])
  const [selectedModel, setSelectedModel] = React.useState('')
  const [systemPrompt, setSystemPrompt] = React.useState('')
  const [prompt, setPrompt] = React.useState('')
  const [response, setResponse] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [modelsLoading, setModelsLoading] = React.useState(true)
  const [error, setError] = React.useState('')
  const [copied, setCopied] = React.useState(false)
  const [meta, setMeta] = React.useState<{ tokens?: number; latency?: number } | null>(null)

  React.useEffect(() => {
    fetch('/api/models')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) setModels(data.models)
      })
      .finally(() => setModelsLoading(false))
  }, [])

  const handleRun = async () => {
    if (!selectedModel || !prompt.trim()) return
    setLoading(true)
    setError('')
    setResponse('')
    setMeta(null)

    const startTime = Date.now()

    try {
      const input = systemPrompt
        ? [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }]
        : [{ role: 'user', content: prompt }]

      const res = await fetch('/api/inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: selectedModel,
          operation: 'chat',
          input,
        }),
      })

      const data = await res.json()
      const latency = Date.now() - startTime

      if (!res.ok) {
        setError(data.error || 'Request failed')
        return
      }

      if (data.success && data.result) {
        const content = Array.isArray(data.result.content)
          ? data.result.content.map((c: { text?: string }) => c.text || '').join('')
          : data.result.content || ''
        setResponse(typeof content === 'string' ? content : JSON.stringify(content, null, 2))
        setMeta({
          tokens: data.result.metadata?.usage?.total_tokens,
          latency,
        })
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleCopy = () => {
    navigator.clipboard.writeText(response)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Playground" description="Test models with a simple prompt interface." />

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Input */}
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Model</label>
            {modelsLoading ? (
              <Skeleton className="h-9 w-full" />
            ) : (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 pr-8 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="">Select a model</option>
                {models.map((m) => (
                  <option key={m.publicSlug} value={m.publicSlug}>
                    {m.displayName}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">
              System Instructions <span className="text-muted-foreground">(optional)</span>
            </label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="You are a helpful assistant..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-medium text-foreground">Prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt..."
              rows={6}
              className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
          </div>

          <Button
            onClick={handleRun}
            disabled={loading || !selectedModel || !prompt.trim()}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="h-4 w-4" />
                Run
              </>
            )}
          </Button>
        </div>

        {/* Response */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle>Response</CardTitle>
                {response && (
                  <Button variant="ghost" size="sm" onClick={handleCopy}>
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading && (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </div>
              )}
              {!loading && error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
              {!loading && !error && !response && (
                <p className="text-sm text-muted-foreground">
                  Response will appear here after you run a prompt.
                </p>
              )}
              {!loading && response && (
                <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed">
                  {response}
                </pre>
              )}
            </CardContent>
          </Card>

          {/* Usage meta */}
          {meta && (
            <div className="flex gap-3">
              {meta.tokens != null && (
                <Badge variant="secondary">{meta.tokens} tokens</Badge>
              )}
              {meta.latency != null && (
                <Badge variant="secondary">{meta.latency}ms</Badge>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
