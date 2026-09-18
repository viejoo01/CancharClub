// src/lib/saas-pricing.ts
// ==============================================================================
// MOTOR DE CÁLCULO DE PRECIOS SAAS — TARIFA FIJA MENSUAL PROPORCIONAL
// ==============================================================================
// Regla de Negocio:
// La tarifa mensual se calcula en función del turno más caro del club (P_max)
// y la cantidad de canchas activas (N), aplicando un multiplicador de turnos:
//
// Multiplicador (M) = 0.5 * N + 0.5
//
// Ejemplos:
// - 1 Cancha:  M = 0.5(1) + 0.5 = 1.0 turno   (Si el turno vale $30.000 -> $30.000/mes)
// - 2 Canchas: M = 0.5(2) + 0.5 = 1.5 turnos  (Si el turno vale $30.000 -> $45.000/mes)
// - 3 Canchas: M = 0.5(3) + 0.5 = 2.0 turnos  (Si el turno vale $30.000 -> $60.000/mes)
// - 4 Canchas: M = 0.5(4) + 0.5 = 2.5 turnos  (Si el turno vale $30.000 -> $75.000/mes)
// - 6 Canchas: M = 0.5(6) + 0.5 = 3.5 turnos  (Si el turno vale $30.000 -> $105.000/mes)
// ==============================================================================

import { getPlanMultiplier, getPlanByCourtsCount } from '@/config/saas-plans'

export interface ClubSaaSPricing {
  courtsCount: number
  highestSlotPriceArs: number
  multiplier: number
  monthlyFeeArs: number
  formulaDescription: string
  nextDueDate: string
  planId?: string
  planName?: string
}

/**
 * Calcula el multiplicador de turnos en base al número de canchas activas:
 * - 1 Cancha: 1.0 turno
 * - 2 Canchas: 1.5 turnos
 * - 3 Canchas: 2.0 turnos
 * - 4 Canchas: 2.5 turnos
 * - 5+ Canchas: 3.0 turnos (Tope máximo garantizado)
 */
export function calculateSaaSMultiplier(courtsCount: number): number {
  return getPlanMultiplier(courtsCount)
}

/**
 * Calcula la fecha del próximo vencimiento mensual en formato DD/MM/AAAA.
 * Es 100% dinámico con respecto al día exacto en que se registró el club:
 * - Si el club es nuevo (primer mes / período de prueba), vence al cumplirse el primer mes (30 días).
 * - En los meses sucesivos, vence en el mismo día del mes en que fue registrado.
 */
export function computeNextDueDate(createdAt?: string | Date | null): string {
  const now = new Date()
  const regDate = createdAt ? new Date(createdAt) : now
  const targetDay = regDate.getDate()

  // Helper para construir fecha asegurando días válidos (ej. febrero o meses de 30 días)
  const getClampedDate = (year: number, month: number, day: number) => {
    const maxDays = new Date(year, month + 1, 0).getDate()
    const validDay = Math.min(day, maxDays)
    return new Date(year, month, validDay, 23, 59, 59, 999)
  }

  let year = now.getFullYear()
  let month = now.getMonth()

  // Candidato para el mes en curso
  let candidate = getClampedDate(year, month, targetDay)

  // Si la fecha ya venció en este mes, o si el club fue creado hace menos de 25 días (primer ciclo)
  const isTooCloseToRegistration = (candidate.getTime() - regDate.getTime()) < 25 * 24 * 60 * 60 * 1000
  if (candidate <= now || isTooCloseToRegistration) {
    month += 1
    if (month > 11) {
      month = 0
      year += 1
    }
    candidate = getClampedDate(year, month, targetDay)
  }

  // Formatear en DD/MM/AAAA requerido
  const dd = String(candidate.getDate()).padStart(2, '0')
  const mm = String(candidate.getMonth() + 1).padStart(2, '0')
  const yyyy = candidate.getFullYear()

  return `${dd}/${mm}/${yyyy}`
}

/**
 * Calcula la cuota mensual SaaS completa para un club.
 */
export function calculateClubSaaSFee(
  courtsCount: number,
  highestSlotPriceArs: number,
  createdAt?: string | Date | null
): ClubSaaSPricing {
  const safeCourts = Math.max(1, courtsCount)
  const safePrice = Math.max(0, highestSlotPriceArs)
  const multiplier = calculateSaaSMultiplier(safeCourts)
  const monthlyFeeArs = Math.round(safePrice * multiplier)
  const plan = getPlanByCourtsCount(safeCourts)
  const nextDueDate = computeNextDueDate(createdAt)

  return {
    courtsCount: safeCourts,
    highestSlotPriceArs: safePrice,
    multiplier,
    monthlyFeeArs,
    formulaDescription: safeCourts >= 5 
      ? `3 turnos de $${safePrice.toLocaleString('es-AR')} (Tope máximo garantizado para ${safeCourts} canchas)`
      : `${multiplier} turno${multiplier > 1 ? 's' : ''} de $${safePrice.toLocaleString('es-AR')} (${safeCourts} cancha${safeCourts > 1 ? 's' : ''})`,
    nextDueDate,
    planId: plan.id,
    planName: plan.name,
  }
}
