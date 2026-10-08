/**
 * Utilidades de validación estricta de tarjetas de crédito y débito.
 * Implementa el algoritmo de Luhn (Módulo 10), verificación de rangos BIN de emisores oficiales
 * y reglas de expiración, CVV, DNI y titular.
 */

export interface CardBrandInfo {
  brand: 'VISA' | 'MASTERCARD' | 'AMEX' | 'CABAL' | 'NARANJA' | 'MAESTRO'
  methodId: string
  altMethodId?: string
  expectedLength: number[]
  cvvLength: number[]
}

/**
 * Algoritmo de Luhn (Módulo 10) internacional.
 * Todas las tarjetas bancarias oficiales del mundo (Visa, Mastercard, Amex, Cabal, etc.)
 * deben cumplir matemáticamente esta suma de control.
 */
export function isValidLuhn(cardNumber: string): boolean {
  const digits = cardNumber.replace(/\D/g, '')
  if (digits.length < 13 || digits.length > 19) return false

  let sum = 0
  let shouldDouble = false

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10)
    if (isNaN(digit)) return false

    if (shouldDouble) {
      digit *= 2
      if (digit > 9) digit -= 9
    }

    sum += digit
    shouldDouble = !shouldDouble
  }

  return sum % 10 === 0
}

/**
 * Identifica la red emisora oficial de la tarjeta por su prefijo BIN
 */
export function detectCardBrand(cardNumber: string): CardBrandInfo | null {
  const digits = cardNumber.replace(/\D/g, '')
  if (!digits) return null

  // Visa: empieza con 4 (16 dígitos)
  if (digits.startsWith('4')) {
    return {
      brand: 'VISA',
      methodId: 'visa',
      altMethodId: 'debvisa',
      expectedLength: [16],
      cvvLength: [3],
    }
  }

  // Mastercard: 51-55 o 2221-2720 (16 dígitos)
  if (/^(5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d{2}|27[01]\d|2720)/.test(digits)) {
    return {
      brand: 'MASTERCARD',
      methodId: 'master',
      altMethodId: 'debmaster',
      expectedLength: [16],
      cvvLength: [3],
    }
  }

  // American Express: 34 o 37 (15 dígitos)
  if (/^3[47]/.test(digits)) {
    return {
      brand: 'AMEX',
      methodId: 'amex',
      expectedLength: [15],
      cvvLength: [4, 3],
    }
  }

  // Cabal: 5896, 6042, 6043, 6369 (16 dígitos)
  if (/^(5896|6042|6043|6369)/.test(digits)) {
    return {
      brand: 'CABAL',
      methodId: 'cabal',
      altMethodId: 'debcabal',
      expectedLength: [16],
      cvvLength: [3],
    }
  }

  // Tarjeta Naranja: 589562 (16 dígitos)
  if (/^589562/.test(digits)) {
    return {
      brand: 'NARANJA',
      methodId: 'naranja',
      expectedLength: [16],
      cvvLength: [3],
    }
  }

  // Maestro: 50, 56-58, 6 (16 a 19 dígitos)
  if (/^(50|5[6-8]|6\d)/.test(digits)) {
    return {
      brand: 'MAESTRO',
      methodId: 'maestro',
      expectedLength: [16, 17, 18, 19],
      cvvLength: [3],
    }
  }

  return null
}

/**
 * Valida la fecha de expiración MM/AA o MM/AAAA
 */
export function isValidExpiry(expiry: string): { valid: boolean; month: number; year: number; error?: string } {
  const clean = expiry.replace(/\D/g, '')
  if (clean.length < 3 || clean.length > 4) {
    return { valid: false, month: 0, year: 0, error: 'Ingresá el mes y año de vencimiento en formato MM/AA.' }
  }

  const month = parseInt(clean.slice(0, 2), 10)
  let year = parseInt(clean.slice(2), 10)
  if (year < 100) year += 2000

  if (isNaN(month) || month < 1 || month > 12) {
    return { valid: false, month: 0, year: 0, error: 'Mes de vencimiento inválido (debe ser de 01 a 12).' }
  }

  const now = new Date()
  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1 // 1-12

  if (year < currentYear || (year === currentYear && month < currentMonth)) {
    return { valid: false, month, year, error: 'La tarjeta se encuentra vencida.' }
  }

  if (year > currentYear + 15) {
    return { valid: false, month, year, error: 'Año de vencimiento inválido.' }
  }

  return { valid: true, month, year }
}

/**
 * Valida el código de seguridad (CVV)
 */
export function isValidCvv(cvv: string, brand?: string): boolean {
  const clean = cvv.replace(/\D/g, '')
  if (brand === 'AMEX') {
    return clean.length === 4 || clean.length === 3
  }
  return clean.length === 3
}

/**
 * Valida formato de DNI argentino (7 u 8 dígitos numéricos)
 */
export function isValidDni(dni: string): boolean {
  const clean = dni.replace(/\D/g, '')
  return clean.length >= 7 && clean.length <= 8
}

/**
 * Valida que el titular tenga nombre y apellido real
 */
export function isValidCardholder(name: string): boolean {
  const trimmed = name.trim()
  if (trimmed.length < 5) return false
  const parts = trimmed.split(/\s+/).filter(Boolean)
  return parts.length >= 2
}

/**
 * Traduce el código de rechazo técnico de Mercado Pago al usuario en lenguaje claro
 */
export function mapMpRejectionDetail(detail?: string): string {
  switch (detail) {
    case 'cc_rejected_bad_filled_card_number':
      return 'Número de tarjeta incorrecto o inexistente.'
    case 'cc_rejected_bad_filled_date':
      return 'Fecha de vencimiento incorrecta.'
    case 'cc_rejected_bad_filled_security_code':
      return 'Código de seguridad (CVV) incorrecto.'
    case 'cc_rejected_bad_filled_other':
      return 'Datos de tarjeta incorrectos.'
    case 'cc_rejected_call_for_authorize':
      return 'Tu banco emisor requiere que autorices la operación antes de continuar.'
    case 'cc_rejected_insufficient_amount':
      return 'Fondos o límite insuficiente en la tarjeta.'
    case 'cc_rejected_card_disabled':
      return 'La tarjeta se encuentra inhabilitada o bloqueada por tu banco.'
    case 'cc_rejected_card_type_not_allowed':
      return 'Este tipo de tarjeta no está habilitado para pagos online.'
    case 'cc_rejected_duplicated_payment':
      return 'Operación duplicada recientemente.'
    case 'cc_rejected_high_risk':
      return 'Operación rechazada por los filtros de prevención de fraude.'
    case 'cc_rejected_max_attempts':
      return 'Superaste el límite máximo de intentos permitidos con esta tarjeta.'
    default:
      return 'Tarjeta no autorizada o rechazada por la entidad bancaria.'
  }
}
