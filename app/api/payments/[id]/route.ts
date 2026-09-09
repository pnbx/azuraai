/**
 * GET /api/payments/[id]
 *
 * Get payment intent status. Requires authenticated user and ownership.
 *
 * Response:
 *   200 — { success: true, intent: PaymentIntent }
 *   401 — unauthenticated
 *   404 — not found or not owned by user
 */

import { NextResponse } from 'next/server';
import { requireServerUser } from '@/lib/auth/server';
import { getPaymentIntent } from '@/lib/payment/service';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    let user;
    try {
      user = await requireServerUser();
    } catch (error) {
      return NextResponse.json(
        { success: false, error: error instanceof Error ? error.message : 'Unauthenticated' },
        { status: 401 }
      );
    }

    const { id } = await params;

    if (!id || typeof id !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid payment ID' },
        { status: 400 }
      );
    }

    const intent = await getPaymentIntent(user.id, id);

    if (!intent) {
      return NextResponse.json(
        { success: false, error: 'Payment not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      intent,
    });
  } catch (error) {
    console.error('[Payment Status] Unexpected error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
