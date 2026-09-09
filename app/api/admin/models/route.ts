import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, logAuditEvent } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/supabase/admin'

export async function GET() {
  try {
    await requireAdmin()

    const { data: models, error } = await supabaseAdmin
      .from('model_catalog')
      .select(`
        id, azura_model_id, public_slug, display_name, provider_id,
        provider_model_id, capabilities, enabled, status,
        created_at, updated_at
      `)
      .order('display_name')

    if (error) throw error

    const providerIds = [...new Set((models ?? []).map((m) => m.provider_id))]
    const providerNames: Record<string, string> = {}

    if (providerIds.length > 0) {
      const { data: providers } = await supabaseAdmin
        .from('providers')
        .select('id, name')
        .in('id', providerIds)

      if (providers) {
        for (const p of providers) {
          providerNames[p.id] = p.name
        }
      }
    }

    return NextResponse.json({
      success: true,
      models: (models ?? []).map((m) => ({
        id: m.id,
        azuraModelId: m.azura_model_id,
        publicSlug: m.public_slug,
        displayName: m.display_name,
        providerId: m.provider_id,
        providerName: providerNames[m.provider_id] ?? 'Unknown',
        providerModelId: m.provider_model_id,
        capabilities: m.capabilities,
        enabled: m.enabled,
        status: m.status,
        createdAt: m.created_at,
        updatedAt: m.updated_at,
      })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }
    console.error('[Admin Models] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const admin = await requireAdmin()
    const body = await request.json()
    const { modelId, enabled, status } = body

    if (!modelId || typeof modelId !== 'string') {
      return NextResponse.json({ success: false, error: 'modelId required' }, { status: 400 })
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(modelId)) {
      return NextResponse.json({ success: false, error: 'Invalid model ID' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (typeof enabled === 'boolean') updates.enabled = enabled
    if (status && ['active', 'deprecated', 'suspended'].includes(status)) updates.status = status

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { success: false, error: 'No valid fields to update' },
        { status: 400 }
      )
    }

    const { data: existing } = await supabaseAdmin
      .from('model_catalog')
      .select('id, enabled, status')
      .eq('id', modelId)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Model not found' }, { status: 404 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('model_catalog')
      .update(updates)
      .eq('id', modelId)

    if (updateError) throw updateError

    await logAuditEvent({
      actorId: admin.id,
      action: 'admin.model.update',
      targetType: 'model',
      targetId: modelId,
      metadata: { changes: updates, previous: { enabled: existing.enabled, status: existing.status } },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }
    console.error('[Admin Models PATCH] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
