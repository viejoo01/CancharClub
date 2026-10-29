// src/app/api/cron/waitlist-cascade/route.ts
// ==============================================================================
// CRON ROUTE — Cascada y expiración de turnos de Lista de Espera (Waitlists)
// Revisa cada 10 minutos si vencieron las ventanas de exclusividad para
// marcar como EXPIRED y notificar de forma automática al siguiente jugador en cola.
// ==============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { advanceWaitlistCascade } from '@/actions/waitlist.actions'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  return handleCascade(request)
}

export async function POST(request: NextRequest) {
  return handleCascade(request)
}

async function handleCascade(request: NextRequest) {
  const startTime = Date.now()

  // 1. Verificación segura con Bearer o ?secret=
  const cronAuth = verifyCronRequest(request)
  if (!cronAuth.authorized) {
    return NextResponse.json(
      { error: cronAuth.error || 'Unauthorized cron invocation' },
      { status: 401 }
    )
  }

  try {
    // 2. Ejecutar cascada global para todos los turnos en espera vencidos
    const cascadeResult = await advanceWaitlistCascade()

    const durationMs = Date.now() - startTime

    console.log(
      `[Waitlist Cascade Cron] Completado en ${durationMs}ms. ${cascadeResult.expiredCount} expirados, ${cascadeResult.cascadedCount} promovidos.`
    )

    return NextResponse.json({
      success: true,
      action: 'waitlist-cascade',
      expiredCount: cascadeResult.expiredCount,
      cascadedCount: cascadeResult.cascadedCount,
      durationMs,
    })
  } catch (err) {
    console.error('[Waitlist Cascade Cron] Error:', err)
    return NextResponse.json(
      { error: 'Error interno en waitlist cascade cron' },
      { status: 500 }
    )
  }
}
