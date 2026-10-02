/**
 * Payment Provider Adapter Interface
 *
 * Provider-agnostic abstraction for payment processing.
 * Each real payment provider (Stripe, Razorpay, etc.) implements this interface.
 * No provider-specific logic exists in the payment engine core.
 */

import type { PaymentStatus } from './constants';

/** Parameters for creating a payment with the provider */
export interface CreatePaymentParams {
  readonly amountToman: number;
  readonly currency: string;
  readonly idempotencyKey: string;
  readonly userId: string;
  readonly metadata?: Record<string, unknown>;
}

/** Result from creating a payment */
export interface PaymentResult {
  readonly providerPaymentId: string;
  readonly status: PaymentStatus;
  readonly clientSecret?: string; // For client-side provider SDK (if applicable)
}

/** Normalized webhook event from any provider */
export interface WebhookEvent {
  readonly providerEventId: string;
  readonly eventType: string;
  readonly providerPaymentId: string;
  readonly amountToman: number;
  readonly currency: string;
  readonly rawPayload: Record<string, unknown>;
}

/** Payment provider adapter contract */
export interface PaymentProviderAdapter {
  readonly providerId: string;

  /** Create a payment with the provider */
  createPayment(params: CreatePaymentParams): Promise<PaymentResult>;

  /**
   * Verify webhook signature and parse the event.
   * Returns null if signature is invalid or event cannot be parsed.
   * Receives raw body bytes and headers for signature verification.
   */
  verifyWebhook(
    headers: Record<string, string>,
    rawBody: string
  ): WebhookEvent | null;

  /** Get current payment status from the provider */
  getPaymentStatus(providerPaymentId: string): Promise<PaymentResult>;
}
