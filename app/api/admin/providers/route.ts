import { NextResponse, type NextRequest } from 'next/server'
import { requireAdmin, logAuditEvent } from '@/lib/auth/admin'
import { supabaseAdmin } from '@/supabase/admin'

export async function GET() {
  try {
    await requireAdmin()

    const { data: providers, error } = await supabaseAdmin
      .from('providers')
      .select('id, name, base_url, api_version, auth_method, provider_registry_id, metadata, created_at, updated_at')

    if (error) throw error

    const modelCounts: Record<string, number> = {}
    const { data: models } = await supabaseAdmin
      .from('model_catalog')
      .select('provider_id, enabled')

    if (models) {
      for (const m of models) {
        if (m.enabled) {
          modelCounts[m.provider_id] = (modelCounts[m.provider_id] ?? 0) + 1
        }
      }
    }

    return NextResponse.json({
      success: true,
      providers: (providers ?? []).map((p) => ({
        id: p.id,
        name: p.name,
        baseUrl: p.base_url,
        apiVersion: p.api_version,
        authMethod: p.auth_method,
        registryId: p.provider_registry_id,
        enabledModels: modelCounts[p.id] ?? 0,
        createdAt: p.created_at,
        updatedAt: p.updated_at,
      })),
    })
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }
    console.error('[Admin Providers] Error:', error)
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
    const { providerId, metadata } = body

    if (!providerId || typeof providerId !== 'string') {
      return NextResponse.json({ success: false, error: 'providerId required' }, { status: 400 })
    }

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(providerId)) {
      return NextResponse.json({ success: false, error: 'Invalid provider ID' }, { status: 400 })
    }

    if (!metadata || typeof metadata !== 'object') {
      return NextResponse.json(
        { success: false, error: 'metadata object required' },
        { status: 400 }
      )
    }

    // Only allow safe metadata fields
    const allowedFields = ['description', 'display_name', 'priority']
    const safeMetadata: Record<string, unknown> = {}
    for (const key of Object.keys(metadata)) {
      if (allowedFields.includes(key)) {
        safeMetadata[key] = metadata[key]
      }
    }

    const { data: existing } = await supabaseAdmin
      .from('providers')
      .select('id, name, metadata')
      .eq('id', providerId)
      .single()

    if (!existing) {
      return NextResponse.json({ success: false, error: 'Provider not found' }, { status: 404 })
    }

    const { error: updateError } = await supabaseAdmin
      .from('providers')
      .update({ metadata: { ...(existing.metadata ?? {}), ...safeMetadata } })
      .eq('id', providerId)

    if (updateError) throw updateError

    await logAuditEvent({
      actorId: admin.id,
      action: 'admin.provider.update',
      targetType: 'provider',
      targetId: providerId,
      metadata: { changes: safeMetadata, providerName: existing.name },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof Error && error.message === 'Forbidden') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }
    if (error instanceof Error && error.message === 'Unauthenticated') {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }
    console.error('[Admin Providers PATCH] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
