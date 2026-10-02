/**
 * Zibal Payment Provider Adapter
 *
 * Production adapter for the Zibal payment gateway (zibal.ir).
 * Uses the redirect-based payment flow:
 *   1. Server creates a payment request → gets a trackId
 *   2. User is redirected to https://gateway.zibal.ir/start/{trackId}
 *   3. After payment, Zibal redirects back to the callback URL with
 *      ?success={1|0}&trackId={trackId}&refNumber={bank reference}
 *   4. Server verifies the payment via Zibal's verify endpoint (result
 *      100 = paid, 201 = already verified, 202 = unpaid)
 *
 * ⚠️ UNIT GOTCHA: Zibal's API takes amounts in RIALS, while Azura's
 * payment engine works in TOMAN. Conversion (×10 / ÷10) happens only
 * inside this adapter — every layer above it stays toman.
 *
 * API Reference: https://docs.zibal.ir/IPG/API/
 */

import type {
  PaymentProviderAdapter,
  CreatePaymentParams,
  PaymentResult,
  WebhookEvent,
} from './provider';

/** Zibal result codes (request + verify) */
const ZIBAL_CODES = {
  SUCCESS: 100,
  ALREADY_VERIFIED: 201, // verify only — paid, already settled
  NOT_PAID: 202, // verify only — user never completed the payment
  INVALID_MERCHANT: 114,
  AMOUNT_TOO_LOW: 115,
  TRACK_ID_NOT_FOUND: 119,
  INVALID_CALLBACK: 113,
} as const;

/** Site URL for the payment callback. Guards against a localhost value
 *  leaking into production builds (which sends users to localhost after
 *  paying — observed in production). */
function getSiteUrl(): string {
  const explicit = process.env.ZIBAL_CALLBACK_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, '');
  const publicUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (publicUrl && publicUrl.startsWith('https://')) return publicUrl.replace(/\/+$/, '');
  if (process.env.VERCEL_ENV === 'production') return 'https://azuraai.ir';
  return publicUrl || 'http://localhost:3000';
}

/** Zibal configuration from environment */
interface ZibalConfig {
  merchant: string;
  callbackUrl: string;
  /** Optional static-IP relay (see scripts/zibal-relay/) — when set, all
   *  Zibal API calls route through it so Zibal's IP whitelist sees the
   *  relay's fixed IP instead of Vercel's rotating egress. */
  relayUrl: string | null;
  relaySecret: string | null;
}

function getConfig(): ZibalConfig {
  const merchant = process.env.ZIBAL_MERCHANT_ID;
  if (!merchant) {
    throw new Error('ZIBAL_MERCHANT_ID environment variable is not set');
  }

  const callbackUrl = `${getSiteUrl()}/api/payments/callback/zibal`;

  const relayUrl = process.env.ZIBAL_RELAY_URL?.trim() || null;
  const relaySecret = process.env.ZIBAL_RELAY_SECRET?.trim() || null;

  return { merchant, callbackUrl, relayUrl, relaySecret };
}

/** Resolve the URL for a Zibal endpoint — direct, or via the relay. */
function zibalEndpointUrl(
  config: ZibalConfig,
  endpoint: 'request' | 'verify' | 'inquiry'
): string {
  if (!config.relayUrl) {
    return `https://gateway.zibal.ir/v1/${endpoint}`;
  }
  let base = config.relayUrl.replace(/\/+$/, '');
  // Accept either the bare host or the full script path
  if (!/\.php$/.test(base)) base += '/relay.php';
  return `${base}?ep=${endpoint}`;
}

/** The relay's shared host intermittently fails its outbound TLS handshake
 *  to gateway.zibal.ir (observed ~2 of every 3 attempts on realy.theazizi.space).
 *  A 502 with `upstream_failed` is that transient failure, so retry it a few
 *  times with backoff rather than surfacing a failed checkout to the user. */
const RELAY_ATTEMPTS = 4;
const RELAY_BACKOFF_MS = [400, 1200, 2500];

function isTransientRelayFailure(status: number): boolean {
  return status === 502 || status === 503 || status === 504;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** POST a payload to Zibal (directly, or through the static-IP relay).
 *  Retries only transient relay/upstream failures — a real Zibal answer,
 *  including a business rejection, is returned to the caller untouched. */
async function zibalFetch(
  endpoint: 'request' | 'verify' | 'inquiry',
  payload: Record<string, unknown>
): Promise<Response> {
  const config = getConfig();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (config.relayUrl && config.relaySecret) {
    headers['x-relay-secret'] = config.relaySecret;
  }
  const url = zibalEndpointUrl(config, endpoint);
  const body = JSON.stringify(payload);

  let lastError: unknown;
  for (let attempt = 0; attempt < RELAY_ATTEMPTS; attempt++) {
    try {
      const response = await fetch(url, { method: 'POST', headers, body });
      if (attempt === RELAY_ATTEMPTS - 1 || !isTransientRelayFailure(response.status)) {
        return response;
      }
    } catch (error) {
      // Network-level failure (DNS, connection reset) — also worth retrying.
      lastError = error;
      if (attempt === RELAY_ATTEMPTS - 1) throw error;
    }
    await sleep(RELAY_BACKOFF_MS[attempt] ?? 2500);
  }

  throw lastError ?? new Error(`Zibal ${endpoint} unreachable`);
}

/** Map Zibal verify result code to Azura payment status */
function mapVerifyStatus(code: number): 'succeeded' | 'failed' {
  if (code === ZIBAL_CODES.SUCCESS || code === ZIBAL_CODES.ALREADY_VERIFIED) {
    return 'succeeded';
  }
  return 'failed';
}

/** Map a Zibal inquiry "status" to Azura payment status.
 *  1 = paid & verified → succeeded; 2 = paid, not yet verified → pending;
 *  everything else (awaiting, cancelled, failed, refunded) → pending,
 *  because the callback/verify flow owns terminal transitions. */
function mapInquiryStatus(status: number | undefined): 'succeeded' | 'pending' | 'failed' {
  if (status === 1) return 'succeeded';
  if (status === 2) return 'pending';
  if (status === 3 || status === 15 || status === 16 || status === 18) return 'failed';
  return 'pending';
}

/**
 * Parse a Zibal API response. Zibal sometimes answers with an HTML error
 * page (e.g. 500 on malformed input) — never assume JSON; fail with a
 * useful message instead of a JSON.parse crash.
 */
async function parseZibalJson(response: Response, endpoint: string): Promise<Record<string, unknown>> {
  const text = await response.text();
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(
      `Zibal ${endpoint} returned non-JSON response (HTTP ${response.status})`
    );
  }
}

