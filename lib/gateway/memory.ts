"use strict";

/**
 * Azura Memory — long-term user memory extracted from conversations.
 *
 * Server-side helpers:
 *  - extractMemories(): asks the model to surface durable facts/preferences
 *    from a finished conversation, as strict JSON.
 *  - dedupeMemories(): near-identical filtering (case/punct-insensitive).
 *  - renderMemoryBlock(): compact system-prompt block, newest-first cap.
 *
 * Storage: `user_memory` table (see supabase/migrations/20261001000000_user_memory.sql).
 */

import { streamChatCompletion } from './openrouterClient'

export interface UserMemory {
  id?: number
  content: string
  source?: string
  createdAt?: string
}

const EXTRACT_SYSTEM = `You extract long-term memories about the user from chat conversations.
Return ONLY a JSON array of short, self-contained third-person statements (max 20 words each) — each a durable fact or preference worth remembering across conversations.
Include: name, occupation, language, tech stack, likes/dislikes, goals, recurring topics, personal context the user shared.
Exclude: one-off questions, small talk, transient stuff, anything about the assistant.
Return [] when nothing qualifies. No markdown fences, no commentary — JSON array only.`

export async function extractMemories(opts: {
  apiKey: string
  model: string
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
  signal?: AbortSignal
}): Promise<string[]> {
  const transcript = opts.recentMessages
    .slice(-12)
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content.slice(0, 800)}`)
    .join('\n')

  const result = await streamChatCompletion(
    {
      apiKey: opts.apiKey,
      model: opts.model,
      messages: [
        { role: 'system', content: EXTRACT_SYSTEM },
        { role: 'user', content: transcript || '(empty conversation)' },
      ],
      maxTokens: 500,
      temperature: 0,
      signal: opts.signal,
    },
    { onContent: () => {}, onReasoning: () => {} }
  )

  try {
    const jsonText = result.content
      .replace(/^```(?:json)?/i, '')
      .replace(/```\s*$/, '')
      .trim()
    const parsed: unknown = JSON.parse(jsonText)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((m): m is string => typeof m === 'string')
      .map((m) => m.trim())
      .filter((m) => m.length >= 3 && m.length <= 300)
      .slice(0, 5)
  } catch {
    return []
  }
}

/** Dedupe near-identical memories (case/punctuation-insensitive). */
export function dedupeMemories(existing: UserMemory[], incoming: string[]): string[] {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
  const seen = new Set(existing.map((m) => norm(m.content)))
  const fresh: string[] = []
  for (const m of incoming) {
    const key = norm(m)
    if (!key || seen.has(key)) continue
    seen.add(key)
    fresh.push(m)
  }
  return fresh
}

const MEMORY_CAP = 100

/** Build the system-prompt block. Newest last in DB → show newest first. */
export function renderMemoryBlock(memories: UserMemory[]): string {
  if (memories.length === 0) return ''
  const items = memories
    .slice(-MEMORY_CAP)
    .map((m) => `- ${m.content}`)
    .join('\n')
  return (
    'Long-term memory about this user (from previous conversations):\n' +
    items +
    '\nUse it naturally when relevant; never recite it back verbatim.'
  )
}
