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

export const runtime = 'nodejs'
export const maxDuration = 120

const MODEL_RESEARCH =
  process.env.OPENROUTER_MODEL_RESEARCH || 'deepseek/deepseek-chat-v3-0324:free'
const DAILY_CAP = Number(process.env.APP_CHAT_DAILY_CAP || 30)

interface ResearchBody {
  question?: string
}

function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

export async function POST(req: NextRequest) {
  // ─── Auth ────────────────────────────────────────────────────────────────
  let user
  try {
    user = await getServerUser()
  } catch {
    return NextResponse.json(
      { success: false, error: 'unauthenticated' },
      { status: 401 }
    )
  }

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

  // ─── Daily cap (shared with chat) ────────────────────────────────────────
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
              content: outcome.result.content,
              sources: outcome.result.sources,
            })
          )
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
