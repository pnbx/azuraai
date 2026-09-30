/**
 * GET /api/payments/callback/zarinpal
 *
 * ZarinPal payment callback endpoint.
 * Called when the user is redirected back from ZarinPal after payment.
 *
 * Query parameters from ZarinPal:
 *   Authority — the payment authority code
 *   Status    — "OK" or "NOK"
 *
 * Flow:
 *   1. User completes payment on ZarinPal
 *   2. ZarinPal redirects to this callback URL
 *   3. Server verifies payment with ZarinPal's verify endpoint
 *   4. On success, credits wallet atomically via process_successful_payment RPC
 *   5. Redirects user to wallet page with result
 *
 * Security:
 *   - NEVER trust the redirect alone — always verify with ZarinPal server-side
 *   - Amount is fetched from the database, not from callback parameters
 *   - process_successful_payment RPC handles idempotency and atomicity
 *
 * Response:
 *   302 — redirect to wallet page with success/failure status
 */

import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { supabaseAdmin } from '@/supabase/admin';
import { ZarinPalProvider } from '@/lib/payment/zarinpal-provider';

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const authority = searchParams.get('Authority');
  const status = searchParams.get('Status');

  const walletUrl = '/dashboard/wallet';

  // Validate callback parameters
  if (!authority) {
    console.warn('[ZarinPal Callback] Missing Authority parameter');
    return NextResponse.redirect(`${walletUrl}?payment=error&reason=missing_authority`);
  }

  if (status !== 'OK') {
    console.info(`[ZarinPal Callback] Payment not completed: Status=${status} Authority=${authority}`);
    return NextResponse.redirect(`${walletUrl}?payment=failed&authority=${encodeURIComponent(authority)}`);
  }

  try {
    // Get the authenticated user from session
    const supa = await createSupabaseServerClient();
    const { data: { user }, error: authError } = await supa.auth.getUser();

    if (authError || !user) {
      console.warn('[ZarinPal Callback] Unauthenticated callback access');
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=unauthenticated`);
    }

    // Find the payment intent by provider payment ID (authority)
    const { data: intent, error: intentError } = await supabaseAdmin
      .from('payment_intents')
      .select('id, user_id, amount_toman, currency, status, provider')
      .eq('provider', 'zarinpal')
      .eq('provider_payment_id', authority)
      .single();

    if (intentError || !intent) {
      console.error(`[ZarinPal Callback] Payment intent not found for authority=${authority}`);
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=intent_not_found`);
    }

    // Verify ownership
    if (intent.user_id !== user.id) {
      console.warn(`[ZarinPal Callback] Ownership mismatch: intent belongs to ${intent.user_id}, callback from ${user.id}`);
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=ownership_mismatch`);
    }

    // If already succeeded, this is a replay — redirect with success
    if (intent.status === 'succeeded') {
      return NextResponse.redirect(`${walletUrl}?payment=success&authority=${encodeURIComponent(authority)}`);
    }

    // Verify payment with ZarinPal server-side
    const provider = new ZarinPalProvider();
    const verifyResult = await provider.verifyPayment(authority, intent.amount_toman);

    if (verifyResult.status !== 'succeeded') {
      // Update intent status to failed
      await supabaseAdmin
        .from('payment_intents')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', intent.id);

      return NextResponse.redirect(`${walletUrl}?payment=failed&authority=${encodeURIComponent(authority)}`);
    }

    // Payment verified — atomically credit wallet via RPC
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      'process_successful_payment',
      {
        p_intent_id: intent.id,
        p_provider: 'zarinpal',
        p_provider_event_id: `zarinpal_callback_${authority}`,
        p_amount_toman: intent.amount_toman,
        p_currency: intent.currency,
      }
    );

    if (rpcError) {
      console.error(`[ZarinPal Callback] RPC failed: ${rpcError.message} intent=${intent.id}`);
      // Payment was verified but wallet credit failed — needs manual reconciliation
      return NextResponse.redirect(`${walletUrl}?payment=error&reason=wallet_credit_failed`);
    }

    const result = rpcResult as { success?: boolean; already_processed?: boolean };
    if (result?.already_processed) {
      console.info(`[ZarinPal Callback] Already processed intent=${intent.id}`);
    }

    return NextResponse.redirect(`${walletUrl}?payment=success&authority=${encodeURIComponent(authority)}`);
  } catch (error) {
    console.error('[ZarinPal Callback] Unexpected error:', error);
    return NextResponse.redirect(`${walletUrl}?payment=error&reason=internal_error`);
  }
}
