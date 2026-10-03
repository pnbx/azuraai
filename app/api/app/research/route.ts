"use strict";

/**
 * App Research — Streaming SSE Route
 *
 * POST /api/app/research
 *
 * Runs the staged research agent (plan → search → read → synthesize) with
 * live progress streaming. Shares auth + pool failover with /api/app/chat.
 *
 * SSE event types:
 *   { type: "stage", stage }                 — plan|search|read|synthesize
 *   { type: "sources", sources }             — found web sources
 *   { type: "reasoning", delta }             — chain-of-thought tokens
 *   { type: "content", delta }               — answer tokens
 *   { type: "meta", content, sources }       — final frame
 *   { type: "error", code, message }         — terminal error frame
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { supabaseAdmin } from '@/supabase/admin'
import { withPoolFailover, defaultIsRetryable } from '@/lib/gateway/keyPool'
import { OpenRouterError } from '@/lib/gateway/openrouterClient'
import { runResearch } from '@/lib/gateway/researchAgent'
import { renderMemoryBlock, type UserMemory } from '@/lib/gateway/memory'
import { normalizePersianMarkdown } from '@/lib/persian-text'

export const runtime = 'nodejs'
export const maxDuration = 120

/**
 * Research planner/synthesiser model.
 *
 * This used to fall back to `openrouter/free`, which picks a *random* free
 * model per request. In production that meant the query planner occasionally
 * ran on a model bad enough to invent its own search topic — a question about
 * continents came back with eight Wikipedia pages about "safety", and the
 * answer then refused because its own sources were irrelevant.
 *
 * Same precedence as the chat route, so both share one pinned, benchmarked
 * model.
 */
const MODEL_RESEARCH =
  process.env.OPENROUTER_MODEL_RESEARCH ||
  process.env.OPENROUTER_MODEL_FAST ||
  'poolside/laguna-s-2.1:free'
const DAILY_CAP = Number(process.env.APP_CHAT_DAILY_CAP || 30)

interface ResearchBody {
  question?: string
  /** Conversation context for memory extraction grounding. */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  /** Client toggle: allow reading + auto-extracting long-term memories. */
  remember?: boolean
}

function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