/**
 * Sanitize the payment description. Zibal's backend 500-crashes on some
 * punctuation (observed: em-dash U+2014), so only letters, digits, spaces
 * and a small safe punctuation set are allowed through.
 */
function sanitizeDescription(raw: string): string {
  return raw.replace(/[^\p{L}\p{N} ()\-_.]/gu, '').trim();
}

export class ZibalProvider implements PaymentProviderAdapter {
  readonly providerId = 'zibal';

  async createPayment(params: CreatePaymentParams): Promise<PaymentResult> {
    const config = getConfig();

    const body = {
      merchant: config.merchant,
      // Zibal wants rials; the engine speaks toman
      amount: params.amountToman * 10,
      callbackUrl: config.callbackUrl,
      description: sanitizeDescription(
        `شارژ کیف پول (${params.amountToman.toLocaleString('fa-IR')} تومان)`
      ),
      orderId: params.idempotencyKey.slice(0, 32),
    };

    const response = await zibalFetch('request', body);

    if (!response.ok) {
      console.error(`[Zibal] request HTTP ${response.status} body=${JSON.stringify(body)}`);
      throw new Error(`Zibal request HTTP ${response.status}`);
    }

    const result = (await parseZibalJson(response, 'request')) as {
      trackId?: number;
      result: number;
      message: string;
    };

    if (result.result !== ZIBAL_CODES.SUCCESS || !result.trackId) {
      throw new Error(`Zibal request rejected: ${result.message} (result: ${result.result})`);
    }

    const trackId = String(result.trackId);

    return {
      providerPaymentId: trackId,
      status: 'pending',
      // Client redirects the user here to pay
      clientSecret: `https://gateway.zibal.ir/start/${trackId}`,
    };
  }

  /**
   * Zibal doesn't push webhooks in this integration — verification happens
   * in the callback endpoint after the browser redirect. Return null to
   * indicate this adapter has no webhook signature to verify.
   */
  verifyWebhook(
    _headers: Record<string, string>,
    _rawBody: string
  ): WebhookEvent | null {
    return null;
  }

  /**
   * Verify a payment with Zibal server-side.
   * Called from the callback endpoint after the browser redirect.
   * Result 100 = verified, 201 = already verified (idempotent replay),
   * 202 = user never paid.
   */
  async verifyPayment(trackId: string): Promise<
    PaymentResult & { paidAmountRial?: number; refNumber?: number; cardNumber?: string }
  > {
    const config = getConfig();

    const response = await zibalFetch('verify', {
      merchant: config.merchant,
      trackId: Number(trackId),
    });

    if (!response.ok) {
      throw new Error(`Zibal verify HTTP ${response.status}`);
    }

    const result = (await parseZibalJson(response, 'verify')) as {
      paidAt?: string;
      cardNumber?: string;
      status: number;
      amount: number; // rials
      refNumber: number;
      description: string;
      orderId: string;
      result: number;
      message: string;
    };

    return {
      providerPaymentId: trackId,
      status: mapVerifyStatus(result.result),
      paidAmountRial: result.amount,
      refNumber: result.refNumber,
      cardNumber: result.cardNumber,
    };
  }

  /**
   * Side-effect-free status check via Zibal's /v1/inquiry endpoint.
   * ⚠️ Never use /v1/verify for status checks — verify FINALIZES the payment
   * session (and returns 202 for unpaid sessions). Inquiry only reports.
   */
  async getPaymentStatus(trackId: string): Promise<PaymentResult> {
    const config = getConfig();

    const response = await zibalFetch('inquiry', {
      merchant: config.merchant,
      trackId: Number(trackId),
    });

    if (!response.ok) {
      throw new Error(`Zibal inquiry HTTP ${response.status}`);
    }

    const result = (await parseZibalJson(response, 'inquiry')) as {
      status?: number;
      amount?: number; // rials
      refNumber?: number;
      result: number;
      message: string;
    };

    if (result.result !== ZIBAL_CODES.SUCCESS && result.result !== ZIBAL_CODES.TRACK_ID_NOT_FOUND) {
      throw new Error(`Zibal inquiry rejected: ${result.message} (result: ${result.result})`);
    }

    return {
      providerPaymentId: trackId,
      status: mapInquiryStatus(result.status),
    };
  }
}

/** Create a Zibal provider instance */
export function createZibalProvider(): ZibalProvider {
  return new ZibalProvider();
}
