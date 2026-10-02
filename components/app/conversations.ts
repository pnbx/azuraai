'use client'

/**
 * Conversation store for the app chat — ChatGPT-style history drawer.
 *
 * Conversations live in localStorage (privacy-first: nothing leaves the
 * device unless the user sends a message). Exposed to React through
 * useSyncExternalStore so hydration is mismatch-free and every mutation
 * (auto-save, rename, pin, delete) notifies all subscribers.
 *
 * Auto-titles come from the first user message; the drawer groups by
 * recency the way ChatGPT/Grok organize their sidebars.
 */

export type ChatMode = 'fast' | 'thinking' | 'research'

export interface ChatMsg {
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  sources?: Array<{ title: string; url: string; snippet: string }>
  stages?: string[]
  failed?: boolean
  demo?: boolean
  ts?: number
  /**
   * Image attachments as data URLs (downscaled on the client). Only ever set
   * on user messages — they render as thumbnails and are sent to the model
   * as multimodal parts.
   */
  images?: string[]
}

export interface Conversation {
  id: string
  title: string
  messages: ChatMsg[]
  mode: ChatMode
  pinned: boolean
  createdAt: number
  updatedAt: number
}

const STORAGE_KEY = 'azura-conversations-v1'
const MAX_CONVERSATIONS = 200

/** Attachments allowed in a single outgoing message (mirrors the API cap). */
export const MAX_IMAGES_PER_MESSAGE = 4
/**
 * Images are ~60-90 KB each as data URLs, and localStorage caps out around
 * 5 MB. We only keep attachments on the most recent exchanges and strip the
 * rest on save, so long conversations never silently fail to persist.
 */
const KEEP_IMAGES_ON_LAST = 2

/**
 * Returns a storage-safe copy of a message list: keeps image data only on the
 * final {@link KEEP_IMAGES_ON_LAST} messages that have any, dropping the rest.
 * Pure — the caller's messages are never mutated.
 */
export function compactForStorage(messages: ChatMsg[]): ChatMsg[] {
  const keepFrom = (() => {
    let seen = 0
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].images?.length) {
        seen++
        if (seen === KEEP_IMAGES_ON_LAST) return i
      }
    }
    return Number.POSITIVE_INFINITY
  })()

  return messages.map((m, i) => {
    if (!m.images || m.images.length === 0) return m
    if (i >= keepFrom) return m
    const stripped: ChatMsg = { ...m }
    delete stripped.images
    return stripped
  })
}

// ─── Tiny external store around localStorage ────────────────────────────────

let cache: Conversation[] | null = null
const listeners = new Set<() => void>()

function readStorage(): Conversation[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function getList(): Conversation[] {
  if (cache === null) cache = readStorage()
  return cache
}

function setList(next: Conversation[]) {
  cache = next.slice(0, MAX_CONVERSATIONS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cache))
  } catch {
    // storage full / private mode — keep memory state, drop persistence
  }
  listeners.forEach((l) => l())
}

export function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

// ─── Mutations ───────────────────────────────────────────────────────────────

export function conversationActions() {
  return {
    upsert(conv: Conversation) {
      const list = getList()
      const idx = list.findIndex((c) => c.id === conv.id)
      const next =
        idx === -1 ? [conv, ...list] : list.map((c) => (c.id === conv.id ? conv : c))
      setList(next)
    },
    remove(id: string) {
      setList(getList().filter((c) => c.id !== id))
    },
    togglePin(id: string) {
      setList(getList().map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)))
    },
    rename(id: string, title: string) {
      setList(getList().map((c) => (c.id === id ? { ...c, title } : c)))
    },
  }
}

export const conversationsStore = conversationActions()

export function newConversation(mode: ChatMode = 'fast'): Conversation {
  const now = Date.now()
  return {
    id: `c_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    title: 'New chat',
    messages: [],
    mode,
    pinned: false,
    createdAt: now,
    updatedAt: now,
  }
}

export function autoTitle(messages: ChatMsg[]): string {
  const firstUser = messages.find((m) => m.role === 'user')?.content ?? ''
  const clean = firstUser.replace(/\s+/g, ' ').trim()
  if (!clean) return 'New chat'
  return clean.length > 42 ? clean.slice(0, 42).trimEnd() + '…' : clean
}

/** ChatGPT-style recency buckets for the drawer. */
export function groupByRecency(
  conversations: Conversation[]
): Array<{ label: string; items: Conversation[] }> {
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const startOfYesterday = startOfToday - 24 * 60 * 60 * 1000
  const weekAgo = startOfToday - 6 * 24 * 60 * 60 * 1000
  const monthAgo = startOfToday - 29 * 24 * 60 * 60 * 1000

  // Keys are stable ids; the drawer maps them to localized labels via
  // groupLabelKey(), so switching language does not need a regroup.
  const groups: Record<string, Conversation[]> = {
    pinned: [],
    today: [],
    yesterday: [],
    week: [],
    month: [],
    older: [],
  }

  for (const c of conversations) {
    if (c.pinned) groups.pinned.push(c)
    else if (c.updatedAt >= startOfToday) groups.today.push(c)
    else if (c.updatedAt >= startOfYesterday) groups.yesterday.push(c)
    else if (c.updatedAt >= weekAgo) groups.week.push(c)
    else if (c.updatedAt >= monthAgo) groups.month.push(c)
    else groups.older.push(c)
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({
      label,
      items: items.sort((a, b) => b.updatedAt - a.updatedAt),
    }))
}
