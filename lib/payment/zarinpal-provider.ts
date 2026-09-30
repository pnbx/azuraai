/**
 * ZarinPal Payment Provider Adapter
 *
 * Production adapter for the ZarinPal payment gateway (Iranian payment provider).
 * Uses the redirect-based payment flow:
 *   1. Server creates a payment request → gets an Authority code
 *   2. User is redirected to ZarinPal's payment page
 *   3. After payment, user is redirected back to callback URL
 *   4. Server verifies the payment via ZarinPal's verify endpoint
 *
 * API Reference: https://www.zarinpal.com/docs/
 * SDK: zarinpal-checkout (zero dependencies, native fetch)
 */

import type {
  PaymentProviderAdapter,
  CreatePaymentParams,
  PaymentResult,
  WebhookEvent,
} from './provider';
import type { PaymentStatus } from './constants';

/** ZarinPal API response codes */
const ZARINPAL_CODES = {
  SUCCESS: 100,
  ALREADY_VERIFIED: 101,
  INCOMPLETE_ARGS: -1,
  INVALID_MERCHANT: -2,
  AMOUNT_BELOW_MIN: -3,
  INVALID_AMOUNT: -4,
  DUPLICATE_REQUEST: -41,
  TRANSACTION_LOCKED: -42,
  AMOUNT_NOT_ALLOWED: -50,
  MONTHLY_LIMIT: -51,
  INVALID_AUTHORITY: -41,
  AUTHORITY_EXPIRED: -42,
} as const;

/** ZarinPal configuration from environment */
interface ZarinPalConfig {
  merchantId: string;
  sandbox: boolean;
  callbackUrl: string;
}

function getConfig(): ZarinPalConfig {
  const merchantId = process.env.ZARINPAL_MERCHANT_ID;
  if (!merchantId) {
    throw new Error('ZARINPAL_MERCHANT_ID environment variable is not set');
  }

  const sandbox = process.env.ZARINPAL_SANDBOX === 'true';
  const callbackUrl = process.env.ZARINPAL_CALLBACK_URL || `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/api/payments/callback/zarinpal`;

  return { merchantId, sandbox, callbackUrl };
}

function getBaseUrl(sandbox: boolean): string {
  return sandbox
    ? 'https://sandbox.zarinpal.com'
    : 'https://payment.zarinpal.com';
}

function getStartPayUrl(sandbox: boolean, authority: string): string {
  const base = sandbox
    ? 'https://sandbox.zarinpal.com'
    : 'https://www.zarinpal.com';
  return `${base}/pg/StartPay/${authority}`;
}

/** Map ZarinPal verification code to Azura payment status */
function mapVerifyStatus(code: number): PaymentStatus {
  if (code === ZARINPAL_CODES.SUCCESS || code === ZARINPAL_CODES.ALREADY_VERIFIED) {
    return 'succeeded';
  }
  return 'failed';
}

export class ZarinPalProvider implements PaymentProviderAdapter {
  readonly providerId = 'zarinpal';

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const config = getConfig();
    const baseUrl = getBaseUrl(config.sandbox);

    const body = {
      merchant_id: config.merchantId,
      amount: params.amountToman,
      currency: 'IRT', // Toman (not Rial)
      callback_url: config.callbackUrl,
      description: `Payment for user ${params.userId.slice(0, 8)}...`,
      metadata: {
        email: params.metadata?.email as string | undefined,
        mobile: params.metadata?.mobile as string | undefined,
      },
    };

    const response = await fetch(`${baseUrl}/pg/v4/payment/request.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json() as {
      data?: { code: number; message: string; authority?: string };
      errors?: { code: number; message: string };
    };

    // Handle API-level errors
    if (result.errors) {
      throw new Error(`ZarinPal request failed: ${result.errors.message} (code: ${result.errors.code})`);
    }

    if (!result.data) {
      throw new Error('ZarinPal returned empty response');
    }

    if (result.data.code !== ZARINPAL_CODES.SUCCESS) {
      throw new Error(`ZarinPal request rejected: ${result.data.message} (code: ${result.data.code})`);
    }

    if (!result.data.authority) {
      throw new Error('ZarinPal returned success but no authority code');
    }

    const authority = result.data.authority;
    const redirectUrl = getStartPayUrl(config.sandbox, authority);

    return {
      providerPaymentId: authority, // Authority serves as the payment ID
      status: 'pending',
      clientSecret: redirectUrl, // Client redirects to this URL
    };
  }

  /**
   * Verify a ZarinPal callback redirect.
   * Called when the user returns from ZarinPal with ?Authority=xxx&Status=OK
   *
   * This is NOT a traditional webhook — ZarinPal uses redirect-based flow.
   * The callback is called from the browser redirect, and the server must
   * call verify endpoint to confirm payment.
   */
  verifyWebhook(
    _headers: Record<string, string>,
    _rawBody: string
  ): WebhookEvent | null {
    // ZarinPal doesn't use webhooks — this method is not applicable.
    // Payment verification happens via the callback endpoint which calls
    // ZarinPal's verify endpoint directly.
    // Return null to indicate this adapter doesn't support webhooks.
    return null;
  }

  /**
   * Verify a payment with ZarinPal.
   * Called from the callback endpoint after redirect.
   */
  async verifyPayment(authority: string, amountToman: number): Promise<PaymentResult> {
    const config = getConfig();
    const baseUrl = getBaseUrl(config.sandbox);

    const body = {
      merchant_id: config.merchantId,
      amount: amountToman,
      authority,
    };

    const response = await fetch(`${baseUrl}/pg/v4/payment/verify.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json() as {
      data?: { code: number; message: string; ref_id?: number; card_hash?: string; card_pan?: string; fee?: number };
      errors?: { code: number; message: string };
    };

    if (result.errors) {
      throw new Error(`ZarinPal verify failed: ${result.errors.message} (code: ${result.errors.code})`);
    }

    if (!result.data) {
      throw new Error('ZarinPal verify returned empty response');
    }

    // Code 100 = success, 101 = already verified (idempotent)
    if (result.data.code !== ZARINPAL_CODES.SUCCESS && result.data.code !== ZARINPAL_CODES.ALREADY_VERIFIED) {
      throw new Error(`ZarinPal verify rejected: ${result.data.message} (code: ${result.data.code})`);
    }

    return {
      providerPaymentId: authority,
      status: mapVerifyStatus(result.data.code),
    };
  }

  async getPaymentStatus(authority: string): Promise<PaymentResult> {
    // ZarinPal doesn't have a direct "get status" endpoint.
    // We would need to store the status locally or use inquiry.
    // For now, return pending — the actual status is determined by verify.
    return {
      providerPaymentId: authority,
      status: 'pending',
    };
  }
}

/** Create a ZarinPal provider instance */
export function createZarinPalProvider(): ZarinPalProvider {
  return new ZarinPalProvider();
}
