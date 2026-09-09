/**
 * Wallet overspend protection — reservation / settle / release
 *
 * Every inference request reserves an estimated cost from the user's wallet
 * before calling the provider. After the provider responds, the reservation
 * is settled to the actual cost (refund surplus / debit overage) or released
 * in full on failure.
 *
 * All operations go through SECURITY DEFINER PostgreSQL RPCs that use
 * SELECT ... FOR UPDATE to prevent concurrent overspend.
 */

import { supabaseAdmin } from '@/supabase/admin'

export interface ReserveResult {
  success: boolean
  reservationId: string | null
  newBalance: number
}

export interface SettleResult {
  success: boolean
  refundAmount: number
}

/**
 * Reserve funds from a user's wallet for an inference request.
 * Debits the estimated cost atomically and creates a pending reservation.
 */
export async function reserveFunds(
  userId: string,
  keyId: string,
  requestId: string,
  estimatedCostToman: number,
): Promise<ReserveResult> {
  const { data, error } = await supabaseAdmin.rpc('reserve_funds_for_inference', {
    p_user_id: userId,
    p_key_id: keyId,
    p_request_id: requestId,
    p_reserved_amount: estimatedCostToman,
  })

  if (error) {
    console.error('[Reservation] Reserve RPC failed:', error.message)
    return { success: false, reservationId: null, newBalance: 0 }
  }

  const row = data?.[0]
  if (!row) {
    return { success: false, reservationId: null, newBalance: 0 }
  }

  return {
    success: row.success,
    reservationId: row.reservation_id as string | null,
    newBalance: Number(row.new_balance),
  }
}

/**
 * Settle a reservation to the actual cost.
 * If reserved > actual: refunds the surplus.
 * If reserved < actual: debits the overage.
 */
export async function settleReservation(
  reservationId: string,
  actualCostToman: number,
  inputTokens: number,
  outputTokens: number,
): Promise<SettleResult> {
  const { data, error } = await supabaseAdmin.rpc('settle_inference_reservation', {
    p_reservation_id: reservationId,
    p_actual_cost: actualCostToman,
    p_input_tokens: inputTokens,
    p_output_tokens: outputTokens,
  })

  if (error) {
    console.error('[Reservation] Settle RPC failed:', error.message)
    return { success: false, refundAmount: 0 }
  }

  const row = data?.[0]
  if (!row) {
    return { success: false, refundAmount: 0 }
  }

  return {
    success: row.success,
    refundAmount: Number(row.refund_amount),
  }
}

/**
 * Release a reservation (refund full amount) when the provider call fails.
 */
export async function releaseReservation(
  reservationId: string,
): Promise<boolean> {
  const { data, error } = await supabaseAdmin.rpc('release_inference_reservation', {
    p_reservation_id: reservationId,
  })

  if (error) {
    console.error('[Reservation] Release RPC failed:', error.message)
    return false
  }

  return data === true
}
