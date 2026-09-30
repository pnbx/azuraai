"use strict";

/**
 * App Free Chat — Streaming SSE Route
 *
 * POST /api/app/chat
 *
 * Streaming chat for the Azura mobile app, powered by the OpenRouter free
 * model pool. Auth: Supabase session (app users are logged-in site users).
 *
 * Enforcement:
 * - Per-user daily message cap (atomic RPC, default 30/day)
 * - Pool-wide failover: on 429/5xx the request transparently retries with
 *   the next healthy OpenRouter key (cooldowns handled by the pool)
 *
 * SSE event types:
 *   { type: "reasoning", delta }   — chain-of-thought tokens
 *   { type: "content",   delta }   — assistant answer tokens
 *   { type: "status",    message } — key failover notices
 *   { type: "meta", model, content, reasoning } — final frame
 *   { type: "error",  code, message }           — terminal error frame
 *
 * Security:
 * - OpenRouter keys stay server-side, selected via the atomic pool RPC
 * - Message contents are never logged
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { supabaseAdmin } from '@/supabase/admin'
import { withPoolFailover, defaultIsRetryable } from '@/lib/gateway/keyPool'
import {
  streamChatCompletion,
  OpenRouterError,
  type ChatMessage,
} from '@/lib/gateway/openrouterClient'

export const runtime = 'nodejs'
export const maxDuration = 60

/** Free models: fast chat vs heavy reasoning. */
const MODEL_FAST = process.env.OPENROUTER_MODEL_FAST || 'openrouter/free'
const MODEL_THINKING =
  process.env.OPENROUTER_MODEL_THINKING || 'openrouter/free'
const DAILY_CAP = Number(process.env.APP_CHAT_DAILY_CAP || 30)
const MAX_POOL_ATTEMPTS = 4

const SYSTEM_PROMPT =
  'You are Azura, a helpful AI assistant for the AzuraAI app. ' +
  'Be concise, friendly, and accurate. The audience is Iranian users — ' +
  'respond in the language the user writes in (Persian or English).'

interface ChatRequestBody {
  messages?: Array<{ role: 'user' | 'assistant'; content: string }>
  mode?: 'fast' | 'thinking'
}

function sseFrame(obj: unknown): string {
  return `data: ${JSON.stringify(obj)}\n\n`
}

function errorFrame(code: string, message: string): string {
  return sseFrame({ type: 'error', code, message })
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

  // App-client marker (informational; auth is session-based)
  const client = req.headers.get('x-azura-client')
  if (client && client !== 'app' && client !== 'web') {
    return NextResponse.json(
      { success: false, error: 'invalid_client' },
      { status: 400 }
    )
  }

  // ─── Body validation ─────────────────────────────────────────────────────
  let body: ChatRequestBody
  try {
    body = (await req.json()) as ChatRequestBody
  } catch {
    return NextResponse.json(
      { success: false, error: 'invalid_json' },
      { status: 400 }
    )
  }

  const rawMessages = Array.isArray(body.messages) ? body.messages : []
  if (rawMessages.length === 0 || rawMessages.length > 40) {
    return NextResponse.json(
      { success: false, error: 'messages_required_1_to_40' },
      { status: 400 }
    )
  }
  for (const m of rawMessages) {
    if (
      !m ||
      typeof m.content !== 'string' ||
      m.content.length === 0 ||
      m.content.length > 16_000
    ) {
      return NextResponse.json(
        { success: false, error: 'invalid_message' },
        { status: 400 }
      )
    }
  }

  const mode = body.mode === 'thinking' ? 'thinking' : 'fast'
  const model = mode === 'thinking' ? MODEL_THINKING : MODEL_FAST

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    ...rawMessages.map((m) => ({
      role: m.role === 'assistant' ? ('assistant' as const) : ('user' as const),
      content: m.content,
    })),
  ]

  // ─── Per-user daily cap (atomic) ─────────────────────────────────────────
  const { data: capData, error: capError } = await supabaseAdmin.rpc(
    'increment_app_chat_usage',
    { p_user_id: user.id, p_daily_cap: DAILY_CAP }
  )
  const capRow = Array.isArray(capData) ? capData[0] : capData
  if (capError) {
    // Degrade gracefully: if usage tracking is unavailable (e.g. migration not
    // applied yet), allow the request and log loudly instead of 500-ing.
    console.error('[AppChat] usage RPC failed (allowing request):', capError.message)
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

  // ─── Stream via pool with failover ───────────────────────────────────────
  const encoder = new TextEncoder()
  const requestId = crypto.randomUUID()

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false
      const send = (frame: string) => {
        if (!closed) controller.enqueue(encoder.encode(frame))
      }

      try {
        const outcome = await withPoolFailover(
          async (key) =>
            streamChatCompletion(
              {
                apiKey: key.apiKey,
                model,
                messages,
                temperature: mode === 'thinking' ? 0.6 : 0.8,
                maxTokens: mode === 'thinking' ? 4096 : 2048,
                signal: req.signal,
              },
              {
                onContent: (delta) => send(sseFrame({ type: 'content', delta })),
                onReasoning: (delta) => send(sseFrame({ type: 'reasoning', delta })),
              }
            ),
          (err) => {
            const retryable = defaultIsRetryable(err)
            if (retryable) {
              send(
                sseFrame({
                  type: 'status',
                  message: 'switching_model_key',
                })
              )
            }
            return retryable
          },
          MAX_POOL_ATTEMPTS
        )

        if ('result' in outcome) {
          send(
            sseFrame({
              type: 'meta',
              model: outcome.result.model,
              content: outcome.result.content,
              reasoning: outcome.result.reasoning,
            })
          )
        } else {
          const detail =
            outcome.error instanceof OpenRouterError
              ? outcome.error.message
              : 'pool_exhausted'
          send(errorFrame('pool_exhausted', detail))
        }
      } catch (err) {
        // Non-retryable provider error (e.g. invalid_request) or network abort
        if (err instanceof OpenRouterError) {
          send(errorFrame(err.type, err.message))
        } else if (err instanceof Error && err.name === 'AbortError') {
          // Client disconnected — nothing to send
        } else {
          console.error('[AppChat] stream failed:', err)
          send(errorFrame('internal_error', 'stream_failed'))
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
      'X-Request-Id': requestId,
    },
  })
}
