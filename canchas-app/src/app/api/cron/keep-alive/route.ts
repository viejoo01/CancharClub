// src/app/api/cron/keep-alive/route.ts
// Endpoint específico para invocación de cron jobs (GitHub Actions, Cron-job.org, Vercel Cron)
// Ejecuta un SELECT liviano que despierta la base de datos Supabase y renueva el contador de 7 días.

import { createServiceClient } from '@/lib/supabase/server'
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

  // 1. Verificación opcional de seguridad con CRON_SECRET si está configurado en .env
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    const querySecret = request.nextUrl.searchParams.get('secret')
    const isValid = authHeader === `Bearer ${cronSecret}` || querySecret === cronSecret
    if (!isValid) {
      return NextResponse.json({ error: 'Unauthorized cron invocation' }, { status: 401 })
    }
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
