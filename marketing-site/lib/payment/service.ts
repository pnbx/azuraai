/**
 * Payment Service
 *
 * Core payment operations: intent creation, webhook handling, status queries.
 * All operations are server-side only. No client can influence payment state.
 *
 * Security invariants:
 * - Payment amount is validated and persisted server-side
 * - Webhook verification is the only trusted path for wallet credit
 * - Idempotency is enforced at the database level
 * - Concurrent webhook processing cannot double-credit
 * - State machine transitions are validated server-side
 */

import { supabaseAdmin } from '@/supabase/admin';
import type { PaymentProviderAdapter, WebhookEvent } from './provider';
import {
  PAYMENT_CURRENCY,
  MIN_FUNDING_TOMAN,
  MAX_FUNDING_TOMAN,
  SUPPORTED_CURRENCIES,
  VALID_TRANSITIONS,
  type PaymentStatus,
} from './constants';

/** Payment intent as stored in the database */
export interface PaymentIntent {
  readonly id: string;
  readonly userId: string;
  readonly amountToman: number;
  readonly currency: string;
  readonly provider: string;
  readonly providerPaymentId: string | null;
  readonly status: PaymentStatus;
  readonly walletTransactionId: string | null;
  readonly idempotencyKey: string;
  readonly createdAt: string;
  readonly succeededAt: string | null;
  readonly failedAt: string | null;
  readonly failureReason: string | null;
}

/** Result of creating a payment intent */
export interface CreateIntentResult {
  readonly intent: PaymentIntent;
  readonly clientSecret?: string;
}

/** Error types for payment operations */
export class PaymentError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly statusCode: number = 400
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

/**
 * Validate that a state transition is legal.
 */
function isValidTransition(from: PaymentStatus, to: PaymentStatus): boolean {
  const allowed = VALID_TRANSITIONS[from];
  return allowed !== undefined && allowed.includes(to);
}

/**
 * Create a payment intent.
 *
 * - Validates amount, currency, idempotency
 * - Returns existing intent if same user + idempotency key
 * - Calls provider adapter to initiate payment
 * - Persists server-side amount (never client-influenced)
 */
