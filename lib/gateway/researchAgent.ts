"use strict";

/**
 * Research Agent
 *
 * Staged pipeline for "research mode" in the app chat:
 *   1. plan       — model generates 2–3 diverse search queries
 *   2. search     — Tavily (server key) OR free Wikipedia REST fallback
 *   3. read       — top snippets are trimmed into a source context
 *   4. synthesize — streamed answer grounded in the sources
 *
 * Search ALWAYS runs: when no Tavily key is configured (or Tavily fails),
 * the pipeline falls back to Wikipedia's free search API — Persian queries
 * hit fa.wikipedia.org, everything else en.wikipedia.org. The user always
 * gets real source cards, never a silently-degraded "no search" answer.
 *
 * Stage progress is reported via callbacks so the route can emit SSE
 * events and the UI can animate a live progress rail. Short guaranteed
 * pacing keeps each stage visible instead of flashing by in one frame.
 */

import { streamChatCompletion, type ChatMessage } from './openrouterClient'

export type ResearchStage = 'plan' | 'search' | 'read' | 'synthesize'

export interface ResearchSource {
  title: string
  url: string
  snippet: string
}

export interface ResearchEvents {
  onStage: (stage: ResearchStage) => void
  onSources: (sources: ResearchSource[]) => void
  onContent: (delta: string) => void
  onReasoning: (delta: string) => void
}

export interface ResearchOptions {
  apiKey: string
  tavilyApiKey?: string
  model: string
  userQuestion: string
  /** Extra system-prompt text (e.g. long-term memory block). */
  systemExtra?: string
  /** Conversation history for context-aware synthesis. */
  history?: ChatMessage[]
  signal?: AbortSignal
}

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'

/** Persian/Arabic script detection for choosing the Wikipedia edition. */
const RTL_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

/** Minimum time a stage stays active, so the UI rail is perceivable. */
function pace(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve()
    const t = setTimeout(resolve, ms)
    signal?.addEventListener('abort', () => {
      clearTimeout(t)
      resolve()
    }, { once: true })
  })
}

// ─── Stage 1: plan queries ───────────────────────────────────────────────────

async function planQueries(
  opts: ResearchOptions,
  events: ResearchEvents
): Promise<string[]> {
  events.onStage('plan')

  const result = await streamChatCompletion(
    {
      apiKey: opts.apiKey,
      model: opts.model,
      maxTokens: 300,
      temperature: 0.4,
      signal: opts.signal,
      messages: [
        {
          role: 'system',
          content:
            'You generate web search queries. Given a user question, output ' +
            'exactly 2 diverse search queries, one per line, no numbering, ' +
            'no quotes, no explanation. Respond in the language of the question.',
        },
        { role: 'user', content: opts.userQuestion },
      ],
    },
    { onContent: () => {}, onReasoning: () => {} }
  )

  const queries = result.content
    .split('\n')
    .map((l) => l.replace(/^[-*\d.\s"'`]+/, '').trim())
    .filter((l) => l.length > 2)
    .slice(0, 3)

  return queries.length > 0 ? queries : [opts.userQuestion]
}

// ─── Stage 2: search ─────────────────────────────────────────────────────────

async function searchTavily(
  query: string,
  tavilyApiKey: string,
  signal?: AbortSignal
): Promise<ResearchSource[]> {
  const res = await fetch(TAVILY_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: tavilyApiKey,
      query,
      max_results: 3,
      search_depth: 'basic',
    }),
    signal,
  })
  if (!res.ok) return []

  const data = (await res.json()) as {
    results?: Array<{ title?: string; url?: string; content?: string }>
  }

  return (data.results ?? [])
    .filter((r) => r.url && r.title)
    .map((r) => ({
      title: String(r.title),
      url: String(r.url),
      snippet: String(r.content ?? '').slice(0, 600),
    }))
}

/**
 * Free Wikipedia search fallback — no API key, generous CORS/UA policy.
 * Persian/Arabic queries search fa.wikipedia.org; others en.wikipedia.org.
 */
