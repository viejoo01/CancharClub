// src/app/api/cron/recurring-slots-rollforward/route.ts
// ==============================================================================
// CRON ROUTE — Roll-forward diario de turnos fijos (abonados)
// Proyecta y genera de forma continua las reservas de los abonados activos
// para asegurar que las próximas 4 semanas estén blindadas contra sobreventa.
// ==============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { rollForwardActiveRecurringSlots } from '@/actions/recurring-slots.actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  return handleRollforward(request)
}

export async function POST(request: NextRequest) {
  return handleRollforward(request)
}

async function handleRollforward(request: NextRequest) {
  const startTime = Date.now()

  // 1. Verificación segura con Bearer o ?secret=
  const cronAuth = verifyCronRequest(request)
  if (!cronAuth.authorized) {
    return NextResponse.json({ error: cronAuth.error || 'Unauthorized cron invocation' }, { status: 401 })
  }

  try {
    const supabase = await createServiceClient()
    const { data: tenants, error: tenantsErr } = await supabase
      .from('tenants')
      .select('id, name')
      .neq('is_active', false)

    if (tenantsErr || !tenants) {
      return NextResponse.json({ error: 'Error al consultar clubes' }, { status: 500 })
    }

    const results: Array<{ tenantId: string; clubName: string; generatedCount: number }> = []

    for (const t of tenants) {
      try {
        const res = await rollForwardActiveRecurringSlots(t.id, { skipAuth: true })
        if (res.success && res.generatedTotal > 0) {
          results.push({
            tenantId: t.id,
            clubName: t.name || 'Club',
            generatedCount: res.generatedTotal,
          })
        }
      } catch (slotErr) {
        console.warn(`[Recurring Slots Rollforward] Error para club ${t.id}:`, slotErr)
      }
    }

    const durationMs = Date.now() - startTime
    const totalGenerated = results.reduce((acc, r) => acc + r.generatedCount, 0)

    console.log(`[Recurring Slots Rollforward] Cron completado en ${durationMs}ms. ${totalGenerated} turnos proyectados en ${results.length} clubes.`)

    return NextResponse.json({
      success: true,
      action: 'recurring-slots-rollforward',
      totalGenerated,
      affectedClubsCount: results.length,
      details: results,
      durationMs,
    })
  } catch (err) {
    console.error('[Recurring Slots Rollforward] Error general:', err)
    return NextResponse.json({ error: 'Error interno en rollforward cron' }, { status: 500 })
  }
}
