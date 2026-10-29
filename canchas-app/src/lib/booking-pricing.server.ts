import { createServiceClient } from '@/lib/supabase/server'
import { parseArgentinaDate, getArgentinaTimeStr, getArgentinaTodayIso } from '@/lib/utils'

export interface OfficialSlotPricing {
  totalAmountArs: number
  depositAmountArs: number
  depositPct: number
  courtName: string
  sport: string
}

function isValidUuid(id?: string | null): boolean {
  return Boolean(id && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
}

/**
 * Recalcula en el SERVIDOR el precio total y la seña oficial de un turno.
 * Implementa jerarquía estricta de precios, evaluación determinista de turnos cruzados
 * (cross-boundary) entre franjas horarias con luz artificial, normalización bidireccional
 * de días de la semana (evitando desfasaje off-by-one de domingo 0/7) y aislamiento multi-tenant.
 */
export async function resolveOfficialSlotPrice(params: {
  tenantId: string
  courtId: string
  startsAt: string
  durationMinutes?: number
}): Promise<OfficialSlotPricing | null> {
  const { tenantId, courtId, startsAt, durationMinutes } = params

  if (!isValidUuid(tenantId) || !isValidUuid(courtId)) {
    return null
  }

  const supabase = await createServiceClient()

  // 1. Obtener datos de la cancha y validar pertenencia al club (Aislamiento Multi-Tenant estricto)
  const { data: court } = await supabase
    .from('courts')
    .select('id, name, sport, slot_duration_minutes, is_active')
    .eq('tenant_id', tenantId)
    .eq('id', courtId)
    .maybeSingle()

  if (!court || court.is_active === false) {
    return null
  }

  const courtName = court.name || 'Cancha'
  const sport = court.sport || 'PADEL'

  // 2. Determinar día de la semana y franja horaria en huso horario oficial de Argentina (UTC-3)
  const dateObj = parseArgentinaDate(startsAt)
  if (isNaN(dateObj.getTime())) {
    return null
  }

  const timeStr = getArgentinaTimeStr(dateObj)
  const argIso = getArgentinaTodayIso(dateObj)
  const [y, m, d] = argIso.split('-').map(Number)
  const localDate = new Date(y, m - 1, d)

  // En JS: 0=Domingo, 1=Lunes, ..., 6=Sábado
  const jsDay = localDate.getDay()
  // En PostgreSQL / ISO: 1=Lunes, ..., 7=Domingo
  const isoDay = jsDay === 0 ? 7 : jsDay

  // Intervalo del turno en minutos desde la medianoche
  const [startH, startM] = timeStr.split(':').map(Number)
  const slotStartMins = (startH || 0) * 60 + (startM || 0)
  const isPadel = sport.toUpperCase().includes('PADEL')
  const slotDuration = durationMinutes || court.slot_duration_minutes || (isPadel ? 90 : 60)
  const slotEndMins = slotStartMins + slotDuration

  // 3. Consultar reglas de precios activas del club y configuración del tenant
  const [{ data: rules }, { data: tenant }] = await Promise.all([
    supabase
      .from('price_rules')
      .select('id, court_id, day_of_week, time_from, time_to, price_cents, deposit_pct, priority, is_active, valid_from, valid_to')
      .eq('tenant_id', tenantId)
      .eq('is_active', true),
    supabase
      .from('tenants')
      .select('description, deposit_percentage')
      .eq('id', tenantId)
      .maybeSingle(),
  ])

  let defaultDepositPct = 50
  if (tenant?.deposit_percentage !== null && tenant?.deposit_percentage !== undefined) {
    const parsedDep = Number(tenant.deposit_percentage)
    if (!isNaN(parsedDep) && parsedDep >= 0 && parsedDep <= 100) {
      defaultDepositPct = parsedDep
    }
  }

  interface ApplicableRuleWithOverlap {
    id: string
    court_id: string | null
    price_cents: number
    deposit_pct: number | null
    priority: number
    valid_from: string | null
    valid_to: string | null
    overlapMins: number
  }

  const applicableRules: ApplicableRuleWithOverlap[] = []

  if (rules && rules.length > 0) {
    for (const r of rules) {
      // A. Aislamiento por cancha: debe ser para esta cancha o general del club (court_id IS NULL)
      if (r.court_id && r.court_id !== courtId) {
        continue
      }

      // B. Vigencia por fecha calendario (para tarifas de feriados, temporadas o eventos especiales)
      if (r.valid_from && argIso < r.valid_from) {
        continue
      }
      if (r.valid_to && argIso > r.valid_to) {
        continue
      }

      // C. Día de la semana con normalización bidireccional (previene desfasajes off-by-one con Domingo 0 / 7)
      if (r.day_of_week && r.day_of_week.length > 0) {
        const matchesDay =
          r.day_of_week.includes(isoDay) ||
          r.day_of_week.includes(jsDay) ||
          (jsDay === 0 && r.day_of_week.includes(7)) ||
          (isoDay === 7 && r.day_of_week.includes(0))

        if (!matchesDay) {
          continue
        }
      }

      // D. Solapamiento de intervalo (Cross-boundary slot matching)
      const [rfH, rfM] = (r.time_from || '00:00:00').split(':').map(Number)
      const [rtH, rtM] = (r.time_to || '23:59:59').split(':').map(Number)
      let toM = (rtH || 0) * 60 + (rtM || 0)
      if (toM === 0) toM = 24 * 60
      const fromM = (rfH || 0) * 60 + (rfM || 0)

      const overlapMins = Math.max(0, Math.min(slotEndMins, toM) - Math.max(slotStartMins, fromM))
      if (overlapMins > 0) {
        applicableRules.push({
          id: r.id,
          court_id: r.court_id,
          price_cents: Number(r.price_cents) || 0,
          deposit_pct: r.deposit_pct !== null && r.deposit_pct !== undefined ? Number(r.deposit_pct) : null,
          priority: Number(r.priority) || 0,
          valid_from: r.valid_from,
          valid_to: r.valid_to,
          overlapMins,
        })
      }
    }

    // Jerarquía y Precedencia Determinista:
    // 1. Tarifa por día específico / feriado (valid_from o valid_to configurados)
    // 2. Cancha específica (court_id === courtId) sobre regla global del club
    // 3. Prioridad explícita (priority DESC)
    // 4. Suplemento de iluminación nocturna / tarifa más alta (protección financiera en turnos cross-boundary)
    // 5. Mayor tiempo de solapamiento con el turno
    applicableRules.sort((a, b) => {
      const aDateSpec = (a.valid_from || a.valid_to) ? 1 : 0
      const bDateSpec = (b.valid_from || b.valid_to) ? 1 : 0
      if (bDateSpec !== aDateSpec) return bDateSpec - aDateSpec

      const aCourtSpec = a.court_id === courtId ? 1 : 0
      const bCourtSpec = b.court_id === courtId ? 1 : 0
      if (bCourtSpec !== aCourtSpec) return bCourtSpec - aCourtSpec

      if (b.priority !== a.priority) return b.priority - a.priority

      if (b.price_cents !== a.price_cents) return b.price_cents - a.price_cents

      return b.overlapMins - a.overlapMins
    })
  }

  let totalAmountArs = 20000 // Precio base de seguridad fail-closed
  let depositPct = defaultDepositPct

  if (applicableRules.length > 0) {
    const chosenRule = applicableRules[0]
    totalAmountArs = Math.round(chosenRule.price_cents / 100)
    if (chosenRule.deposit_pct !== null) {
      depositPct = chosenRule.deposit_pct
    }
  } else {
    // Si no hay regla que cubra la franja exacta, derivar precio base de la regla más cercana del club
    const anyCourtRule = rules?.find((r) => r.court_id === courtId || !r.court_id)
    if (anyCourtRule) {
      totalAmountArs = Math.round((Number(anyCourtRule.price_cents) || 2000000) / 100)
      if (anyCourtRule.deposit_pct !== null && anyCourtRule.deposit_pct !== undefined) {
        depositPct = Number(anyCourtRule.deposit_pct) || defaultDepositPct
      }
    }
  }

  // 4. Aplicar Ajustes de Tarifas Dinámicas configuradas por el Club (con límites seguros)
  if (tenant?.description) {
    try {
      const meta = JSON.parse(tenant.description)
      const dp = meta?.dynamic_pricing
      if (dp) {
        // A. Happy Hour (Franja de descuento por horario valle)
        if (dp.enable_happy_hour && dp.happy_hour_from && dp.happy_hour_to) {
          if (timeStr >= dp.happy_hour_from && timeStr < dp.happy_hour_to) {
            const discount = Math.max(0, Math.min(80, Number(dp.happy_hour_discount_pct) || 20))
            totalAmountArs = Math.round(totalAmountArs * (1 - discount / 100))
          }
        }

        // B. Recargo en Horario Pico (Peak Surge)
        if (dp.enable_peak_surge) {
          if (timeStr >= '18:00' && timeStr < '23:00') {
            const surge = Math.max(0, Math.min(100, Number(dp.peak_surge_pct) || 15))
            totalAmountArs = Math.round(totalAmountArs * (1 + surge / 100))
          }
        }

        // C. Last Minute (Descuento de último momento para llenar canchas vacías)
        if (dp.enable_last_minute) {
          const hoursThreshold = Number(dp.last_minute_hours_threshold) || 3
          const hoursUntilMatch = (dateObj.getTime() - Date.now()) / (1000 * 60 * 60)
          if (hoursUntilMatch > 0 && hoursUntilMatch <= hoursThreshold) {
            const lastMinuteDiscount = Math.max(0, Math.min(80, Number(dp.last_minute_discount_pct) || 25))
            totalAmountArs = Math.round(totalAmountArs * (1 - lastMinuteDiscount / 100))
          }
        }
      }
    } catch {}
  }

  // Garantía fail-closed: el precio del turno nunca puede ser <= 0
  totalAmountArs = Math.max(1000, totalAmountArs)

  // Cálculo de seña requerido
  const depositAmountArs = depositPct === 0 ? 0 : Math.max(1, Math.round(totalAmountArs * (depositPct / 100)))

  return {
    totalAmountArs,
    depositAmountArs,
    depositPct,
    courtName,
    sport,
  }
}