export async function createPaymentIntent(
  userId: string,
  amountToman: number,
  idempotencyKey: string,
  providerAdapter: PaymentProviderAdapter
): Promise<CreateIntentResult> {
  // Validate amount
  if (!Number.isInteger(amountToman)) {
    throw new PaymentError('Amount must be an integer', 'invalid_amount');
  }
  if (amountToman <= 0) {
    throw new PaymentError('Amount must be positive', 'invalid_amount');
  }
  if (amountToman < MIN_FUNDING_TOMAN) {
    throw new PaymentError(
      `Minimum funding is ${MIN_FUNDING_TOMAN} Toman`,
      'amount_below_minimum'
    );
  }
  if (amountToman > MAX_FUNDING_TOMAN) {
    throw new PaymentError(
      `Maximum funding is ${MAX_FUNDING_TOMAN} Toman`,
      'amount_above_maximum'
    );
  }

  // Validate currency
  if (!SUPPORTED_CURRENCIES.includes(PAYMENT_CURRENCY)) {
    throw new PaymentError('Unsupported currency', 'invalid_currency');
  }

  // Validate idempotency key
  if (!idempotencyKey || idempotencyKey.trim().length === 0) {
    throw new PaymentError('Idempotency key is required', 'invalid_idempotency_key');
  }

  // Check for existing intent (idempotent return)
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('payment_intents')
    .select('*')
    .eq('user_id', userId)
    .eq('idempotency_key', idempotencyKey)
    .single();

  if (existing && !existingError) {
    // Return existing intent (idempotent)
    return {
      intent: mapIntentRow(existing),
    };
  }

  // Create payment intent (status = 'created')
  const intentId = crypto.randomUUID();
  const { error: insertError } = await supabaseAdmin
    .from('payment_intents')
    .insert({
      id: intentId,
      user_id: userId,
      amount_toman: amountToman,
      currency: PAYMENT_CURRENCY,
      provider: providerAdapter.providerId,
      idempotency_key: idempotencyKey,
      status: 'created',
      metadata: {},
    });

  if (insertError) {
    // Handle race condition: if insert fails due to unique constraint,
    // return the existing intent
    if (insertError.code === '23505') {
      const { data: retry } = await supabaseAdmin
        .from('payment_intents')
        .select('*')
        .eq('user_id', userId)
        .eq('idempotency_key', idempotencyKey)
        .single();
      if (retry) {
        return { intent: mapIntentRow(retry) };
      }
    }
    throw new PaymentError(
      'Failed to create payment intent',
      'intent_creation_failed',
      500
    );
  }

  // Call provider to create payment
  let providerResult;
  try {
    providerResult = await providerAdapter.createPayment({
      amountToman,
      currency: PAYMENT_CURRENCY,
      idempotencyKey,
      userId,
    });
  } catch (providerError) {
    // Log the real provider failure before masking — otherwise production
    // shows only a generic 502 with no way to diagnose (observed with Zibal).
    console.error('[Payment] provider.createPayment failed:', providerError);
    // Mark intent as failed if provider call fails
    await supabaseAdmin
      .from('payment_intents')
      .update({
        status: 'failed',
        failed_at: new Date().toISOString(),
        failure_reason: 'Provider payment creation failed',
      })
      .eq('id', intentId)
      .eq('status', 'created');

    throw new PaymentError(
      'Payment provider unavailable',
      'provider_error',
      502
    );
  }

  // Update intent with provider payment ID and status
  const { error: updateError } = await supabaseAdmin
    .from('payment_intents')
    .update({
      provider_payment_id: providerResult.providerPaymentId,
      status: 'pending',
    })
    .eq('id', intentId)
    .eq('status', 'created');

  if (updateError) {
    throw new PaymentError(
      'Failed to update payment intent',
      'intent_update_failed',
      500
    );
  }

  // Fetch the updated intent
  const { data: finalIntent } = await supabaseAdmin
    .from('payment_intents')
    .select('*')
    .eq('id', intentId)
    .single();

  return {
    intent: mapIntentRow(finalIntent!),
    clientSecret: providerResult.clientSecret,
  };
}

/**
 * Handle a verified webhook event.
 *
 * - Records the event in payment_webhook_events (idempotent via UNIQUE constraint)
 * - Calls process_successful_payment RPC for atomic wallet credit
 * - Returns whether the event was already processed
 */
