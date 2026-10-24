export interface MercadoPagoInstance {
  createCardToken: (params: {
    cardNumber: string
    cardholderName: string
    cardExpirationMonth: string
    cardExpirationYear: string
    securityCode: string
    identificationType: string
    identificationNumber: string
  }) => Promise<{ id?: string; status?: string }>
}

declare global {
  interface Window {
    MercadoPago?: new (publicKey: string) => MercadoPagoInstance
  }
}

export interface TokenizeCardParams {
  cardNumber: string
  cardholderName: string
  cardExpiration: string // 'MM/AA'
  securityCode: string
  identificationNumber: string
}

/**
 * Tokeniza una tarjeta directamente en el navegador del cliente contra la API de Mercado Pago MLA
 * evitando que los números completos de tarjeta y el CVV viajen a los servidores de CancharClub (PCI-DSS SAQ A-EP).
 */
export async function tokenizeCardWithMercadoPagoClient(
  params: TokenizeCardParams
): Promise<{ success: boolean; token?: string; error?: string }> {
  const publicKey = process.env.NEXT_PUBLIC_MP_PUBLIC_KEY
  if (!publicKey) {
    return { success: false, error: 'NEXT_PUBLIC_MP_PUBLIC_KEY no configurada' }
  }

  if (typeof window === 'undefined' || !window.MercadoPago) {
    return { success: false, error: 'SDK de Mercado Pago v2 no disponible en ventana' }
  }

  try {
    const mp = new window.MercadoPago(publicKey)
    const [month, yearRaw] = params.cardExpiration.split('/')
    if (!month || !yearRaw) {
      return { success: false, error: 'Formato de fecha de vencimiento inválido' }
    }

    const fullYear = yearRaw.length === 2 ? `20${yearRaw}` : yearRaw

    const cardToken = await mp.createCardToken({
      cardNumber: params.cardNumber.replace(/\D/g, ''),
      cardholderName: params.cardholderName.trim().toUpperCase(),
      cardExpirationMonth: month.padStart(2, '0'),
      cardExpirationYear: fullYear,
      securityCode: params.securityCode.trim(),
      identificationType: 'DNI',
      identificationNumber: params.identificationNumber.replace(/\D/g, ''),
    })

    if (cardToken && cardToken.id) {
      return { success: true, token: cardToken.id }
    }

    return { success: false, error: 'Mercado Pago no retornó un token de tarjeta válido' }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.warn('[MercadoPagoClient] Falló la tokenización en el navegador, fallback a backend seguro:', message)
    return { success: false, error: message }
  }
}

