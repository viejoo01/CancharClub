import { MercadoPagoConfig, Preference } from 'mercadopago'

const mpAccessToken = process.env.MP_SUPERADMIN_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
const mpClient = new MercadoPagoConfig({ 
  accessToken: mpAccessToken || 'TEST-0000000000000000'
})

export interface InvoiceForPreference {
  id: string
  amount: number | string
  title?: string
}

export async function createInvoicePreference(invoice: InvoiceForPreference) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.cancharclub.com.ar'
  const preferenceClient = new Preference(mpClient)

  const preference = await preferenceClient.create({
    body: {
      items: [{
        id: invoice.id,
        title: invoice.title || 'Abono Mensual CancharClub',
        quantity: 1,
        unit_price: Number(invoice.amount),
        currency_id: 'ARS'
      }],
      external_reference: invoice.id,
      back_urls: {
        success: `${appUrl}/dashboard/billing?status=success`,
        failure: `${appUrl}/dashboard/billing?status=failure`
      },
      auto_return: 'approved'
    }
  })

  return preference
}
