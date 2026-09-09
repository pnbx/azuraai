/**
 * Wallet / Ledger Operations
 *
 * - All monetary values are integer BIGINT (Toman, 1 Toman = 10 IRR)
 * - Uses server-side admin client (bypasses RLS) for atomic transactions
 * - Every mutation creates an immutable wallet_transactions row
 * - Prevents negative balances
 * - Uses SELECT ... FOR UPDATE to prevent race conditions
 */

import { supabaseAdmin } from '@/supabase/admin'

export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'usage_charge'
  | 'refund'
  | 'adjustment'

export interface WalletOperationResult {
  success: boolean
  balanceCents: number
  transactionId?: string
  error?: string
}

/**
 * Get the current balance for a user.
 * Reads from balances table (which has RLS: SELECT own only).
 * If no row exists, creates one with 0 balance.
 */
export async function getBalance(userId: string): Promise<{
  balanceCents: number
  currency: string
  updatedAt: string
}> {
  const { data, error } = await supabaseAdmin
    .from('balances')
    .select('balance_cents, currency, updated_at')
    .eq('user_id', userId)
    .single()

  if (error) {
    if (error.code === 'PGRST116') {
      // No balance row exists — create one
      return await createInitialBalance(userId)
    }
    throw new Error(`Failed to fetch balance: ${error.message}`)
  }

  return {
    balanceCents: Number(data.balance_cents),
    currency: data.currency,
    updatedAt: data.updated_at,
  }
}

/**
 * Create an initial balance row for a user (if one doesn't exist).
 */
async function createInitialBalance(userId: string): Promise<{
  balanceCents: number
  currency: string
  updatedAt: string
}> {
  const { data, error } = await supabaseAdmin
    .from('balances')
    .upsert(
      { user_id: userId, balance_cents: 0, currency: 'TOMAN' },
      { onConflict: 'user_id' }
    )
    .select('balance_cents, currency, updated_at')
    .single()

  if (error) {
    throw new Error(`Failed to create initial balance: ${error.message}`)
  }

  return {
    balanceCents: Number(data.balance_cents),
    currency: data.currency,
    updatedAt: data.updated_at,
  }
}

/**
 * Get wallet transaction history for a user.
 * RLS ensures users can only see their own rows.
 */
export async function getWalletTransactions(userId: string, limit = 50): Promise<
  Array<{
    id: string
    transactionType: TransactionType
    amountCents: number
    currency: string
    balanceBeforeCents: number
    balanceAfterCents: number
    referenceId: string | null
    status: string
    metadata: Record<string, unknown>
    createdAt: string
  }>
> {
  const { data, error } = await supabaseAdmin
    .from('wallet_transactions')
    .select(
      'id, transaction_type, amount_cents, currency, balance_before_cents, balance_after_cents, reference_id, status, metadata, created_at'
    )
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) {
    throw new Error(`Failed to fetch wallet transactions: ${error.message}`)
  }

  return data.map((row) => ({
    id: row.id,
    transactionType: row.transaction_type,
    amountCents: Number(row.amount_cents),
    currency: row.currency,
    balanceBeforeCents: Number(row.balance_before_cents),
    balanceAfterCents: Number(row.balance_after_cents),
    referenceId: row.reference_id,
    status: row.status,
    metadata: row.metadata ?? {},
    createdAt: row.created_at,
  }))
}

/**
 * Credit (deposit) funds to a user's balance.
 * Atomically updates balances and inserts wallet_transactions row.
 * Uses a database transaction with SELECT ... FOR UPDATE to prevent races.
 */
export async function creditBalance(
  userId: string,
  amountCents: number,
  referenceId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<WalletOperationResult> {
  if (amountCents <= 0) {
    return { success: false, balanceCents: 0, error: 'Amount must be positive' }
  }

  try {
    // Use a PostgreSQL transaction with FOR UPDATE lock
    const { data, error } = await supabaseAdmin.rpc('credit_balance', {
      p_user_id: userId,
      p_amount_cents: amountCents,
      p_reference_id: referenceId,
      p_metadata: metadata,
    })

    if (error) {
      throw new Error(`RPC credit_balance failed: ${error.message}`)
    }

    return {
      success: true,
      balanceCents: Number(data.new_balance_cents),
      transactionId: data.transaction_id,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, balanceCents: 0, error: msg }
  }
}

/**
 * Debit (withdraw/charge) funds from a user's balance.
 * Atomically checks balance, updates, and inserts wallet_transactions row.
 * Fails if balance would go negative.
 */
export async function debitBalance(
  userId: string,
  amountCents: number,
  referenceId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<WalletOperationResult> {
  if (amountCents <= 0) {
    return { success: false, balanceCents: 0, error: 'Amount must be positive' }
  }

  try {
    const { data, error } = await supabaseAdmin.rpc('debit_balance', {
      p_user_id: userId,
      p_amount_cents: amountCents,
      p_reference_id: referenceId,
      p_metadata: metadata,
    })

    if (error) {
      throw new Error(`RPC debit_balance failed: ${error.message}`)
    }

    return {
      success: true,
      balanceCents: Number(data.new_balance_cents),
      transactionId: data.transaction_id,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, balanceCents: 0, error: msg }
  }
}

/**
 * Adjust balance (can be positive or negative, for refunds/adjustments).
 * Use with caution — prefer creditBalance/debitBalance for normal operations.
 */
export async function adjustBalance(
  userId: string,
  amountCents: number, // can be negative
  referenceId: string | null,
  metadata: Record<string, unknown> = {}
): Promise<WalletOperationResult> {
  if (amountCents === 0) {
    return { success: false, balanceCents: 0, error: 'Amount must not be zero' }
  }

  // For negative adjustments, use debit logic; for positive, use credit logic
  if (amountCents > 0) {
    return creditBalance(userId, amountCents, referenceId, metadata)
  } else {
    return debitBalance(userId, -amountCents, referenceId, metadata)
  }
}

export interface RevokeApiKeyResult {
  success: boolean
  keyId: string
  error?: string
}

/**
 * Revoke an API key for a user.
 * Uses server-side admin client with ownership verification.
 */
export async function revokeApiKey(
  userId: string,
  keyId: string
): Promise<RevokeApiKeyResult> {
  try {
    const { data, error } = await supabaseAdmin.rpc('revoke_api_key', {
      p_key_id: keyId,
      p_user_id: userId,
    })

    if (error) {
      throw new Error(`RPC revoke_api_key failed: ${error.message}`)
    }

    return {
      success: data,
      keyId: keyId,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return { success: false, keyId: keyId, error: msg }
  }
}

const walletExport = {
  getBalance,
  getWalletTransactions,
  creditBalance,
  debitBalance,
  adjustBalance,
  revokeApiKey,
}

export default walletExport