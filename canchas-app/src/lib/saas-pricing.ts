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
 * Calcula la cuota mensual SaaS completa para un club.
 */
export function calculateClubSaaSFee(
  courtsCount: number,
  highestSlotPriceArs: number
): ClubSaaSPricing {
  const safeCourts = Math.max(1, courtsCount)
  const safePrice = Math.max(0, highestSlotPriceArs)
  const multiplier = calculateSaaSMultiplier(safeCourts)
  const monthlyFeeArs = Math.round(safePrice * multiplier)
  const plan = getPlanByCourtsCount(safeCourts)

  // Próximo vencimiento: último día del mes corriente
  const now = new Date()
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const nextDueDate = lastDayOfMonth.toISOString().split('T')[0]

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
