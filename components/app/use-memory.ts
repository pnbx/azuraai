'use client'

/**
 * useMemory — client side of Azura Memory.
 *
 * Memories are mirrored in localStorage so the settings panel renders
 * instantly and works offline; the source of truth is the server. When
 * memory is disabled (opt-out) the client never sends `remember` and the
 * server never reads or writes memories. The mirror is kept but ignored.
 */

import { useCallback, useSyncExternalStore } from 'react'

export interface MemoryItem {
  id: number
  content: string
  source: string
  createdAt: string
}

const CACHE_KEY = 'azura-memory-cache-v1'
const OPTOUT_KEY = 'azura-memory-optout'

// ─── Tiny external store (localStorage mirror) ──────────────────────────────

let cache: MemoryItem[] | null = null
const listeners = new Set<() => void>()

function readLocal(): MemoryItem[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function emit() {
  listeners.forEach((l) => l())
}

function setCache(next: MemoryItem[]) {
  cache = next
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(next.slice(0, 200)))
  } catch {
    /* private mode — keep memory state */
  }
  emit()
}

function subscribeMemory(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): MemoryItem[] {
  if (cache === null) cache = readLocal()
  return cache
}

function getServerSnapshot(): MemoryItem[] {
  return []
}

export function isMemoryOptedOut(): boolean {
  if (typeof window === 'undefined') return false
  return localStorage.getItem(OPTOUT_KEY) === '1'
}

export function setMemoryOptOut(v: boolean) {
  try {
    if (v) localStorage.setItem(OPTOUT_KEY, '1')
    else localStorage.removeItem(OPTOUT_KEY)
  } catch {
    /* private mode */
  }
  optOutVersion += 1
  emit()
}

let optOutVersion = 0

function getOptOutVersion(): number {
  return optOutVersion
}

/** One-way sync from the server; merges nothing, replaces the mirror. */
async function refreshFromServer(): Promise<void> {
  try {
    const res = await fetch('/api/app/memory', { headers: { 'x-azura-client': 'app' } })
    if (!res.ok) return
    const data = (await res.json()) as {
      memories?: Array<{ id: number; content: string; source?: string; created_at?: string }>
    }
    if (!Array.isArray(data.memories)) return
    setCache(
      data.memories.map((m) => ({
        id: Number(m.id),
        content: String(m.content),
        source: String(m.source ?? 'auto'),
        createdAt: String(m.created_at ?? ''),
      }))
    )
  } catch {
    /* offline — keep mirror */
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useMemory() {
  const memories = useSyncExternalStore(subscribeMemory, getSnapshot, getServerSnapshot)
  // optOut is env state, not server state — use a version counter so the
  // settings toggle re-renders every reader when it flips.
  const optOut = useSyncExternalStore(
    subscribeMemory,
    getOptOutVersion,
    () => 0
  )
  void optOut

  const refresh = useCallback(async () => {
    await refreshFromServer()
  }, [])

  const forget = useCallback(async (id: number) => {
    setCache(getSnapshot().filter((m) => m.id !== id))
    try {
      await fetch(`/api/app/memory?id=${id}`, {
        method: 'DELETE',
        headers: { 'x-azura-client': 'app' },
      })
    } catch {
      /* optimistic */
    }
  }, [])

  const forgetAll = useCallback(async () => {
    setCache([])
    try {
      await fetch('/api/app/memory?all=1', {
        method: 'DELETE',
        headers: { 'x-azura-client': 'app' },
      })
    } catch {
      /* optimistic */
    }
  }, [])

  const add = useCallback(async (content: string): Promise<boolean> => {
    const trimmed = content.trim()
    if (trimmed.length < 3 || trimmed.length > 500) return false
    const res = await fetch('/api/app/memory', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-azura-client': 'app' },
      body: JSON.stringify({ content: trimmed }),
    })
    if (!res.ok) return false
    const data = (await res.json().catch(() => ({}))) as {
      memory?: { id: number; content: string; source: string; created_at: string }
    }
    if (data.memory) {
      setCache([
        {
          id: Number(data.memory.id),
          content: String(data.memory.content),
          source: String(data.memory.source ?? 'manual'),
          createdAt: String(data.memory.created_at ?? ''),
        },
        ...getSnapshot(),
      ])
    }
    return true
  }, [])

  return { memories, refresh, forget, forgetAll, add, optedOut: isMemoryOptedOut(), setOptOut: setMemoryOptOut }
}

/** Convenience for non-UI callers. */
export function readMemoryState(): { items: MemoryItem[]; optedOut: boolean } {
  return { items: getSnapshot(), optedOut: isMemoryOptedOut() }
}
