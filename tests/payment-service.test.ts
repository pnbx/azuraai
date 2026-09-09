/**
 * Payment Service Tests — financial invariants, not happy paths.
 *
 * Mock strategy: counter-based mockImplementation for from().
 * jest.mockReturnValueOnce() doesn't work reliably with jest.mock() factory
 * functions after mockReset() in this Jest version. mockImplementation with
 * a per-test counter is deterministic and has no queue state issues.
 */

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { MockPaymentProvider, createMockPaymentProvider } from '../lib/payment/mock-provider';
import {
  PAYMENT_CURRENCY,
  MIN_FUNDING_TOMAN,
  MAX_FUNDING_TOMAN,
  VALID_TRANSITIONS,
} from '../lib/payment/constants';

jest.mock('@/supabase/admin', () => ({
  supabaseAdmin: {
    from: jest.fn(),
    rpc: jest.fn(),
  },
}));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getAdmin(): { from: jest.Mock; rpc: jest.Mock } {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (jest.requireMock('@/supabase/admin') as any).supabaseAdmin;
}

const TEST_USER_ID = 'test-user-id-12345';
const TEST_IDEMPOTENCY_KEY = 'idempotency-key-abc-123';
const TEST_AMOUNT = 50_000;

function intentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'test-intent-id', user_id: TEST_USER_ID, amount_toman: TEST_AMOUNT,
    currency: PAYMENT_CURRENCY, provider: 'mock-provider', provider_payment_id: null,
    status: 'created', wallet_transaction_id: null, idempotency_key: TEST_IDEMPOTENCY_KEY,
    created_at: '2026-09-22T00:00:00Z', succeeded_at: null, failed_at: null, failure_reason: null,
    ...overrides,
  };
}

function pgErr(code: string, message = 'error') {
  return { code, message, details: '', hint: '' };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(data: any = null, error: any = null): any {
  const result = { data, error };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const c: any = {};
  c.select = () => c;
  c.eq = () => c;
  c.update = () => c;
  c.single = jest.fn().mockReturnValue(Promise.resolve(result));
  c.insert = jest.fn().mockReturnValue(Promise.resolve(result));
  return c;
}

// Counter-based mock: from(table) returns chains[0], chains[1], etc.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mockFromChains(chains: any[]) {
  let idx = 0;
  return (..._args: unknown[]) => {
    if (idx >= chains.length) throw new Error(`from() called ${idx + 1} times but only ${chains.length} chains provided`);
    return chains[idx++];
  };
}

// Lazy import
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let createPaymentIntent: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let handleWebhookEvent: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let getPaymentIntent: any;

beforeAll(async () => {
  const svc = await import('../lib/payment/service');
  createPaymentIntent = svc.createPaymentIntent;
  handleWebhookEvent = svc.handleWebhookEvent;
  getPaymentIntent = svc.getPaymentIntent;
});

