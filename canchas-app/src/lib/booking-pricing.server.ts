import { createServiceClient } from '@/lib/supabase/server'
import { parseArgentinaDate, getArgentinaTimeStr, getArgentinaTodayIso } from '@/lib/utils'

export interface OfficialSlotPricing {
  totalAmountArs: number
  depositAmountArs: number
  depositPct: number
  courtName: string
  sport: string
}

/**
 * Recalcula en el SERVIDOR el precio total y la seña oficial de un turno.
 * Previene manipulación maliciosa de precios mediante parámetros de URL o payloads adulterados.
 */
export async function resolveOfficialSlotPrice(params: {
  tenantId: string
  courtId: string
  startsAt: string
}): Promise<OfficialSlotPricing | null> {
  const { tenantId, courtId, startsAt } = params
  const supabase = await createServiceClient()

  // 1. Obtener datos de la cancha
  const { data: court } = await supabase
    .from('courts')
    .select('id, name, sport, is_active')
    .eq('tenant_id', tenantId)
    .eq('id', courtId)
    .maybeSingle()

  const courtName = court?.name || 'Cancha'
  const sport = court?.sport || 'PADEL'

  // 2. Determinar día de la semana y hora en huso horario argentino oficial (America/Argentina/Buenos_Aires)
  const dateObj = parseArgentinaDate(startsAt)
  if (isNaN(dateObj.getTime())) {
    return null
  }

  // En servidores UTC (Vercel, Docker), dateObj.getHours() y getDay() reflejan UTC.
  // Usamos los helpers con timeZone: 'America/Argentina/Buenos_Aires' para obtener la hora y el día local exactos.
  const timeStr = getArgentinaTimeStr(dateObj)
  const argIso = getArgentinaTodayIso(dateObj)
  const [y, m, d] = argIso.split('-').map(Number)
  const localDate = new Date(y, m - 1, d)
  // En JS: 0=Domingo, 1=Lunes, ..., 6=Sábado
  const jsDay = localDate.getDay()
  // En PostgreSQL price_rules: 1=Lunes, ..., 7=Domingo
  const dbDay = jsDay === 0 ? 7 : jsDay

  // 3. Consultar reglas de precios activas del club y configuración de tarifas dinámicas
  const [{ data: rules }, { data: tenant }] = await Promise.all([
    supabase
      .from('price_rules')
      .select('id, court_id, day_of_week, time_from, time_to, price_cents, deposit_pct, priority, is_active')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('priority', { ascending: false }),
    supabase
      .from('tenants')
      .select('description')
      .eq('id', tenantId)
      .maybeSingle(),
  ])

  let totalAmountArs = 25000 // Precio base por defecto
  let depositPct = 50

  if (rules && rules.length > 0) {
    // Filtrar reglas que correspondan a esta cancha (o aplicables a todas) y a este día
    const applicableRules = rules.filter((r) => {
      const matchCourt = !r.court_id || r.court_id === courtId
      if (!matchCourt) return false

      if (!r.day_of_week || r.day_of_week.length === 0) return true
      return r.day_of_week.includes(dbDay) || r.day_of_week.includes(jsDay)
    })

    // Buscar regla que cubra la franja horaria [time_from, time_to]
    const matchingRule = applicableRules.find((r) => {
      const from = (r.time_from || '00:00:00').substring(0, 5)
      let to = (r.time_to || '23:59:59').substring(0, 5)
      if (to === '00:00') to = '24:00'
      return timeStr >= from && timeStr < to
    })

    if (matchingRule) {
      totalAmountArs = Math.round(Number(matchingRule.price_cents) / 100)
      if (matchingRule.deposit_pct !== undefined && matchingRule.deposit_pct !== null) {
        depositPct = Number(matchingRule.deposit_pct) || 50
      }
    } else if (applicableRules.length > 0) {
      totalAmountArs = Math.round(Number(applicableRules[0].price_cents) / 100)
      if (applicableRules[0].deposit_pct !== undefined && applicableRules[0].deposit_pct !== null) {
        depositPct = Number(applicableRules[0].deposit_pct) || 50
      }
    }
  }

  // 4. Aplicar Ajustes de Tarifas Dinámicas configuradas por el Club
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

  const depositAmountArs = Math.round(totalAmountArs * (depositPct / 100))

  return {
    totalAmountArs,
    depositAmountArs,
    depositPct,
    courtName,
    sport,
  }
}
