import { getServerUser } from '@/lib/auth/server'
import { supabaseAdmin } from '@/supabase/admin'

/**
 * Server-side admin authorization.
 * Returns the authenticated user ONLY if they have admin role.
 * Every admin API route must call this independently.
 */
export async function requireAdmin() {
  const user = await getServerUser()

  const { data, error } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', user.id)
    .single()

  if (error || !data || data.role !== 'admin') {
    throw new Error('Forbidden')
  }

  return user
}

/**
 * Check if a user is admin without throwing.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('users')
    .select('role')
    .eq('id', userId)
    .single()

  if (error || !data) return false
  return data.role === 'admin'
}

/**
 * Append an audit log event. Never logs secrets.
 */
export async function logAuditEvent(params: {
  actorId: string
  action: string
  targetType: string
  targetId?: string
  result?: 'success' | 'failure' | 'denied'
  metadata?: Record<string, unknown>
}) {
  const { actorId, action, targetType, targetId, result = 'success', metadata = {} } = params

  await supabaseAdmin.rpc('log_audit_event', {
    p_actor_id: actorId,
    p_action: action,
    p_target_type: targetType,
    p_target_id: targetId ?? null,
    p_result: result,
    p_metadata: metadata,
  })
}
