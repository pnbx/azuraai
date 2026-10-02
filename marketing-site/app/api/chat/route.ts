/**
 * Azura Chat API — real streaming inference for the chat UI.
 *
 * Pipeline (reuses the platform's own enforcement libs):
 *   1. Session auth (requireServerUser)
 *   2. Resolve model from model_catalog (public_slug)
 *   3. Resolve pricing
 *   4. Per-user rate limit
 *   5. Reserve funds (if pricing exists)
 *   6. Stream from AvalAI (OpenAI-compatible SSE)
 *   7. Settle reservation + record usage
 *   8. Persist messages (unless temporary chat) — best effort
 *
 * Errors never leak provider details to the client.
 */

import { requireServerUser } from "@/lib/auth/server";
import { resolveModel } from "@/lib/provider/model-catalog";
import { checkUserRateLimit } from "@/lib/security/user-rate-limit";
import { settleReservation, releaseReservation } from "@/lib/security/reservation";
import {
  consumeChatQuota,
  reconcileChatUsage,
  refundChatQuota,
  estimateInputTokens,
  getActiveSubscription,
  type QuotaConsumeResult,
} from "@/lib/subscriptions";
import { PLAN_LABEL_FA, type PlanId } from "@/lib/plans-config";
import { isCheapModel } from "@/lib/tiers";
import { getFreeUsage } from "@/lib/free-usage";
import {
  resolvePricing,
  estimateReservationCost,
  calculateActualCost,
  recordUsage,
  extractTokenUsage,
} from "@/lib/security/usage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/supabase/admin";
import { createHash, randomUUID } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const RATE_LIMIT_PERIOD = 60;
const DEFAULT_RPM = 20;

// ─── helpers ─────────────────────────────────────────────────

function sseError(message: string, status: number, extra?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ error: true, message, status, ...(extra ?? {}) }),
    { status, headers: { "Content-Type": "application/json" } }
  );
}

/** Generate a client-friendly key id without exposing the hash. */
function maskId(id: string) {
  return createHash("sha256").update(id).digest("hex").slice(0, 8);
}

async function ensureUserRow(userId: string, email: string) {
  // users row is created by DB trigger usually; fall back best-effort
  await supabaseAdmin.from("users").upsert({ id: userId, email });
}

async function ensureBalanceRow(userId: string) {
  const { data } = await supabaseAdmin
    .from("balances")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) {
    await supabaseAdmin.from("balances").insert({ user_id: userId, balance_cents: 0, currency: "USD" });
  }
}

async function loadMemories(userId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("user_memories")
    .select("content")
    .eq("user_id", userId)
    .limit(50);
  return (data ?? []).map((r) => r.content as string);
}

async function persistUserMessage(
  conversationId: string,
  content: string,
  attachments: unknown[]
) {
  const supa = await createSupabaseServerClient();
  await supa.from("messages").insert({
    conversation_id: conversationId,
    role: "user",
    content,
    attachments,
  });
}

async function persistAssistantMessage(
  conversationId: string,
  content: string,
  model: string,
  tokens: { inputTokens: number; outputTokens: number },
  costCents: number
) {
  const supa = await createSupabaseServerClient();
  await supa.from("messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content,
    model,
    input_tokens: tokens.inputTokens,
    output_tokens: tokens.outputTokens,
    cost_cents: costCents,
  });
}

// ─── POST ────────────────────────────────────────────────────

