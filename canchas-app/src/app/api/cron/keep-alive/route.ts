// src/app/api/cron/keep-alive/route.ts
// Endpoint específico para invocación de cron jobs (GitHub Actions, Cron-job.org, Vercel Cron)
// Ejecuta un SELECT liviano que despierta la base de datos Supabase y renueva el contador de 7 días.

import { createServiceClient } from '@/lib/supabase/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  return handleKeepAlive(request)
}

export async function POST(request: NextRequest) {
  return handleKeepAlive(request)
}

async function handleKeepAlive(request: NextRequest) {
  const startTime = Date.now()

  // 1. Verificación segura con verifyCronRequest
  const cronAuth = verifyCronRequest(request)
  if (!cronAuth.authorized) {
    return NextResponse.json({ error: cronAuth.error || 'Unauthorized cron invocation' }, { status: 401 })
  }

  try {
    const supabase = await createServiceClient()

    // 2. Consulta de wake-up directo a la tabla principal del sistema
    const { data, error } = await supabase
      .from('tenants')
      .select('id, name')
      .limit(1)

    const latencyMs = Date.now() - startTime

    if (error) {
      console.error('[KeepAlive Cron] Error consultando Supabase:', error.message)
      return NextResponse.json(
        {
          success: false,
          action: 'keep-alive',
          database: 'error',
          error: error.message,
          latencyMs,
          timestamp: new Date().toISOString(),
        },
        { status: 500 }
      )
    }

    return NextResponse.json(
      {
        success: true,
        action: 'keep-alive',
        database: 'awake',
        message: 'Base de datos Supabase consultada exitosamente. Contador de inactividad reiniciado.',
        latencyMs,
        activeTenants: data?.length ?? 0,
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
    const message = err instanceof Error ? err.message : 'Unknown cron error'
    console.error('[KeepAlive Cron] Excepción:', message)

    return NextResponse.json(
      {
        success: false,
        action: 'keep-alive',
        database: 'unreachable',
        error: message,
        latencyMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    )
  }
}
