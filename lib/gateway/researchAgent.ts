"use strict";

/**
 * Research Agent
 *
 * Staged pipeline for "research mode" in the app chat:
 *   1. plan      — model generates 2–3 diverse search queries
 *   2. search    — Tavily API fetches sources (free tier, server-side key)
 *   3. read      — top snippets are trimmed into a source context
 *   4. synthesize— streamed answer grounded in the sources
 *
 * Stage progress is reported via callbacks so the route can emit SSE
 * events and the UI can animate a live progress rail.
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
  signal?: AbortSignal
}

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'

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

async function searchWeb(
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
): Promise<{ sources: ResearchSource[]; content: string }> {
  const queries = await planQueries(opts, events)

  let sources: ResearchSource[] = []
  if (opts.tavilyApiKey) {
    events.onStage('search')
    const batches = await Promise.all(
      queries.map((q) => searchWeb(q, opts.tavilyApiKey as string, opts.signal))
    )
    // Dedup by URL, keep best 6
    const seen = new Set<string>()
    sources = batches.flat().filter((s) => {
      if (seen.has(s.url)) return false
      seen.add(s.url)
      return true
    }).slice(0, 6)
    events.onSources(sources)
  }

  events.onStage('read')
  // "Read" is the trim step above; brief yield so the UI renders the stage.
  await new Promise((r) => setTimeout(r, 150))

  events.onStage('synthesize')
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        'You are Azura in research mode. Answer the user question using the ' +
        'provided web sources. Cite sources inline as [1], [2] etc. If the ' +
        'sources are insufficient, say so. Respond in the language of the question.',
    },
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
              `No web search was available. Answer from your own knowledge, ` +
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

  return { sources, content: result.content }
}
