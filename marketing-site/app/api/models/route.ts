import { NextResponse } from 'next/server'
import { getServerUser } from '@/lib/auth/server'
import { listEnabledModels } from '@/lib/provider/model-catalog'
import { getModelPlanAccess, type ModelAccess } from '@/lib/subscriptions-access'
import { supabaseAdmin } from '@/supabase/admin'

export async function GET() {
  try {
    let user;
    try {
      user = await getServerUser()
    } catch {
      return NextResponse.json({ success: false, error: 'Unauthenticated' }, { status: 401 })
    }

    const models = await listEnabledModels()

    // Server-resolved plan access per model (for selector locks).
    const access = await getModelPlanAccess(user.id)

    // Pricing (Toman per million tokens) where configured.
    const { data: pricingRows } = await supabaseAdmin
      .from('pricing_rules')
      .select('model_id, input_price_per_million_tokens, output_price_per_million_tokens, effective_at, expires_at')
      .lte('effective_at', new Date().toISOString())
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .order('effective_at', { ascending: false })

    const priceByModel = new Map<string, { in: number; out: number }>();
    for (const p of pricingRows ?? []) {
      if (!priceByModel.has(p.model_id)) {
        priceByModel.set(p.model_id, {
          in: Number(p.input_price_per_million_tokens) || 0,
          out: Number(p.output_price_per_million_tokens) || 0,
        });
      }
    }

    return NextResponse.json({
      success: true,
      plan: access.plan,
      subscribed: access.subscribed,
      models: models.map((m) => {
        const a: ModelAccess = access.forModel(m.public_slug);
        const price = priceByModel.get(m.id);
        return {
          id: m.id,
          azuraModelId: m.azura_model_id,
          publicSlug: m.public_slug,
          displayName: m.display_name,
          capabilities: m.capabilities,
          status: m.status,
          createdAt: m.created_at,
          allowed: a.allowed,
          requiredPlan: a.requiredPlan,
          isPremiumAllowance: a.isPremiumAllowance,
          pricing: price ?? null,
        };
      }),
    })
  } catch (error) {
    console.error('[Models API] Error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    )
  }
}
