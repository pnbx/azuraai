/**
 * POST /api/payments/intent
 *
 * Create a payment intent for wallet funding.
 * Requires authenticated user. Server determines all payment parameters.
 *
 * Request:
 *   { amountToman: number, idempotencyKey: string, provider?: string }
 *
 * Response:
 *   200 — { success: true, intent: PaymentIntent, clientSecret?: string }
 *   400 — validation error
 *   401 — unauthenticated
 *   502 — provider error
 *   500 — internal error
 */

import { NextResponse } from 'next/server';
import { requireServerUser } from '@/lib/auth/server';
import { createPaymentIntent, PaymentError } from '@/lib/payment/service';
import { MockPaymentProvider } from '@/lib/payment/mock-provider';
import { ZibalProvider } from '@/lib/payment/zibal-provider';
import type { PaymentProviderAdapter } from '@/lib/payment/provider';

// Provider registry: server determines which provider to use
function createProvider(providerId: string): PaymentProviderAdapter | null {
  switch (providerId) {
    case 'zibal':
      // Zibal: available when merchant code is configured
      if (!process.env.ZIBAL_MERCHANT_ID) return null;
      return new ZibalProvider();
    case 'mock-provider':
      // Mock: only in development/test
      if (process.env.NODE_ENV === 'production') return null;
      return new MockPaymentProvider();
    default:
      return null;
  }
}

function getProviderAdapter(providerId?: string): PaymentProviderAdapter {
  const key = providerId || (process.env.ZIBAL_MERCHANT_ID ? 'zibal' : 'mock-provider');
  const adapter = createProvider(key);
  if (!adapter) {
    throw new PaymentError(
      `Payment provider '${key}' is not configured.`,
      'unknown_provider',
      503
    );
  }
  return adapter;
}

export async function POST(request: Request): Promise<NextResponse> {
  try {
    // Authenticate
    let user;
    try {
      user = await requireServerUser();
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Unauthenticated' },
        { status: 401 }
      );
    }

    // Parse body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, error: 'Invalid JSON body' },
        { status: 400 }
      );
    }

    // Validate required fields
    if (typeof body.amountToman !== 'number' || !Number.isInteger(body.amountToman)) {
      return NextResponse.json(
        { success: false, error: 'amountToman must be an integer' },
        { status: 400 }
      );
    }

    if (typeof body.idempotencyKey !== 'string' || body.idempotencyKey.trim().length === 0) {
      return NextResponse.json(
        { success: false, error: 'idempotencyKey is required' },
        { status: 400 }
      );
    }

    // Server determines the provider (never trust client for this)
    const providerAdapter = getProviderAdapter();

    // Create payment intent
    const result = await createPaymentIntent(
      user.id,
      body.amountToman,
      body.idempotencyKey.trim(),
      providerAdapter
    );

    return NextResponse.json(
      {
        success: true,
        intent: result.intent,
        clientSecret: result.clientSecret,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof PaymentError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.statusCode }
      );
    }

    console.error('[Payment Intent] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