export async function POST(request: Request): Promise<Response> {
  const startTime = Date.now();
  const requestId = randomUUID();

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return sseError("درخواست نامعتبر است.", 400);
  }

  const modelSlug = typeof body.model === "string" ? body.model.trim() : "";
  const messagesInput = Array.isArray(body.messages) ? body.messages : [];
  const conversationId = typeof body.conversationId === "string" ? body.conversationId : null;
  const temporary = body.temporary === true;
  const webSearch = body.webSearch === true;
  const temperature = typeof body.temperature === "number" ? body.temperature : undefined;

  if (!modelSlug) return sseError("انتخاب مدل الزامی است.", 400);
  if (messagesInput.length === 0) return sseError("پیام خالی است.", 400);

  // ── 1. Auth ────────────────────────────────────────────────
  let user;
  try {
    user = await requireServerUser();
  } catch {
    return sseError("برای چت ابتدا وارد حساب خود شوید.", 401);
  }
  const userId = user.id;
  await ensureUserRow(userId, user.email ?? "");
  await ensureBalanceRow(userId);

  // ── 2. Resolve model ───────────────────────────────────────
  let resolved;
  try {
    resolved = await resolveModel(modelSlug);
  } catch {
    return sseError("مدل انتخابی در دسترس نیست.", 403);
  }

  // ── 2b. Subscription enforcement (fully server-side) ───────
  // Active subscription → plan/model/limit checks run inside an atomic RPC
  // (row-locked, concurrency-safe). No subscription → legacy free tier.
  // The client is never trusted for plan, model access, or token counts.
  const estIn = estimateInputTokens(
    messagesInput.map((m) => ({ content: typeof m?.content === "string" ? m.content : "" }))
  );
  let activeQuota: QuotaConsumeResult | null = null;
  let rpm = DEFAULT_RPM;

  const refundQuota = () =>
    activeQuota?.usageRowId
      ? refundChatQuota({
          usageRowId: activeQuota.usageRowId,
          slug: modelSlug,
          reservedInput: activeQuota.reservedInput ?? 0,
          reservedOutput: activeQuota.reservedOutput ?? 0,
          wasPremium: activeQuota.isPremium ?? false,
        })
      : Promise.resolve();

  const sub = await getActiveSubscription(userId);
  if (sub) {
    const q = await consumeChatQuota({
      userId,
      slug: modelSlug,
      estInputTokens: estIn,
      // RPC clamps the reservation to the plan's per-request cap and
      // remaining monthly budget; actuals are reconciled after the stream.
      estMaxOutput: 4096,
    });
    if (!q.allowed) {
      switch (q.code) {
        case "MODEL_PLAN_REQUIRED": {
          const rp = (q.requiredPlan ?? "scale") as PlanId;
          return sseError(
            `این مدل در پلن فعلی شما فعال نیست. برای دسترسی، پلن «${PLAN_LABEL_FA[rp] ?? rp}» لازم است.`,
            403,
            { code: "MODEL_PLAN_REQUIRED", requiredPlan: q.requiredPlan }
          );
        }
        case "CONTEXT_TOO_LARGE":
          return sseError(
            `طول گفتگو بیش از حد مجاز پلن شماست (حداکثر ${(q.maxContext ?? 0).toLocaleString("fa-IR")} توکن).`,
            400,
            { code: q.code, maxContext: q.maxContext }
          );
        case "MESSAGE_LIMIT":
          return sseError("سهمیه پیام‌های این دوره اشتراک شما تمام شد.", 429, { code: q.code });
        case "INPUT_TOKEN_LIMIT":
        case "OUTPUT_TOKEN_LIMIT":
          return sseError("سهمیه توکن‌های این دوره اشتراک شما تمام شده است.", 429, { code: q.code });
        case "PREMIUM_ALLOWANCE_EXCEEDED":
          return sseError(
            `سهمیه ماهانه این مدل پریمیوم تمام شد (${(q.used ?? 0).toLocaleString("fa-IR")} از ${(q.limit ?? 0).toLocaleString("fa-IR")}).`,
            429,
            { code: q.code }
          );
        default:
          return sseError("خطا در بررسی اشتراک. دوباره تلاش کنید.", 500, { code: q.code });
      }
    }
    activeQuota = q;
    rpm = q.rpm ?? DEFAULT_RPM;
  } else {
    // Free tier fallback: cheap models only + monthly message cap.
    if (!isCheapModel(modelSlug)) {
      return sseError(
        "این مدل پریمیوم است. برای دسترسی به مدل‌های قوی‌تر، اشتراک تهیه کنید یا حساب خود را ارتقا دهید.",
        403,
        { code: "MODEL_PLAN_REQUIRED", requiredPlan: "basic" }
      );
    }
    const free = await getFreeUsage(userId);
    if (free.remaining <= 0) {
      return sseError(
        `سهمیه ${free.limit.toLocaleString("fa-IR")} پیام رایگان این ماه تمام شد. ماه بعد دوباره سر بزنید یا اشتراک تهیه کنید.`,
        429
      );
    }
  }

  // ── 3. Pricing ─────────────────────────────────────────────
  const pricing = await resolvePricing(resolved.model.id);

  // ── 4. Rate limit (plan-aware requests/minute) ─────────────
  const rl = await checkUserRateLimit(userId, RATE_LIMIT_PERIOD, rpm);
  if (!rl.allowed) {
    await refundQuota();
    return sseError("تعداد درخواست‌ها زیاد است؛ چند لحظه بعد تلاش کنید.", 429);
  }

  // ── 5. Reserve funds ───────────────────────────────────────
  // Platform convention (matches /api/inference): wallet reservation only
  // applies to API-key auth. Session chat runs on free tier — usage is still
  // metered and priced for reporting, but no wallet debit.
  const reservationId: string | null = null;

  // ── 6. Build upstream request ──────────────────────────────
  type ChatMsg = { role: string; content: string };
  const upstreamMessages: ChatMsg[] = [];

  const memories = temporary ? [] : await loadMemories(userId);
  if (memories.length > 0) {
    upstreamMessages.push({
      role: "system",
      content: `اطلاعات یادآوری شده درباره کاربر:\n- ${memories.join("\n- ")}`,
    });
  }

  if (webSearch) {
    upstreamMessages.push({
      role: "system",
      content:
        "اگر پاسخ به اطلاعات به‌روز نیاز دارد، آن را با ذکر منبع (نام سایت) ارائه بده. در غیر این صورت عادی پاسخ بده.",
    });
  }

  for (const m of messagesInput) {
    if (
      m &&
      typeof m === "object" &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.length > 0 &&
      m.content.length <= 32_000
    ) {
      upstreamMessages.push({ role: m.role, content: m.content });
    }
  }

  const baseUrl = (process.env.AVALAI_BASE_URL || "https://api.avalai.ir/v1").replace(/\/+$/, "");
  const apiKey = process.env.AVALAI_API_KEY;
  if (!apiKey) {
    await refundQuota();
    if (reservationId) await releaseReservation(reservationId);
    return sseError("سرویس هوش مصنوعی موقتاً در دسترس نیست.", 502);
  }

  // ── 7. Stream from AvalAI ──────────────────────────────────
  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: resolved.model.provider_model_id,
        messages: upstreamMessages,
        stream: true,
        stream_options: { include_usage: true },
        ...(temperature !== undefined ? { temperature } : {}),
      }),
      signal: request.signal,
    });
  } catch {
    await refundQuota();
    if (reservationId) await releaseReservation(reservationId);
    return sseError("ارتباط با سرویس مدل برقرار نشد. دوباره تلاش کنید.", 502);
  }

  if (!upstream.ok || !upstream.body) {
    await refundQuota();
    if (reservationId) await releaseReservation(reservationId);
    // surface friendly message by status, never raw provider payload
    const friendly =
      upstream.status === 429
        ? "مدل در حال حاضر شلوغ است؛ چند لحظه بعد تلاش کنید."
        : "پاسخی از مدل دریافت نشد. دوباره تلاش کنید یا مدل دیگری انتخاب کنید.";
    return sseError(friendly, 502);
  }

  // ── 8. Pipe SSE to client while accumulating for billing ──
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let full = "";
  let usage: { prompt?: number; completion?: number } = {};
  let clientClosed = false;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader();
      let buf = "";

      const finish = async () => {
        // ── settle + record usage ───────────────────────────
        let tokens = { inputTokens: 0, outputTokens: 0 };
        if (usage.prompt || usage.completion) {
          tokens = {
            inputTokens: usage.prompt ?? 0,
            outputTokens: usage.completion ?? 0,
          };
        } else {
          // estimate from text length (rough; provider didn't report)
          tokens = {
            inputTokens: Math.ceil(JSON.stringify(upstreamMessages).length / 4),
            outputTokens: Math.ceil(full.length / 4),
          };
        }
        if (tokens.inputTokens === 0 && tokens.outputTokens === 0) {
          tokens = { inputTokens: 1, outputTokens: 1 };
        }

        // Reconcile the subscription reservation with ACTUAL provider tokens.
        if (activeQuota?.usageRowId) {
          await reconcileChatUsage({
            usageRowId: activeQuota.usageRowId,
            reservedInput: activeQuota.reservedInput ?? 0,
            actualInput: tokens.inputTokens,
            reservedOutput: activeQuota.reservedOutput ?? 0,
            actualOutput: tokens.outputTokens,
          });
        }

        let costCents = 0;
        if (pricing) {
          costCents = calculateActualCost(pricing, tokens);
          if (reservationId) {
            const settled = await settleReservation(
              reservationId,
              costCents,
              tokens.inputTokens,
              tokens.outputTokens
            );
            if (!settled.success) {
              console.error(`[Chat] settle failed [req=${requestId}]`);
            }
          }
        } else if (reservationId) {
          await releaseReservation(reservationId);
        }

        await recordUsage({
          requestId,
          userId,
          provider: resolved.provider.config.id,
          upstreamModelId: resolved.model.provider_model_id,
          azuraModelId: resolved.model.azura_model_id,
          tokens,
          upstreamCost: costCents,
          markup: 0,
          customerCharge: costCents,
          pricingRuleVersion: pricing?.ruleVersion ?? 0,
          status: "succeeded",
          responseMs: Date.now() - startTime,
        });

        // ── persist messages ────────────────────────────────
        if (!temporary && conversationId) {
          const lastUser = [...upstreamMessages].reverse().find((m) => m.role === "user");
          await persistUserMessage(conversationId, lastUser?.content ?? "", []);
          await persistAssistantMessage(conversationId, full, modelSlug, tokens, costCents);
        }

        // ── final event ─────────────────────────────────────
        const done = JSON.stringify({
          type: "done",
          usage: {
            inputTokens: tokens.inputTokens,
            outputTokens: tokens.outputTokens,
            costCents,
          },
        });
        controller.enqueue(encoder.encode(`data: ${done}\n\n`));
        controller.close();
      };

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });

          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const chunk = JSON.parse(payload);
              const delta = chunk.choices?.[0]?.delta?.content;
              if (typeof delta === "string" && delta.length > 0) {
                full += delta;
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "delta", delta })}\n\n`)
                );
              }
              if (chunk.usage) {
                usage.prompt = Number(chunk.usage.prompt_tokens) || undefined;
                usage.completion = Number(chunk.usage.completion_tokens) || undefined;
              }
            } catch {
              // ignore malformed chunk
            }
          }
        }
        await finish();
      } catch (err) {
        clientClosed = true;
        // Failed/empty streams never consume successful usage.
        if (activeQuota?.usageRowId) {
          if (full.length === 0) {
            await refundQuota();
          } else {
            // Partial output was delivered — reconcile with the estimate.
            await reconcileChatUsage({
              usageRowId: activeQuota.usageRowId,
              reservedInput: activeQuota.reservedInput ?? 0,
              actualInput: Math.ceil(JSON.stringify(upstreamMessages).length / 4),
              reservedOutput: activeQuota.reservedOutput ?? 0,
              actualOutput: Math.ceil(full.length / 4),
            });
          }
        }
        if (reservationId) {
          // bill what we streamed so far
          const tokens = {
            inputTokens: Math.ceil(JSON.stringify(upstreamMessages).length / 4),
            outputTokens: Math.ceil(full.length / 4),
          };
          if (pricing) {
            const costCents = calculateActualCost(pricing, tokens);
            await settleReservation(reservationId, costCents, tokens.inputTokens, tokens.outputTokens);
            await recordUsage({
              requestId,
              userId,
              provider: resolved.provider.config.id,
              upstreamModelId: resolved.model.provider_model_id,
              azuraModelId: resolved.model.azura_model_id,
              tokens,
              upstreamCost: costCents,
              markup: 0,
              customerCharge: costCents,
              pricingRuleVersion: pricing?.ruleVersion ?? 0,
              status: full.length > 0 ? "succeeded" : "failed",
              statusDetail: clientClosed ? "client_disconnected" : "stream_error",
              responseMs: Date.now() - startTime,
            });
          } else {
            await releaseReservation(reservationId);
          }
        }
        try {
          controller.close();
        } catch {
          // already closed
        }
      }
    },
    cancel() {
      clientClosed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

// keep maskId referenced (may be used for future key display)
void maskId;
