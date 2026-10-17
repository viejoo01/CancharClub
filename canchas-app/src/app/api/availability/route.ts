// src/app/api/availability/route.ts
// API Route: Disponibilidad pública de una cancha por rango de fechas
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

function parseTstzRange(rangeStr: string): { start: Date; end: Date } | null {
  const m = rangeStr.match(/[\[\(]([^,]+),([^\]\)]+)[\]\)]/)
  if (!m) return null
  let sStr = m[1].replace(/["']/g, '').trim().replace(' ', 'T')
  let eStr = m[2].replace(/["']/g, '').trim().replace(' ', 'T')
  if (sStr.endsWith('+00')) sStr = sStr.slice(0, -3) + 'Z'
  else if (sStr.endsWith('+00:00')) sStr = sStr.slice(0, -6) + 'Z'
  if (eStr.endsWith('+00')) eStr = eStr.slice(0, -3) + 'Z'
  else if (eStr.endsWith('+00:00')) eStr = eStr.slice(0, -6) + 'Z'
  const s = new Date(sStr)
  const e = new Date(eStr)
  if (isNaN(s.getTime()) || isNaN(e.getTime())) return null
  return { start: s, end: e }
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

  // Máximo 31 días para prevenir saturación de memoria/CPU
  const diffDays = (dTo.getTime() - dFrom.getTime()) / (1000 * 60 * 60 * 24)
  if (diffDays > 31) {
    return NextResponse.json({ error: 'El rango de consulta no puede superar los 31 días' }, { status: 400 })
  }

  const serviceClient = await createServiceClient()

  // 3. Consultar datos de la cancha
  const { data: court, error: courtErr } = await serviceClient
    .from('courts')
    .select('id, tenant_id, slot_duration_minutes, sport')
    .eq('id', courtId)
    .maybeSingle()

  if (courtErr || !court) {
    return NextResponse.json({ error: 'Cancha no encontrada' }, { status: 404 })
  }

  // 4. Rango de búsqueda en hora Argentina (-03:00) para cubrir el período solicitado completo
  const windowStartIso = new Date(`${dateFrom}T00:00:00-03:00`).toISOString()
  const windowEndIso = new Date(`${dateTo}T23:59:59.999-03:00`).toISOString()

  // 5. Consultar reservas activas (SOLO booked_at, status y lock_expires_at, NUNCA datos personales de clientes)
  const { data: bookings } = await serviceClient
    .from('bookings')
    .select('booked_at, status, lock_expires_at')
    .eq('court_id', courtId)
    .filter('booked_at', 'ov', `[${windowStartIso},${windowEndIso}]`)
    .neq('status', 'cancelled')

  // 6. Consultar bloqueos manuales de cancha si existen
  let courtBlocks: Array<{ block_range?: string | null; reason?: string | null }> = []
  try {
    const { data: blocks } = await serviceClient
      .from('court_blocks')
      .select('block_range, reason')
      .eq('court_id', courtId)
      .filter('block_range', 'ov', `[${windowStartIso},${windowEndIso}]`)
    if (blocks) courtBlocks = blocks
  } catch {
    // Si la tabla no existe o falla, continuar normalmente con reservas
  }

  // Extraer rangos ocupados normalizados
  const occupiedRanges: Array<{ start: Date; end: Date; reason: string }> = []

  for (const b of bookings || []) {
    if (!b.booked_at) continue
    // Si la reserva está en pending_deposit pero su tiempo de gracia (lock_expires_at) ya expiró, no bloquear el turno
    if (b.status === 'pending_deposit' && b.lock_expires_at && new Date(b.lock_expires_at).getTime() < Date.now()) {
      continue
    }
    const parsed = parseTstzRange(String(b.booked_at))
    if (parsed) {
      occupiedRanges.push({ ...parsed, reason: 'RESERVED' })
    }
  }

  for (const cb of courtBlocks || []) {
    if (!cb.block_range) continue
    const parsed = parseTstzRange(String(cb.block_range))
    if (parsed) {
      occupiedRanges.push({ ...parsed, reason: cb.reason || 'MAINTENANCE' })
    }
  }

  const durationMins = court.slot_duration_minutes || (court.sport?.includes('FUTBOL') ? 60 : 90)
  const generatedSlots: Array<{
    slot_start: string
    slot_end: string
    is_available: boolean
    block_reason: string | null
  }> = []

  const curr = new Date(dFrom)
  while (curr <= dTo) {
    const yyyy = curr.getUTCFullYear()
    const mm = String(curr.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(curr.getUTCDate()).padStart(2, '0')
    const dateStr = `${yyyy}-${mm}-${dd}`

    for (let h = 8; h <= 23; h++) {
      const hStr = String(h).padStart(2, '0')
      const slotStart = new Date(`${dateStr}T${hStr}:00:00-03:00`)
      const slotEnd = new Date(slotStart.getTime() + durationMins * 60000)

      // Verificar superposición con cualquier rango ocupado:
      // Dos rangos [s1, e1] y [s2, e2] se superponen si slotStart < occ.end && slotEnd > occ.start
      const overlap = occupiedRanges.find(occ => slotStart < occ.end && slotEnd > occ.start)

      generatedSlots.push({
        slot_start: slotStart.toISOString(),
        slot_end: slotEnd.toISOString(),
        is_available: !overlap,
        block_reason: overlap ? overlap.reason : null,
      })
    }
    curr.setUTCDate(curr.getUTCDate() + 1)
  }

  return NextResponse.json({ slots: generatedSlots }, {
    headers: {
      'Cache-Control': 'public, max-age=15, stale-while-revalidate=30',
    }
  })
}
