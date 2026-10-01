'use client'

/**
 * useAppChatStream
 *
 * Client hook for the app chat: POSTs to the SSE endpoints and emits
 * primitive stream events. The caller owns message state and appends
 * deltas itself; the final `meta` frame lets it reconcile any dropped
 * deltas with the server-authoritative content.
 */

import { useCallback, useRef, useState } from 'react'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  sources?: Array<{ title: string; url: string; snippet: string }>
  stages?: string[]
  failed?: boolean
  demo?: boolean
}

export type ChatMode = 'fast' | 'thinking' | 'research'
export type StreamState = 'idle' | 'connecting' | 'streaming' | 'error'

export interface SendOptions {
  /** Opt-in to server-side long-term memory (read + auto-extract). */
  remember?: boolean
}

export interface StreamHandlers {
  onContent: (delta: string, demo?: boolean) => void
  onReasoning: (delta: string, demo?: boolean) => void
  onStage: (stage: string, demo?: boolean) => void
  onSources: (sources: NonNullable<ChatMsg['sources']>, demo?: boolean) => void
  onMeta: (
    final: { content: string; reasoning?: string; sources?: ChatMsg['sources'] },
    demo?: boolean
  ) => void
}

export function useAppChatStream() {
  const [state, setState] = useState<StreamState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [capInfo, setCapInfo] = useState<{ used: number; cap: number } | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setState('idle')
  }, [])

  const dismissError = useCallback(() => {
    setErrorMsg(null)
    setState((s) => (s === 'error' ? 'idle' : s))
  }, [])

  const send = useCallback(
    async (
      history: ChatMsg[],
      mode: ChatMode,
      handlers: StreamHandlers,
      options?: SendOptions
    ): Promise<void> => {
      const controller = new AbortController()
      abortRef.current = controller
      setState('connecting')
      setErrorMsg(null)

      const question =
        [...history].reverse().find((m) => m.role === 'user')?.content ?? ''

      const endpoint = mode === 'research' ? '/api/app/research' : '/api/app/chat'
      const body =
        mode === 'research'
          ? {
              question,
              remember: options?.remember === true,
              history: history
                .slice(-12)
                .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
            }
          : {
              mode: mode === 'thinking' ? 'thinking' : 'fast',
              remember: options?.remember === true,
              messages: history.map((m) => ({ role: m.role, content: m.content })),
            }

      try {
        let res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-azura-client': 'app' },
          body: JSON.stringify(body),
          signal: controller.signal,
        })

        // Auth unavailable (backend down / not logged in) OR the pool can't
        // reach the upstream (e.g. geo-blocked network)? Fall back to the
        // demo stream so the UI can always be previewed.
        const shouldDemo = res.status === 401 || res.status === 503
        if (shouldDemo) {
          setDemoMode(true)
          const demoUrl =
            mode === 'research'
              ? '/api/app/demo?mode=research'
              : '/api/app/demo?mode=chat'
          res = await fetch(demoUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
            signal: controller.signal,
          })
        }

        if (!res.ok || !res.body) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string
            used?: number
            cap?: number
          }
          if (data.error === 'daily_cap_reached') {
            setCapInfo({ used: data.used ?? 0, cap: data.cap ?? 0 })
            setErrorMsg(
              `Daily free limit reached (${data.used}/${data.cap}). Resets at midnight UTC.`
            )
          } else {
            setErrorMsg(data.error ?? `request_failed (${res.status})`)
          }
          setState('error')
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let sawRealContent = false
        let poolExhausted = false

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })

          let idx: number
          while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, idx)
            buffer = buffer.slice(idx + 2)
            const line = frame.split('\n').find((l) => l.startsWith('data:'))
            if (!line) continue

            let evt: Record<string, unknown>
            try {
              evt = JSON.parse(line.slice(5).trim())
            } catch {
              continue
            }

            const isDemo = evt.demo === true
            if (isDemo) setDemoMode(true)

            switch (evt.type) {
              case 'content':
                sawRealContent = true
                setState('streaming')
                handlers.onContent(String(evt.delta ?? ''), isDemo)
                break
              case 'reasoning':
                sawRealContent = true
                setState('streaming')
                handlers.onReasoning(String(evt.delta ?? ''), isDemo)
                break
              case 'stage':
                handlers.onStage(String(evt.stage ?? ''), isDemo)
                break
              case 'sources':
                handlers.onSources((evt.sources as ChatMsg['sources']) ?? [], isDemo)
                break
              case 'status':
                handlers.onStage('retry', isDemo)
                break
              case 'meta':
                sawRealContent = true
                handlers.onMeta(
                  {
                    content: String(evt.content ?? ''),
                    reasoning:
                      evt.reasoning !== undefined ? String(evt.reasoning ?? '') : undefined,
                    sources: evt.sources as ChatMsg['sources'] | undefined,
                  },
                  isDemo
                )
                break
              case 'error':
                if (evt.code === 'pool_exhausted') {
                  poolExhausted = true
                } else {
                  setErrorMsg(String(evt.message ?? evt.code ?? 'stream_error'))
                  setState('error')
                }
                break
            }
          }
        }

        // Pool couldn't reach upstream (e.g. geo-blocked network)? Swap to
        // demo mode so the experience still completes.
        if (poolExhausted && !sawRealContent) {
          setDemoMode(true)
          const demoUrl =
            mode === 'research'
              ? '/api/app/demo?mode=research'
              : '/api/app/demo?mode=chat'
          await runDemo(demoUrl, handlers, controller.signal)
          return
        }

        setState((s) => (s === 'error' ? 'error' : 'idle'))
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') {
          setState('idle')
        } else {
          setErrorMsg('network_error')
          setState('error')
        }
      } finally {
        abortRef.current = null
      }
    },
    []
  )

  return { send, cancel, dismissError, state, errorMsg, capInfo, demoMode }
}

/** Shared demo-stream runner (used by both fallback paths). */
async function runDemo(
  demoUrl: string,
  handlers: StreamHandlers,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(demoUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
    signal,
  })
  if (!res.ok || !res.body) return

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let idx: number
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const frame = buffer.slice(0, idx)
      buffer = buffer.slice(idx + 2)
      const line = frame.split('\n').find((l) => l.startsWith('data:'))
      if (!line) continue

      let evt: Record<string, unknown>
      try {
        evt = JSON.parse(line.slice(5).trim())
      } catch {
        continue
      }

      switch (evt.type) {
        case 'content':
          handlers.onContent(String(evt.delta ?? ''), true)
          break
        case 'reasoning':
          handlers.onReasoning(String(evt.delta ?? ''), true)
          break
        case 'stage':
          handlers.onStage(String(evt.stage ?? ''), true)
          break
        case 'sources':
          handlers.onSources((evt.sources as ChatMsg['sources']) ?? [], true)
          break
        case 'meta':
          handlers.onMeta(
            {
              content: String(evt.content ?? ''),
              reasoning:
                evt.reasoning !== undefined ? String(evt.reasoning ?? '') : undefined,
              sources: evt.sources as ChatMsg['sources'] | undefined,
            },
            true
          )
          break
      }
    }
  }
}