export async function POST(req: NextRequest) {
  // ─── Auth (optional) ──────────────────────────────────────────────────────
  // Same model as /api/app/chat: no account required, a session only unlocks
  // memory. Every user-scoped branch below is guarded by `user`.
  const user = await getServerUser().catch(() => null)

  // ─── Body ────────────────────────────────────────────────────────────────
  let body: ResearchBody
  try {
    body = (await req.json()) as ResearchBody
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_json' },
      { status: 400 }
    )
  }

  const question = typeof body.question === 'string' ? body.question.trim() : ''
  if (question.length === 0 || question.length > 2000) {
    return NextResponse.json(
      { success: false, error: 'question_required_max_2000' },
      { status: 400 }
    )
  }

  // ─── Daily cap (shared with chat, signed-in users only) ──────────────────
  if (user) {
    const { data: capData, error: capError } = await supabaseAdmin.rpc(
      'increment_app_chat_usage',
      { p_user_id: user.id, p_daily_cap: DAILY_CAP }
    )
    const capRow = Array.isArray(capData) ? capData[0] : capData
    if (capError) {
      // Degrade gracefully when usage tracking is unavailable (see chat route).
      console.error('[AppResearch] usage RPC failed (allowing request):', capError.message)
    } else if (!capRow?.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: 'daily_cap_reached',
          used: capRow?.used ?? DAILY_CAP,
          cap: capRow?.cap ?? DAILY_CAP,
        },
        { status: 429 }
      )
    }
  }

  // ─── Memory: load durable facts for the system prompt ──────────────────
  const remember = body.remember === true && user !== null
  let memoryBlock = ''
  let memoriesForExtraction: UserMemory[] = []
  if (remember) {
    try {
      const { data, error } = await supabaseAdmin
        .from('user_memory')
        .select('id, content, source, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true })
      if (error) throw error
      memoriesForExtraction = (data ?? []) as UserMemory[]
      memoryBlock = renderMemoryBlock(memoriesForExtraction)
    } catch (err) {
      console.error('[AppResearch] memory load failed (continuing without):', err)
    }
  }
  const history = Array.isArray(body.history) ? body.history.slice(-12) : []

  // ─── Stream the research pipeline ────────────────────────────────────────
  const encoder = new TextEncoder()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (frame: string) => {
        if (!closed) controller.enqueue(encoder.encode(frame))
      }

      try {
        const outcome = await withPoolFailover(
          async (key) =>
            runResearch(
              {
                apiKey: key.apiKey,
                tavilyApiKey: process.env.TAVILY_API_KEY || undefined,
                model: MODEL_RESEARCH,
                userQuestion: question,
                systemExtra: memoryBlock || undefined,
                history: history.map((m) => ({
                  role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
                  content: m.content.slice(0, 2000),
                })),
                signal: req.signal,
              },
              {
                onStage: (stage) => send(sseFrame({ type: 'stage', stage })),
                onSources: (sources) => send(sseFrame({ type: 'sources', sources })),
                onContent: (delta) => send(sseFrame({ type: 'content', delta })),
                onReasoning: (delta) => send(sseFrame({ type: 'reasoning', delta })),
              }
            ),
          (err) => {
            const retryable = defaultIsRetryable(err)
            if (retryable) {
              send(sseFrame({ type: 'stage', stage: 'plan' }))
            }
            return retryable
          },
          3
        )

        if ('result' in outcome) {
          send(
            sseFrame({
              type: 'meta',
              // Same typography pass as /api/app/chat, and for the same reason:
              // applied on the authoritative final frame, never mid-stream.
              content: normalizePersianMarkdown(outcome.result.content),
              reasoning: outcome.result.reasoning,
              sources: outcome.result.sources,
            })
          )
          // ─── Memory extraction (fire-and-forget, never blocks) ─────────
          if (remember && user && memoriesForExtraction.length < 100) {
            void extractAndStoreMemories({
              userId: user.id,
              apiKey: outcome.key.apiKey,
              existing: memoriesForExtraction,
              recentMessages:
                history.length > 0
                  ? history
                  : [{ role: 'user', content: question }],
            }).catch((err) =>
              console.error('[AppResearch] memory extraction failed:', err)
            )
          }
        } else {
          send(
            sseFrame({
              type: 'error',
              code: 'pool_exhausted',
              message:
                outcome.error instanceof OpenRouterError
                  ? outcome.error.message
                  : 'all keys exhausted',
            })
          )
        }
      } catch (err) {
        if (err instanceof OpenRouterError) {
          send(sseFrame({ type: 'error', code: err.type, message: err.message }))
        } else if (err instanceof Error && err.name === 'AbortError') {
          // client disconnected
        } else {
          console.error('[AppResearch] failed:', err)
          send(sseFrame({ type: 'error', code: 'internal_error', message: 'research_failed' }))
        }
      } finally {
        closed = true
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

// ─── Memory: background extraction + storage ────────────────────────────────

/** Same fire-and-forget pipeline as the chat route. */
async function extractAndStoreMemories(opts: {
  userId: string
  apiKey: string
  existing: UserMemory[]
  recentMessages: Array<{ role: 'user' | 'assistant'; content: string }>
}): Promise<void> {
  const { extractMemories, dedupeMemories } = await import('@/lib/gateway/memory')
  const extracted = await extractMemories({
    apiKey: opts.apiKey,
    model: process.env.OPENROUTER_MODEL_FAST || 'openrouter/free',
    recentMessages: opts.recentMessages,
  })
  if (extracted.length === 0) return

  const fresh = dedupeMemories(opts.existing, extracted)
  if (fresh.length === 0) return

  const rows = fresh.map((content) => ({
    user_id: opts.userId,
    content,
    source: 'auto',
  }))

  const { error } = await supabaseAdmin.from('user_memory').insert(rows)
  if (error) throw new Error(error.message)
}
