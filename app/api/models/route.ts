import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { listEnabledModels } from '@/lib/provider/model-catalog'

export async function GET() {
  try {
    try {
      await getServerUser()
    } catch {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }

    const models = await listEnabledModels()

    return NextResponse.json({
      success: true,
      models: models.map((m) => ({
        id: m.id,
        azuraModelId: m.azura_model_id,
        publicSlug: m.public_slug,
        displayName: m.display_name,
        capabilities: m.capabilities,
        status: m.status,
        createdAt: m.created_at,
      })),
    })
  } catch (error) {
    console.error('[Models API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
