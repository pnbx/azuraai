/**
 * POST /api/payments/webhook
 *
 * Provider webhook endpoint. Receives verified payment events from payment providers.
 * NO user authentication — verified by provider signature only.
 *
 * The raw request body is preserved for signature verification.
 * This is the ONLY trusted path for wallet credit.
 *
 * Response:
 *   200 — always (provider should not retry on non-2xx)
 *   400 — invalid signature or malformed event
 */

import { NextResponse } from 'next/server';
import { handleWebhookEvent, PaymentError } from '@/lib/payment/service';
import { MockPaymentProvider } from '@/lib/payment/mock-provider';
import type { PaymentProviderAdapter } from '@/lib/payment/provider';

// Provider registry for webhook verification
function createProvider(providerId: string): PaymentProviderAdapter | null {
  switch (providerId) {
    case 'mock-provider':
      if (process.env.NODE_ENV === 'production') return null;
      return new MockPaymentProvider();
    default:
      // Zibal uses redirect flow, not webhooks
      // Unknown providers return null — webhook is silently accepted
      return null;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Preserve raw body for signature verification
    const rawBody = await request.text();

    // Extract provider from header or query
    const providerId =
      request.headers.get('x-provider') ||
      new URL(request.url).searchParams.get('provider') ||
      'mock-provider';

    const providerAdapter = createProvider(providerId);
    if (!providerAdapter) {
      // Unknown provider — log but return 200 to prevent retry storms
      console.warn('[Webhook] Unknown provider:', providerId);
      return NextResponse.json({ success: true });
    }

    // Extract headers for signature verification
    const headers: Record<string, string> = {};
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    // Process webhook (verification + wallet credit happen here)
    const result = await handleWebhookEvent(providerAdapter, headers, rawBody);

    return NextResponse.json({
      success: true,
      processed: result.processed,
    });
  } catch (error) {
    if (error instanceof PaymentError) {
      // Invalid signature or malformed event — return 400
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    // Unexpected error — return 200 to prevent provider retry storms
    // Log the error for investigation
    console.error('[Webhook] Unexpected error:', error);
    return NextResponse.json({ success: true });
  }
}
