// src/lib/cuenta-corriente-utils.ts
// ==============================================================================
// Utilidades de formato y links de WhatsApp para Cuentas Corrientes
// ==============================================================================

import { formatARS } from '@/lib/utils'
import type { CustomerAccount } from '@/actions/cuenta-corriente.actions'

export function buildDebtWhatsAppReminder(
  account: CustomerAccount,
  clubName: string,
  bankAlias?: string
): string {
  const cleanPhone = account.customer_phone.replace(/[^\d]/g, '')
  if (!cleanPhone) return ''

  const lastCharges = (account.movements || [])
    .filter(m => m.type === 'CHARGE')
    .slice(0, 3)
    .map(m => ` • ${m.description} (${formatARS(m.amount)})`)
    .join('\n')

  let message = `¡Hola ${account.customer_name}! 👋 Te escribimos desde *${clubName}*.\n\n`
  message += `Te compartimos el estado de tu cuenta corriente en la cantina del club:\n`
  message += `💳 *Saldo pendiente:* ${formatARS(account.balance)}\n\n`

  if (lastCharges) {
    message += `📋 *Últimos consumos registrados:*\n${lastCharges}\n\n`
  }

  if (bankAlias) {
    message += `🏦 Podés abonarlo por transferencia a nuestro Alias: *${bankAlias}*\n`
    message += `(Enviando el comprobante por acá para registrarlo en el sistema).\n\n`
  } else {
    message += `Podés acercarte a la administración o cantina en tu próximo partido para saldarlo.\n\n`
  }

  message += `¡Muchas gracias!`

  return `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`
}
