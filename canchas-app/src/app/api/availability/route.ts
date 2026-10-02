// src/app/api/availability/route.ts
// API Route: Disponibilidad pública de una cancha por rango de fechas
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'
  )
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const courtId = searchParams.get('court_id')
  const dateFrom = searchParams.get('date_from')
  const dateTo = searchParams.get('date_to')

  if (!courtId || !dateFrom || !dateTo) {
    return NextResponse.json({ error: 'Parámetros requeridos: court_id, date_from, date_to' }, { status: 400 })
  }

  // 1. ESCUDO ANTI-INYECCIÓN: Validar que court_id sea un UUID válido
  const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(courtId)
  if (!isUUID) {
    return NextResponse.json({ error: 'court_id inválido' }, { status: 400 })
  }

  // 2. ESCUDO ANTI-DOS: Validar formato de fechas YYYY-MM-DD
  const dateRegex = /^\d{4}-\d{2}-\d{2}$/
  if (!dateRegex.test(dateFrom) || !dateRegex.test(dateTo)) {
    return NextResponse.json({ error: 'Formato de fecha inválido. Usar YYYY-MM-DD' }, { status: 400 })
  }

  const dFrom = new Date(`${dateFrom}T00:00:00Z`)
  const dTo = new Date(`${dateTo}T00:00:00Z`)
  if (isNaN(dFrom.getTime()) || isNaN(dTo.getTime())) {
    return NextResponse.json({ error: 'Fechas cronológicas inválidas' }, { status: 400 })
  }

  if (dFrom > dTo) {
    return NextResponse.json({ error: 'date_from no puede ser posterior a date_to' }, { status: 400 })
  }

  // Máximo 31 días para prevenir saturación de memoria/CPU en la función RPC de Postgres
  const diffDays = (dTo.getTime() - dFrom.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays > 31) {
    return NextResponse.json({ error: 'El rango de consulta no puede superar los 31 días' }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data, error } = await supabase
    .rpc('get_court_availability', {
      _court_id: courtId,
      _date_from: dateFrom,
      _date_to: dateTo,
    })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ slots: data }, {
    headers: {
      'Cache-Control': 'public, max-age=30, stale-while-revalidate=60',
    }
  })
}
