// src/app/api/health/route.ts
// Health check y Keep-Alive para mantener despierta la base de datos Supabase
// Previene el auto-pausado del plan Free de Supabase tras 7 días de inactividad.

import { createServiceClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET() {
  const startTime = Date.now()

  try {
    const supabase = await createServiceClient()

    // 1. Consulta liviana y directa a la base de datos para resetear el timer de inactividad
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name')
      .limit(1)

    const latencyMs = Date.now() - startTime

    if (error) {
      console.error('[HealthCheck] Error al consultar Supabase:', error.message)
      return NextResponse.json(
        {
          status: 'degraded',
          database: 'error',
          error: error.message,
          latencyMs,
          timestamp: new Date().toISOString(),
        },
        { status: 503 }
      )
    }

    return NextResponse.json(
      {
        status: 'healthy',
        database: 'awake',
        tenantsFound: data?.length ?? 0,
        latencyMs,
        environment: process.env.NODE_ENV || 'production',
        timestamp: new Date().toISOString(),
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        },
      }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown health error'
    console.error('[HealthCheck] Excepción no controlada:', message)

    return NextResponse.json(
      {
        status: 'unhealthy',
        database: 'unreachable',
        error: message,
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
