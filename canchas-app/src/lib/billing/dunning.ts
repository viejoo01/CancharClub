export interface SurchargeBreakdown {
  baseAmount: number
  daysOverdue: number
  surchargeDays: number
  surchargePercentage: number
  surchargeAmount: number
  totalAmount: number
}

/**
 * Calcula la mora según la regla de CancharClub:
 * - Días 1 a 7 post-vencimiento: 0% recargo (precio base congelado).
 * - A partir del Día 8: 3% por cada día transcurrido desde el día 8 inclusive.
 *   (Día 8 = 1 día de mora / 3%, Día 9 = 2 días / 6%, etc.)
 */
export function calculateInvoiceSurcharge(
  baseAmount: number,
  dueDate: string | Date
): SurchargeBreakdown {
  const due = new Date(dueDate)
  const now = new Date()

  // Diferencia en días enteros (descartando horas para evitar desfases)
  const diffTime = isNaN(due.getTime()) ? 0 : now.getTime() - due.getTime()
  const daysOverdue = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)))

  let surchargeDays = 0
  if (daysOverdue >= 8) {
    surchargeDays = daysOverdue - 7
  }

  const surchargePercentage = surchargeDays * 0.03
  const surchargeAmount = Math.round(baseAmount * surchargePercentage)
  const totalAmount = baseAmount + surchargeAmount

  return {
    baseAmount,
    daysOverdue,
    surchargeDays,
    surchargePercentage: Math.round(surchargePercentage * 100),
    surchargeAmount,
    totalAmount
  }
}
