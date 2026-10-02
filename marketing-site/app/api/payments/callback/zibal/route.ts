/**
 * GET /api/payments/callback/zibal
 *
 * Zibal payment callback endpoint.
 * Called when the user is redirected back from gateway.zibal.ir after payment.
 *
 * Query parameters from Zibal:
 *   success   — "1" (paid) or "0" (failed/cancelled)
 *   trackId   — Zibal's tracking ID for the transaction
 *   refNumber — bank reference number
 *
 * Flow:
 *   1. User completes payment on Zibal
 *   2. Zibal redirects to this callback URL
 *   3. Server verifies payment with Zibal's verify endpoint (result 100/201)
 *   4. On success, credits wallet atomically via process_successful_payment RPC
 *   5. Redirects user to wallet page with result
 *
 * Security:
 *   - NEVER trust the redirect alone — always verify with Zibal server-side
 *   - Amount comes from the database intent (store-side), then from Zibal's
 *     verify response — never from callback parameters
 *   - process_successful_payment RPC handles idempotency and atomicity
 *
 * Response:
 *   302 — redirect to wallet page with success/failure status
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/supabase/admin';
import { ZibalProvider } from '@/lib/payment/zibal-provider';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams, origin } = new URL(request.url);
  const success = searchParams.get('success');
  const trackId = searchParams.get('trackId');

  // NextResponse.redirect REQUIRES an absolute URL — a relative path throws
  // "Failed to parse URL" at runtime and breaks the entire callback.
  const walletUrl = `${origin}/account/wallet`;

  // Validate callback parameters
  if (!trackId) {
    console.warn('[Zibal Callback] Missing trackId parameter');
    return NextResponse.redirect(`${walletUrl}?payment=error&reason=missing_track_id`);
  }

  if (success !== '1') {
    console.info(`[Zibal Callback] Payment not completed: success=${success} trackId=${trackId}`);
    return NextResponse.redirect(`${walletUrl}?payment=failed&trackId=${encodeURIComponent(trackId)}`);
  }

  try {
    // Get the authenticated user from session
    const supa = await createSupabaseServerClient();
    const {
      data: { user },
      error: authError,
    } = await supa.auth.getUser();

    if (authError || !user) {
      console.warn('[Zibal Callback] Unauthenticated callback access');
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=unauthenticated`);
    }

    // Find the payment intent by provider payment ID (trackId)
    const { data: intent, error: intentError } = await supabaseAdmin
      .from('payment_intents')
      .select('id, user_id, amount_toman, currency, status, provider, provider_payment_id')
      .eq('provider', 'zibal')
      .eq('provider_payment_id', trackId)
      .single();

    if (intentError || !intent) {
      console.error(`[Zibal Callback] Payment intent not found for trackId=${trackId}`);
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=intent_not_found`);
    }

    // Verify ownership
    if (intent.user_id !== user.id) {
      console.warn(
        `[Zibal Callback] Ownership mismatch: intent belongs to ${intent.user_id}, callback from ${user.id}`
      );
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=ownership_mismatch`);
    }

    // If already succeeded, this is a replay — redirect with success
    if (intent.status === 'succeeded') {
      return NextResponse.redirect(`${walletUrl}?payment=success&trackId=${encodeURIComponent(trackId)}`);
    }

    // If cancelled/failed, refuse to credit a dead intent
    if (intent.status === 'cancelled' || intent.status === 'failed') {
      console.warn(`[Zibal Callback] Intent ${intent.id} is ${intent.status}; refusing verify+credit`);
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=intent_${intent.status}`);
    }

    // Verify payment with Zibal server-side
    const provider = new ZibalProvider();
    let verify;
    try {
      verify = await provider.verifyPayment(trackId);
    } catch (verifyError) {
      console.error(`[Zibal Callback] Verify call failed for trackId=${trackId}:`, verifyError);
      // Zibal unreachable or invalid response — leave intent as-is; user can retry
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=verify_failed`);
    }

    if (verify.status !== 'succeeded') {
      // User never completed the payment (result 202 etc.)
      await supabaseAdmin
        .from('payment_intents')
        .update({ status: 'failed', failed_at: new Date().toISOString(), failure_reason: 'Payment not completed at provider' })
        .eq('id', intent.id)
        .eq('status', 'pending');

      return NextResponse.redirect(`${walletUrl}?payment=failed&trackId=${encodeURIComponent(trackId)}`);
    }

    // Defense in depth: cross-check Zibal's paid amount (rials) against the
    // stored intent amount (toman). Zibal refuses underpayment at checkout,
    // but this closes the loop even if the gateway config ever drifts.
    if (typeof verify.paidAmountRial === 'number' && verify.paidAmountRial !== intent.amount_toman * 10) {
      console.error(
        `[Zibal Callback] Amount mismatch: intent ${intent.amount_toman} toman, provider paid ${verify.paidAmountRial} rials`
      );
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=amount_mismatch`);
    }

    // Payment verified — atomically credit wallet via RPC
    // (param names must match the actual Postgres signature)
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('process_successful_payment', {
      p_payment_intent_id: intent.id,
      p_provider_event_id: `zibal_callback_${trackId}`,
      p_provider_payment_id: trackId,
      p_amount_toman: intent.amount_toman,
      p_currency: intent.currency,
    });

    if (rpcError) {
      console.error(`[Zibal Callback] RPC failed: ${rpcError.message} intent=${intent.id}`);
      // Payment was verified but wallet credit failed — needs manual reconciliation
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=wallet_credit_failed`);
    }

    const result = rpcResult as { already_processed?: boolean } | null;
    if (result?.already_processed) {
      console.info(`[Zibal Callback] Already processed intent=${intent.id}`);
    }

    return NextResponse.redirect(`${walletUrl}?payment=success&trackId=${encodeURIComponent(trackId)}`);
  } catch (error) {
    console.error('[Zibal Callback] Unexpected error:', error);
    return NextResponse.redirect(`${walletUrl}?payment=error&reason=internal_error`);
  }
}