describe('Payment Service', () => {
  let mockProvider: MockPaymentProvider;
  let from: jest.Mock;
  let rpc: jest.Mock;

  beforeEach(async () => {
    const admin = getAdmin();
    from = admin.from;
    rpc = admin.rpc;
    from.mockReset();
    rpc.mockReset();
    mockProvider = createMockPaymentProvider();
  });

  afterEach(() => {
    mockProvider.reset();
  });

  describe('createPaymentIntent', () => {
    it('rejects zero amount', async () => {
      await expect(
        createPaymentIntent(TEST_USER_ID, 0, TEST_IDEMPOTENCY_KEY, mockProvider)
      ).rejects.toMatchObject({ code: 'invalid_amount' });
    });

    it('rejects negative amount', async () => {
      await expect(
        createPaymentIntent(TEST_USER_ID, -1000, TEST_IDEMPOTENCY_KEY, mockProvider)
      ).rejects.toMatchObject({ code: 'invalid_amount' });
    });

    it('rejects non-integer amount', async () => {
      await expect(
        createPaymentIntent(TEST_USER_ID, 100.5, TEST_IDEMPOTENCY_KEY, mockProvider)
      ).rejects.toMatchObject({ code: 'invalid_amount' });
    });

    it('rejects amount below minimum', async () => {
      await expect(
        createPaymentIntent(TEST_USER_ID, MIN_FUNDING_TOMAN - 1, TEST_IDEMPOTENCY_KEY, mockProvider)
      ).rejects.toMatchObject({ code: 'amount_below_minimum' });
    });

    it('rejects amount above maximum', async () => {
      await expect(
        createPaymentIntent(TEST_USER_ID, MAX_FUNDING_TOMAN + 1, TEST_IDEMPOTENCY_KEY, mockProvider)
      ).rejects.toMatchObject({ code: 'amount_above_maximum' });
    });

    it('rejects empty idempotency key', async () => {
      await expect(
        createPaymentIntent(TEST_USER_ID, TEST_AMOUNT, '', mockProvider)
      ).rejects.toMatchObject({ code: 'invalid_idempotency_key' });
    });

    it('accepts exact minimum boundary', async () => {
      from.mockImplementation(mockFromChains([
        chain(null, pgErr('PGRST116')),
        chain(intentRow({ amount_toman: MIN_FUNDING_TOMAN })),
        chain(null),
        chain(intentRow({ amount_toman: MIN_FUNDING_TOMAN, status: 'pending' })),
      ]));
      const result = await createPaymentIntent(TEST_USER_ID, MIN_FUNDING_TOMAN, TEST_IDEMPOTENCY_KEY, mockProvider);
      expect(result.intent.amountToman).toBe(MIN_FUNDING_TOMAN);
      expect(result.intent.status).toBe('pending');
    });

    it('accepts exact maximum boundary', async () => {
      from.mockImplementation(mockFromChains([
        chain(null, pgErr('PGRST116')),
        chain(intentRow({ amount_toman: MAX_FUNDING_TOMAN })),
        chain(null),
        chain(intentRow({ amount_toman: MAX_FUNDING_TOMAN, status: 'pending' })),
      ]));
      const result = await createPaymentIntent(TEST_USER_ID, MAX_FUNDING_TOMAN, TEST_IDEMPOTENCY_KEY, mockProvider);
      expect(result.intent.amountToman).toBe(MAX_FUNDING_TOMAN);
    });

    it('returns existing intent for same user + idempotency key', async () => {
      from.mockImplementation(mockFromChains([
        chain(intentRow({ id: 'existing-intent-id', status: 'pending' })),
      ]));
      const result = await createPaymentIntent(TEST_USER_ID, TEST_AMOUNT, TEST_IDEMPOTENCY_KEY, mockProvider);
      expect(result.intent.id).toBe('existing-intent-id');
    });

    it('returns existing intent when insert hits unique constraint (race)', async () => {
      from.mockImplementation(mockFromChains([
        chain(null, pgErr('PGRST116')),
        chain(null, pgErr('23505', 'duplicate')),
        chain(intentRow({ id: 'existing-race-id', status: 'pending' })),
      ]));
      const result = await createPaymentIntent(TEST_USER_ID, TEST_AMOUNT, TEST_IDEMPOTENCY_KEY, mockProvider);
      expect(result.intent.id).toBe('existing-race-id');
    });

    it('marks intent as failed if provider call fails', async () => {
      from.mockImplementation(mockFromChains([
        chain(null, pgErr('PGRST116')),
        chain(intentRow()),
        chain(null),
      ]));
      const failingProvider = createMockPaymentProvider();
      jest.spyOn(failingProvider, 'createPayment').mockRejectedValue(new Error('down'));
      await expect(
        createPaymentIntent(TEST_USER_ID, TEST_AMOUNT, TEST_IDEMPOTENCY_KEY, failingProvider)
      ).rejects.toMatchObject({ code: 'provider_error' });
    });
  });

  describe('handleWebhookEvent', () => {
    const pid = 'test-intent-id-001';
    const ppid = 'mock_pay_001';
    const eid = 'evt_001';
    const amt = TEST_AMOUNT;

    it('rejects invalid webhook signature', async () => {
      await expect(
        handleWebhookEvent(mockProvider, { 'x-mock-signature': 'wrong' },
          JSON.stringify({ eventId: eid, eventType: 'payment.succeeded', paymentId: ppid, amountToman: amt, currency: PAYMENT_CURRENCY }))
      ).rejects.toThrow();
    });

    it('rejects malformed webhook body', async () => {
      await expect(
        handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() }, 'not json')
      ).rejects.toThrow();
    });

    it('processes valid payment.succeeded webhook', async () => {
      rpc.mockResolvedValue({ data: { wallet_transaction_id: 'wtx', new_balance: 50000, already_processed: false }, error: null } as never);
      from.mockImplementation(mockFromChains([
        chain(null), // insert event
        chain({ // select intent
          id: pid, user_id: TEST_USER_ID, amount_toman: amt, currency: PAYMENT_CURRENCY,
          provider: 'mock-provider', provider_payment_id: ppid, status: 'processing', wallet_transaction_id: null,
        }),
        chain(null), // update event
        chain(null), // update intent
      ]));
      const result = await handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
        JSON.stringify({ eventId: eid, eventType: 'payment.succeeded', paymentId: ppid, amountToman: amt, currency: PAYMENT_CURRENCY }));
      expect(result.processed).toBe(true);
      expect(rpc).toHaveBeenCalledWith('process_successful_payment', expect.objectContaining({ p_payment_intent_id: pid, p_amount_toman: amt }));
    });

    it('credits wallet exactly once for duplicate webhook', async () => {
      rpc.mockResolvedValue({ data: { wallet_transaction_id: 'wtx', new_balance: 50000, already_processed: false }, error: null } as never);
      // First webhook: full succeeded flow
      from.mockImplementation(mockFromChains([
        chain(null),
        chain({ id: pid, user_id: TEST_USER_ID, amount_toman: amt, currency: PAYMENT_CURRENCY,
          provider: 'mock-provider', provider_payment_id: ppid, status: 'processing', wallet_transaction_id: null }),
        chain(null),
        chain(null),
      ]));
      await handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
        JSON.stringify({ eventId: eid, eventType: 'payment.succeeded', paymentId: ppid, amountToman: amt, currency: PAYMENT_CURRENCY }));
      expect(rpc).toHaveBeenCalledTimes(1);

      // Second webhook: duplicate event (insert fails 23505, select existing)
      from.mockImplementation(mockFromChains([
        chain(null, pgErr('23505', 'dup')),
        chain({ processed: true, payment_intent_id: pid }),
      ]));
      const r2 = await handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
        JSON.stringify({ eventId: eid, eventType: 'payment.succeeded', paymentId: ppid, amountToman: amt, currency: PAYMENT_CURRENCY }));
      expect(r2.processed).toBe(true);
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('rejects webhook with amount mismatch', async () => {
      from.mockImplementation(mockFromChains([
        chain(null),
        chain({ id: pid, user_id: TEST_USER_ID, amount_toman: amt, currency: PAYMENT_CURRENCY,
          provider: 'mock-provider', provider_payment_id: ppid, status: 'processing', wallet_transaction_id: null }),
      ]));
      await expect(
        handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
          JSON.stringify({ eventId: eid, eventType: 'payment.succeeded', paymentId: ppid, amountToman: 60000, currency: PAYMENT_CURRENCY }))
      ).rejects.toThrow();
    });

    it('handles payment.failed webhook', async () => {
      from.mockImplementation(mockFromChains([
        chain(null), // insert event
        chain({ // select intent (status must be 'processing' for failed to be valid)
          id: pid, user_id: TEST_USER_ID, amount_toman: amt, currency: PAYMENT_CURRENCY,
          provider: 'mock-provider', provider_payment_id: ppid, status: 'processing', wallet_transaction_id: null,
        }),
        chain(null), // update intent
        chain(null), // update event
      ]));
      const result = await handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
        JSON.stringify({ eventId: eid, eventType: 'payment.failed', paymentId: ppid, amountToman: amt, currency: PAYMENT_CURRENCY }));
      expect(result.processed).toBe(true);
      expect(rpc).not.toHaveBeenCalled();
    });

    it('ignores unknown payment intent', async () => {
      from.mockImplementation(mockFromChains([
        chain(null),
        chain(null, pgErr('PGRST116')),
        chain(null),
      ]));
      const result = await handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
        JSON.stringify({ eventId: eid, eventType: 'payment.succeeded', paymentId: 'nonexistent', amountToman: amt, currency: PAYMENT_CURRENCY }));
      expect(result.processed).toBe(false);
    });

    it('idempotent: already-processed event returns processed=true', async () => {
      from.mockImplementation(mockFromChains([
        chain(null, pgErr('23505', 'dup')),
        chain({ processed: true, payment_intent_id: pid }),
      ]));
      const result = await handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
        JSON.stringify({ eventId: eid, eventType: 'payment.succeeded', paymentId: ppid, amountToman: amt, currency: PAYMENT_CURRENCY }));
      expect(result.processed).toBe(true);
      expect(rpc).not.toHaveBeenCalled();
    });
  });

  describe('getPaymentIntent', () => {
    it('returns intent for owning user', async () => {
      from.mockImplementation(mockFromChains([
        chain(intentRow({ id: 'i1', status: 'succeeded', provider_payment_id: 'p1', wallet_transaction_id: 't1', succeeded_at: '2026-09-22T00:01:00Z' })),
      ]));
      const result = await getPaymentIntent(TEST_USER_ID, 'i1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('i1');
    });

    it('returns null for non-owning user', async () => {
      from.mockImplementation(mockFromChains([
        chain(null, pgErr('PGRST116')),
      ]));
      const result = await getPaymentIntent('other', 'i1');
      expect(result).toBeNull();
    });
  });

  describe('Financial Invariants', () => {
    it('wallet credit total <= verified payment total', async () => {
      rpc.mockResolvedValue({ data: { wallet_transaction_id: 'tx', new_balance: 50000, already_processed: false }, error: null } as never);
      from.mockImplementation(mockFromChains([
        chain(null),
        chain({ id: 'i1', user_id: TEST_USER_ID, amount_toman: 50000, currency: PAYMENT_CURRENCY,
          provider: 'mock-provider', provider_payment_id: 'pay1', status: 'processing', wallet_transaction_id: null }),
        chain(null),
        chain(null),
      ]));
      await handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
        JSON.stringify({ eventId: 'e1', eventType: 'payment.succeeded', paymentId: 'pay1', amountToman: 50000, currency: PAYMENT_CURRENCY }));
      expect(rpc).toHaveBeenCalledWith('process_successful_payment', expect.objectContaining({ p_amount_toman: 50000 }));
    });

    it('each payment produces at most one wallet credit', async () => {
      rpc.mockResolvedValue({ data: { wallet_transaction_id: 'tx', new_balance: 10000, already_processed: false }, error: null } as never);
      from.mockImplementation(mockFromChains([
        chain(null),
        chain({ id: 'id1', user_id: TEST_USER_ID, amount_toman: 10000, currency: PAYMENT_CURRENCY,
          provider: 'mock-provider', provider_payment_id: 'pd1', status: 'processing', wallet_transaction_id: null }),
        chain(null),
        chain(null),
      ]));
      await handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
        JSON.stringify({ eventId: 'ed1', eventType: 'payment.succeeded', paymentId: 'pd1', amountToman: 10000, currency: PAYMENT_CURRENCY }));
      expect(rpc).toHaveBeenCalledTimes(1);

      // Duplicate webhook: event insert fails, select existing
      from.mockImplementation(mockFromChains([
        chain(null, pgErr('23505', 'dup')),
        chain({ processed: true, payment_intent_id: 'id1' }),
      ]));
      await handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
        JSON.stringify({ eventId: 'ed1', eventType: 'payment.succeeded', paymentId: 'pd1', amountToman: 10000, currency: PAYMENT_CURRENCY }));
      expect(rpc).toHaveBeenCalledTimes(1);
    });

    it('client input cannot influence wallet credit amount', async () => {
      from.mockImplementation(mockFromChains([
        chain(null),
        chain({ id: 'im', user_id: TEST_USER_ID, amount_toman: 10000, currency: PAYMENT_CURRENCY,
          provider: 'mock-provider', provider_payment_id: 'pm', status: 'processing', wallet_transaction_id: null }),
      ]));
      await expect(
        handleWebhookEvent(mockProvider, { 'x-mock-signature': mockProvider.getWebhookSecret() },
          JSON.stringify({ eventId: 'em', eventType: 'payment.succeeded', paymentId: 'pm', amountToman: 999999, currency: PAYMENT_CURRENCY }))
      ).rejects.toThrow();
    });
  });

  describe('State Machine', () => {
    it('defines valid terminal states', () => {
      expect(VALID_TRANSITIONS.succeeded).toEqual([]);
      expect(VALID_TRANSITIONS.failed).toEqual([]);
      expect(VALID_TRANSITIONS.cancelled).toEqual([]);
    });
    it('allows created → pending', () => expect(VALID_TRANSITIONS.created).toContain('pending'));
    it('allows pending → processing', () => expect(VALID_TRANSITIONS.pending).toContain('processing'));
    it('allows processing → succeeded', () => expect(VALID_TRANSITIONS.processing).toContain('succeeded'));
    it('allows processing → failed', () => expect(VALID_TRANSITIONS.processing).toContain('failed'));
    it('does not allow succeeded → any state', () => expect(VALID_TRANSITIONS.succeeded.length).toBe(0));
  });

  describe('Currency', () => {
    it('uses TOMAN', () => expect(PAYMENT_CURRENCY).toBe('TOMAN'));
    it('amounts are integers', () => {
      expect(Number.isInteger(MIN_FUNDING_TOMAN)).toBe(true);
      expect(Number.isInteger(MAX_FUNDING_TOMAN)).toBe(true);
    });
  });
});
