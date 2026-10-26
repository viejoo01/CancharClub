'use server'

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { calculateInvoiceSurcharge } from '@/lib/billing/dunning'

export interface CreatePreferenceResult {
  success: boolean
  initPoint?: string
  totalAmount?: number
  surchargeAmount?: number
  error?: string
}

export async function createInvoicePreference(invoiceId: string): Promise<CreatePreferenceResult> {
  const supabase = await createClient()

  // 1. Validar sesión del usuario
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) {
    return { success: false, error: 'Usuario no autenticado' }
  }

  const serviceClient = await createServiceClient()

  // 2. Obtener tenant asociado al usuario autenticado (por email o profile)
  let { data: tenant } = await serviceClient
    .from('tenants')
    .select('id, name, email')
    .eq('email', user.email)
    .maybeSingle()

  if (!tenant) {
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profile?.tenant_id) {
      const { data: t } = await serviceClient
        .from('tenants')
        .select('id, name, email')
        .eq('id', profile.tenant_id)
        .maybeSingle()
      tenant = t
    }
  }

  if (!tenant) {
    return { success: false, error: 'No se encontró el club asociado' }
  }

  // 3. Consultar la factura impaga
  const { data: invoice, error: invoiceErr } = await serviceClient
    .from('tenant_invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('tenant_id', tenant.id)
    .maybeSingle()

  if (invoiceErr || !invoice) {
    return { success: false, error: 'Factura inexistente' }
  }

  if (invoice.status === 'PAID') {
    return { success: false, error: 'La factura ya se encuentra saldada' }
  }

  // 2. Calcular recargo dinámico por mora
  const baseAmount = Number(invoice.amount)
  const dueDate = invoice.due_date || invoice.created_at
  const breakdown = calculateInvoiceSurcharge(baseAmount, dueDate)

  try {
    // 4. Crear la preferencia en Mercado Pago
    const mpAccessToken = process.env.MP_SUPERADMIN_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
    const client = new MercadoPagoConfig({
      accessToken: mpAccessToken || 'TEST-0000000000000000'
    })

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.cancharclub.com.ar'
    const preference = new Preference(client)
    const periodStr = invoice.billing_period || (invoice.month && invoice.year ? `${invoice.month}/${invoice.year}` : 'Suscripción')

    // Estructurar ítems para Mercado Pago
    const items = [
      {
        id: invoice.id,
        title: `CancharClub - Abono Mensual (${periodStr})`,
        quantity: 1,
        unit_price: breakdown.baseAmount,
        currency_id: 'ARS'
      }
    ]

    // Si devengó recargo (Día 8+), se agrega como ítem transparente
    if (breakdown.surchargeDays > 0) {
      items.push({
        id: `${invoice.id}-mora`,
        title: `Recargo por mora (${breakdown.surchargeDays} día${breakdown.surchargeDays > 1 ? 's' : ''} al 3% diario)`,
        quantity: 1,
        unit_price: breakdown.surchargeAmount,
        currency_id: 'ARS'
      })
    }

    const response = await preference.create({
      body: {
        items,
        payer: {
          email: tenant.email || user.email || 'club@cancharclub.com.ar',
          name: tenant.name || 'Club'
        },
        external_reference: invoice.id,
        back_urls: {
          success: `${appUrl}/dashboard/billing?payment=success&invoice=${invoice.id}`,
          failure: `${appUrl}/dashboard/billing?payment=failure&invoice=${invoice.id}`,
          pending: `${appUrl}/dashboard/billing?payment=pending&invoice=${invoice.id}`
        },
        auto_return: 'approved',
        statement_descriptor: 'CANCHARCLUB'
      }
    })

    const initPoint = response.init_point || response.sandbox_init_point

    if (!initPoint) {
      return { success: false, error: 'Mercado Pago no devolvió la URL de cobro' }
    }

    await serviceClient
      .from('tenant_invoices')
      .update({ mp_preference_id: response.id })
      .eq('id', invoice.id)

    return {
      success: true,
      initPoint,
      totalAmount: breakdown.totalAmount,
      surchargeAmount: breakdown.surchargeAmount
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error al conectar con la pasarela de pagos'
    console.error('[MercadoPago Preference Error]:', err)
    return {
      success: false,
      error: errorMsg
    }
  }
}
