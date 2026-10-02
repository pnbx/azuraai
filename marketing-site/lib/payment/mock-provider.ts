/**
 * Mock Payment Provider
 *
 * Deterministic mock implementation of PaymentProviderAdapter for testing.
 * Simulates payment lifecycle without real payment processing.
 *
 * This is NOT a real payment provider. It exists solely for testing
 * the payment engine architecture in a deterministic, isolated way.
 */

import type {
  PaymentProviderAdapter,
  CreatePaymentParams,
  PaymentResult,
  WebhookEvent,
} from './provider';
import type { PaymentStatus } from './constants';

/** Internal state for tracking created payments */
interface MockPayment {
  readonly id: string;
  readonly amountToman: number;
  readonly currency: string;
  readonly userId: string;
  status: PaymentStatus;
  providerEventId: string | null;
}

/** Configuration for mock webhook behavior */
export interface MockProviderConfig {
  /** Simulated delay before payment reaches 'pending' (ms) */
  readonly createDelayMs?: number;
  /** Whether webhook signature verification should succeed */
  readonly webhookSignatureValid?: boolean;
}

let mockPaymentCounter = 0;

export class MockPaymentProvider implements PaymentProviderAdapter {
  readonly providerId = 'mock-provider';
  private payments = new Map<string, MockPayment>();
  private webhookSecret = 'mock-webhook-secret-do-not-expose';

  constructor(private config: MockProviderConfig = {}) {}

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    mockPaymentCounter++;
    const paymentId = `mock_pay_${mockPaymentCounter}_${params.userId.slice(0, 8)}`;

    const payment: MockPayment = {
      id: paymentId,
      amountToman: params.amountToman,
      currency: params.currency,
      userId: params.userId,
      status: 'pending',
      providerEventId: null,
    };

    this.payments.set(paymentId, payment);

    return {
      providerPaymentId: paymentId,
      status: 'pending',
      clientSecret: `mock_secret_${paymentId}`,
    };
  }

  /** Simulate a successful payment (for test use) */
  simulateSuccess(paymentId: string): MockPayment | null {
    const payment = this.payments.get(paymentId);
    if (!payment) return null;
    payment.status = 'succeeded';
    return payment;
  }

  /** Simulate a failed payment (for test use) */
  simulateFailure(paymentId: string): MockPayment | null {
    const payment = this.payments.get(paymentId);
    if (!payment) return null;
    payment.status = 'failed';
    return payment;
  }

  /** Simulate a cancelled payment (for test use) */
  simulateCancellation(paymentId: string): MockPayment | null {
    const payment = this.payments.get(paymentId);
    if (!payment) return null;
    payment.status = 'cancelled';
    return payment;
  }

  verifyWebhook(
    headers: Record<string, string>,
    rawBody: string
  ): WebhookEvent | null {
    // Simulate signature verification
    const signature = headers['x-mock-signature'];
    if (!signature || signature !== this.webhookSecret) {
      return null;
    }

    // Parse the body
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return null;
    }

    // Validate required fields
    if (
      typeof parsed.eventId !== 'string' ||
      typeof parsed.eventType !== 'string' ||
      typeof parsed.paymentId !== 'string' ||
      typeof parsed.amountToman !== 'number' ||
      typeof parsed.currency !== 'string'
    ) {
      return null;
    }

    return {
      providerEventId: parsed.eventId as string,
      eventType: parsed.eventType as string,
      providerPaymentId: parsed.paymentId as string,
      amountToman: parsed.amountToman as number,
      currency: parsed.currency as string,
      rawPayload: parsed,
    };
  }

  async getPaymentStatus(
    providerPaymentId: string
  ): Promise<PaymentResult> {
    const payment = this.payments.get(providerPaymentId);
    if (!payment) {
      throw new Error(`Mock payment not found: ${providerPaymentId}`);
    }
    return {
      providerPaymentId: payment.id,
      status: payment.status,
    };
  }

  /** Get the mock webhook secret for test setup */
  getWebhookSecret(): string {
    return this.webhookSecret;
  }

  /** Clear all state (for test isolation) */
  reset(): void {
    this.payments.clear();
    mockPaymentCounter = 0;
  }
}

/** Create a fresh mock provider instance for tests */
export function createMockPaymentProvider(
  config?: MockProviderConfig
): MockPaymentProvider {
  return new MockPaymentProvider(config);
}
