/**
 * Payment Engine Constants
 *
 * Single source of truth for all monetary/payment configuration.
 * All values are in integer Toman (1 Toman = 10 IRR).
 */

/** Internal currency code for the wallet */
export const PAYMENT_CURRENCY = 'TOMAN' as const;

/** Minimum funding amount in Toman */
export const MIN_FUNDING_TOMAN = 10_000;

/** Maximum funding amount in Toman */
export const MAX_FUNDING_TOMAN = 10_000_000;

/** Supported currencies */
export const SUPPORTED_CURRENCIES = ['TOMAN'] as const;

/** Valid payment statuses (state machine) */
export const PAYMENT_STATUSES = [
  'created',
  'pending',
  'processing',
  'succeeded',
  'failed',
  'cancelled',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/** Legal state transitions */
export const VALID_TRANSITIONS: Record<PaymentStatus, readonly PaymentStatus[]> = {
  created: ['pending', 'cancelled'],
  pending: ['processing', 'cancelled'],
  processing: ['succeeded', 'failed'],
  succeeded: [], // terminal
  failed: [], // terminal
  cancelled: [], // terminal
};