async function searchWikipedia(
  query: string,
  signal?: AbortSignal
): Promise<ResearchSource[]> {
  const lang = RTL_RE.test(query) ? 'fa' : 'en'
  const endpoint =
    `https://${lang}.wikipedia.org/w/rest.php/v1/search/page?q=` +
    `${encodeURIComponent(query)}&limit=3`

  try {
    const res = await fetch(endpoint, {
      headers: { 'User-Agent': 'AzuraAI/1.0 (research fallback)' },
      signal,
    })
    if (!res.ok) return []

    const data = (await res.json()) as {
      pages?: Array<{
        title?: string
        key?: string
        excerpt?: string
        description?: string
      }>
    }

    return (data.pages ?? [])
      .filter((p) => p.title && p.key)
      .map((p) => ({
        title: String(p.title),
        url: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(String(p.key))}`,
        // Strip the <span class="searchmatch"> markers Wikipedia injects.
        snippet: String(p.excerpt ?? p.description ?? '')
          .replace(/<[^>]+>/g, '')
          .slice(0, 600),
      }))
  } catch {
    return []
  }
}

async function searchAll(
  queries: string[],
  opts: ResearchOptions,
  events: ResearchEvents
): Promise<ResearchSource[]> {
  events.onStage('search')

  const batches = await Promise.all(
    queries.map(async (q) => {
      if (opts.tavilyApiKey) {
        const tav = await searchTavily(q, opts.tavilyApiKey, opts.signal)
        if (tav.length > 0) return tav
      }
      return searchWikipedia(q, opts.signal)
    })
  )

  // Dedup by URL, keep best 6
  const seen = new Set<string>()
  const sources = batches
    .flat()
    .filter((s) => {
      if (!s.url || seen.has(s.url)) return false
      seen.add(s.url)
      return true
    })
    .slice(0, 6)

  events.onSources(sources)
  return sources
}

// ─── Stage 3: read / trim context ────────────────────────────────────────────

function buildSourceContext(sources: ResearchSource[]): string {
  return sources
    .map((s, i) => `[${i + 1}] ${s.title}\nURL: ${s.url}\n${s.snippet}`)
    .join('\n\n')
}

// ─── Pipeline ────────────────────────────────────────────────────────────────

/**
 * Run the full research pipeline for one user question.
 * Throws upstream errors unchanged (pool failover handles them).
 */
export async function runResearch(
  opts: ResearchOptions,
  events: ResearchEvents
): Promise<{ sources: ResearchSource[]; content: string; reasoning?: string }> {
  const queries = await planQueries(opts, events)
  await pace(250, opts.signal)

  const sources = await searchAll(queries, opts, events)
  await pace(250, opts.signal)

  events.onStage('read')
  // "Read" is the trim step above; keep the stage visible.
  await pace(350, opts.signal)

  events.onStage('synthesize')
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are Azura in research mode. Answer the user question using the ' +
        'provided web sources. Cite sources inline as [1], [2] etc. If the ' +
        'sources are insufficient, say so. Respond in the language of the question.' +
        (opts.systemExtra ? `\n\n${opts.systemExtra}` : ''),
    },
    ...(opts.history ?? []),
    ...(sources.length > 0
      ? ([
          {
            role: 'user' as const,
            content:
              `Web sources:\n\n${buildSourceContext(sources)}\n\nQuestion: ${opts.userQuestion}`,
          },
        ] satisfies ChatMessage[])
      : [
          {
            role: 'user' as const,
            content:
              `No web sources could be fetched. Answer from your own knowledge, ` +
              `noting that you could not verify with live sources. Question: ${opts.userQuestion}`,
          },
        ]),
  ]

  const result = await streamChatCompletion(
    {
      apiKey: opts.apiKey,
      model: opts.model,
      messages,
      maxTokens: 3000,
      temperature: 0.5,
      signal: opts.signal,
    },
    { onContent: events.onContent, onReasoning: events.onReasoning }
  )

  return { sources, content: result.content, reasoning: result.reasoning }
}
