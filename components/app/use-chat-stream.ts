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
import { getDeviceId } from '@/lib/device-id'
import type { ChatMsg, StreamTimings } from './conversations'

/**
 * Re-exported so callers can keep importing the message shape from whichever
 * module they already use.
 *
 * This file previously declared its *own* `ChatMsg` while conversations.ts
 * declared a second, subtly different one — the stream could add a field that
 * the renderer and the persistence layer had never heard of, and the only
 * symptom would be a type error in whichever file happened to be checked
 * first. One shape, defined once.
 */
export type { ChatMsg, StreamTimings }

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
    final: {
      content: string
      reasoning?: string
      sources?: ChatMsg['sources']
      timings?: StreamTimings
    },
    demo?: boolean
  ) => void
}

export function useAppChatStream() {
  const [state, setState] = useState<StreamState>('idle')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [capInfo, setCapInfo] = useState<{ used: number; cap: number } | null>(null)
  const [demoMode, setDemoMode] = useState(false)
  /**
   * Client-side clock for the live "0:07" counter. Starts when the request
   * goes out and is cleared when it ends; the frozen badge afterwards uses
   * the server's `timings` instead, because this clock is only trustworthy
   * while the screen is actually on.
   */
  const [startedAt, setStartedAt] = useState<number | null>(null)
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
      setStartedAt(Date.now())
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
              messages: history.map((m) => ({
                role: m.role,
                content: m.content,
                ...(m.images && m.images.length > 0 ? { images: m.images } : {}),
              })),
            }

      try {
        let res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-azura-client': 'app',
            // Stable anonymous id so the server can meter the free daily
            // allowance. The app has no accounts, so without this the quota
            // has nothing to count. Hashes it; never stored raw.
            'x-azura-device': getDeviceId(),
          },
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
                // 'vision_fallback' means the multimodal model was unavailable
                // and the answer came from text alone — surface it honestly.
                handlers.onStage(
                  evt.message === 'vision_fallback' ? 'vision_fallback' : 'retry',
                  isDemo
                )
                break
              case 'meta':
                sawRealContent = true
                handlers.onMeta(
                    {
                      content: String(evt.content ?? ''),
                      reasoning:
                        evt.reasoning !== undefined ? String(evt.reasoning ?? '') : undefined,
                      sources: evt.sources as ChatMsg['sources'] | undefined,
                      timings: parseTimings(evt.timings),
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
        setStartedAt(null)
      }
    },
    []
  )

  return { send, cancel, dismissError, state, errorMsg, capInfo, demoMode, startedAt }
}

/**
 * Validate the server's timing block before it reaches the UI.
 *
 * The frame is parsed out of a network stream, so every field is untrusted: a
 * missing, malformed or negative number has to degrade to "no timing" rather
 * than render "NaN ثانیه" in the middle of a finished answer.
 */
function parseTimings(raw: unknown): StreamTimings | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const t = raw as Record<string, unknown>

  const isMs = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v) && v >= 0

  if (!isMs(t.totalMs)) return undefined
  const totalMs = t.totalMs
  const firstTokenMs = isMs(t.firstTokenMs) ? t.firstTokenMs : null
  const attempts =
    isMs(t.attempts) && t.attempts >= 1 ? Math.floor(t.attempts) : undefined

  let stages: Record<string, number> | undefined
  if (typeof t.stages === 'object' && t.stages !== null && !Array.isArray(t.stages)) {
    const kept: Record<string, number> = {}
    for (const [stage, at] of Object.entries(t.stages as Record<string, unknown>)) {
      if (isMs(at)) kept[stage] = at
    }
    if (Object.keys(kept).length > 0) stages = kept
  }

  return {
    totalMs,
    firstTokenMs,
    ...(attempts !== undefined ? { attempts } : {}),
    ...(stages !== undefined ? { stages } : {}),
  }
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
              timings: parseTimings(evt.timings),
            },
            true
          )
          break
      }
    }
  }
}
