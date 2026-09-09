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