export async function handleWebhookEvent(
  providerAdapter: PaymentProviderAdapter,
  headers: Record<string, string>,
  rawBody: string
): Promise<{ processed: boolean; paymentIntentId?: string }> {
  // Step 1: Verify webhook signature via adapter
  const event = providerAdapter.verifyWebhook(headers, rawBody);
  if (!event) {
    throw new PaymentError('Invalid webhook signature', 'invalid_signature', 400);
  }

  // Step 2: Insert event into ledger (UNIQUE constraint prevents duplicates)
  const { error: eventError } = await supabaseAdmin
    .from('payment_webhook_events')
    .insert({
      provider: providerAdapter.providerId,
      provider_event_id: event.providerEventId,
      event_type: event.eventType,
      provider_payment_id: event.providerPaymentId,
      amount_toman: event.amountToman,
      currency: event.currency,
      payload: event.rawPayload,
      processed: false,
    });

  if (eventError) {
    // Unique constraint violation = duplicate event, already processed
    if (eventError.code === '23505') {
      // Check if it was already processed
      const { data: existing } = await supabaseAdmin
        .from('payment_webhook_events')
        .select('processed, payment_intent_id')
        .eq('provider', providerAdapter.providerId)
        .eq('provider_event_id', event.providerEventId)
        .single();

      if (existing?.processed) {
        return { processed: true, paymentIntentId: existing.payment_intent_id };
      }

      // Event exists but not yet processed — race condition, retry
      // The concurrent worker will handle it
      return { processed: false };
    }

    throw new PaymentError(
      'Failed to record webhook event',
      'event_recording_failed',
      500
    );
  }

  // Step 3: Find the payment intent by provider payment ID
  const { data: intent, error: intentError } = await supabaseAdmin
    .from('payment_intents')
    .select('*')
    .eq('provider', providerAdapter.providerId)
    .eq('provider_payment_id', event.providerPaymentId)
    .single();

  if (intentError || !intent) {
    // Unknown payment — log but don't fail (provider may send events for other systems)
    await supabaseAdmin
      .from('payment_webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString() })
      .eq('provider', providerAdapter.providerId)
      .eq('provider_event_id', event.providerEventId);

    return { processed: false };
  }

  // Step 4: Process based on event type
  if (event.eventType === 'payment.succeeded') {
    // Use atomic RPC for wallet credit
    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc(
      'process_successful_payment',
      {
        p_payment_intent_id: intent.id,
        p_provider_event_id: event.providerEventId,
        p_provider_payment_id: event.providerPaymentId,
        p_amount_toman: event.amountToman,
        p_currency: event.currency,
      }
    );

    if (rpcError) {
      throw new PaymentError(
        'Failed to process payment',
        'payment_processing_failed',
        500
      );
    }

    // Mark webhook event as processed
    await supabaseAdmin
      .from('payment_webhook_events')
      .update({
        processed: true,
        processed_at: new Date().toISOString(),
        payment_intent_id: intent.id,
      })
      .eq('provider', providerAdapter.providerId)
      .eq('provider_event_id', event.providerEventId);

    return {
      processed: !rpcResult.already_processed,
      paymentIntentId: intent.id,
    };
  }

  if (event.eventType === 'payment.failed' || event.eventType === 'payment.cancelled') {
    const newStatus: PaymentStatus =
      event.eventType === 'payment.failed' ? 'failed' : 'cancelled';

    // Validate transition
    if (!isValidTransition(intent.status as PaymentStatus, newStatus)) {
      // Already in terminal state, idempotent
      await supabaseAdmin
        .from('payment_webhook_events')
        .update({ processed: true, processed_at: new Date().toISOString(), payment_intent_id: intent.id })
        .eq('provider', providerAdapter.providerId)
        .eq('provider_event_id', event.providerEventId);

      return { processed: false, paymentIntentId: intent.id };
    }

    await supabaseAdmin
      .from('payment_intents')
      .update({
        status: newStatus,
        failed_at: new Date().toISOString(),
        failure_reason: `Payment ${newStatus} by provider`,
        provider_event_id: event.providerEventId,
      })
      .eq('id', intent.id)
      .eq('status', intent.status);

    await supabaseAdmin
      .from('payment_webhook_events')
      .update({ processed: true, processed_at: new Date().toISOString(), payment_intent_id: intent.id })
      .eq('provider', providerAdapter.providerId)
      .eq('provider_event_id', event.providerEventId);

    return { processed: true, paymentIntentId: intent.id };
  }

  // Unknown event type — mark as processed but don't act
  await supabaseAdmin
    .from('payment_webhook_events')
    .update({ processed: true, processed_at: new Date().toISOString(), payment_intent_id: intent.id })
    .eq('provider', providerAdapter.providerId)
    .eq('provider_event_id', event.providerEventId);

  return { processed: false, paymentIntentId: intent.id };
}

/**
 * Get payment intent status (with ownership verification).
 */
export async function getPaymentIntent(
  userId: string,
  paymentIntentId: string
): Promise<PaymentIntent | null> {
  const { data, error } = await supabaseAdmin
    .from('payment_intents')
    .select('*')
    .eq('id', paymentIntentId)
    .eq('user_id', userId) // Authorization: only own payments
    .single();

  if (error || !data) {
    return null;
  }

  return mapIntentRow(data);
}

/** Map database row to typed interface */
function mapIntentRow(row: Record<string, unknown>): PaymentIntent {
  return {
    id: row.id as string,
    userId: row.user_id as string,
    amountToman: Number(row.amount_toman),
    currency: row.currency as string,
    provider: row.provider as string,
    providerPaymentId: row.provider_payment_id as string | null,
    status: row.status as PaymentStatus,
    walletTransactionId: row.wallet_transaction_id as string | null,
    idempotencyKey: row.idempotency_key as string,
    createdAt: row.created_at as string,
    succeededAt: row.succeeded_at as string | null,
    failedAt: row.failed_at as string | null,
    failureReason: row.failure_reason as string | null,
  };
}
