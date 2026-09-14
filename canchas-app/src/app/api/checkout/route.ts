// src/app/api/checkout/route.ts
// ==============================================================================
// CANCHARCLUB — API ROUTE: CREACIÓN DE PREFERENCIAS MERCADO PAGO CHECKOUT PRO
// "Tu predio bajo control" — cancharclub.com.ar
// Statement Descriptor: "CANCHARCLUB" (Limpio en resúmenes de tarjeta y app MP)
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { MercadoPagoConfig, Preference } from 'mercadopago'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { siteConfig } from '@/config/site'

// Schema de validación para Checkout API
const checkoutSchema = z.discriminatedUnion('type', [
  // 1. Abono Mensual SaaS Canchar (Cobro al Dueño del Club)
  z.object({
    type: z.literal('monthly_subscription'),
    tenant_id: z.string().min(1, 'El tenant_id es requerido'),
    invoice_id: z.string().optional(),
    amount: z.number().positive('El monto debe ser mayor a 0'),
    club_name: z.string().optional(),
  }),
  // 2. Seña de Turno Online (Cobro al Jugador)
  z.object({
    type: z.literal('booking_deposit'),
    tenant_id: z.string().min(1, 'El tenant_id es requerido'),
    booking_id: z.string().min(1, 'El booking_id es requerido'),
    court_name: z.string().min(1, 'El nombre de la cancha es requerido'),
    amount: z.number().positive('El monto de la seña debe ser mayor a 0'),
    payer_name: z.string().min(2, 'El nombre del cliente es requerido'),
    payer_email: z.string().email().optional(),
    payer_phone: z.string().optional(),
  }),
])

export type CheckoutRequestBody = z.infer<typeof checkoutSchema>

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.json()
    const validation = checkoutSchema.safeParse(rawBody)

    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Datos de checkout inválidos',
          details: validation.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const payload = validation.data
    const supabase = await createClient()
    const baseUrl = siteConfig.url

    // --------------------------------------------------------------------------
    // CASO 1: ABONO MENSUAL SAAS CANCHARCLUB
    // Title: "Abono Mensual CancharClub - [Nombre del Club]"
    // --------------------------------------------------------------------------
    if (payload.type === 'monthly_subscription') {
      const platformToken = process.env.MP_ACCESS_TOKEN

      // Obtener el nombre del club si no fue provisto
      let clubName = payload.club_name
      if (!clubName) {
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', payload.tenant_id)
          .single()
        clubName = tenant?.name || 'Club Deportivo'
      }

      const itemTitle = `Abono Mensual CancharClub - ${clubName}`
      const invoiceId = payload.invoice_id || `inv_${Date.now()}`
      const externalRef = `cancharclub_saas_${payload.tenant_id}_${invoiceId}`

      // Si no hay token de MP configurado, retornar modo simulación seguro
      if (!platformToken || platformToken.includes('MOCK') || platformToken.length < 10) {
        const simulatedUrl = `${baseUrl}/billing/suspended?pay_simulated=true&tenant_id=${payload.tenant_id}&invoice_id=${invoiceId}&amount=${payload.amount}`
        return NextResponse.json({
          success: true,
          preference_id: `sim_pref_${Date.now()}`,
          init_point: simulatedUrl,
          statement_descriptor: siteConfig.statementDescriptor,
          item_title: itemTitle,
          is_simulated: true,
        })
      }

      const client = new Preference(new MercadoPagoConfig({ accessToken: platformToken }))
      const preference = await client.create({
        body: {
          items: [
            {
              id: invoiceId,
              title: itemTitle,
              description: `Servicio SaaS de gestión de canchas deportivas CancharClub - ${clubName}`,
              quantity: 1,
              unit_price: payload.amount,
              currency_id: 'ARS',
            },
          ],
          external_reference: externalRef,
          statement_descriptor: siteConfig.statementDescriptor, // "CANCHARCLUB"
          back_urls: {
            success: `${baseUrl}/dashboard?billing_success=true`,
            pending: `${baseUrl}/billing/suspended?status=pending`,
            failure: `${baseUrl}/billing/suspended?status=failed`,
          },
          auto_return: 'approved',
          notification_url: `${baseUrl}/api/webhooks/billing/mercadopago`,
          expires: true,
          expiration_date_from: new Date().toISOString(),
          expiration_date_to: new Date(Date.now() + 86_400_000).toISOString(), // 24 horas
        },
      })

      return NextResponse.json({
        success: true,
        preference_id: preference.id,
        init_point: preference.init_point || preference.sandbox_init_point,
        statement_descriptor: siteConfig.statementDescriptor,
        item_title: itemTitle,
        is_simulated: false,
      })
    }

    // --------------------------------------------------------------------------
    // CASO 2: SEÑA DE TURNO ONLINE AL JUGADOR
    // Title: "Seña Turno [Cancha] - CancharClub"
    // --------------------------------------------------------------------------
    if (payload.type === 'booking_deposit') {
      // Obtener el access_token del tenant (cuenta Mercado Pago del club)
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name, mp_access_token')
        .eq('id', payload.tenant_id)
        .single()

      const itemTitle = `Seña Turno ${payload.court_name} - CancharClub`
      const externalRef = `cancharclub_booking_${payload.booking_id}`

      // Seguridad: Solo usar el token del club (NUNCA el del Superadmin)
      const tenantToken = tenant?.mp_access_token

      if (!tenantToken || tenantToken.includes('MOCK') || tenantToken.length < 10) {
        const simulatedUrl = `${baseUrl}/reserva/${payload.booking_id}/confirmado?simulated=true`
        return NextResponse.json({
          success: true,
          preference_id: `sim_booking_${Date.now()}`,
          init_point: simulatedUrl,
          statement_descriptor: siteConfig.statementDescriptor,
          item_title: itemTitle,
          is_simulated: true,
        })
      }

      const client = new Preference(new MercadoPagoConfig({ accessToken: tenantToken }))
      const preference = await client.create({
        body: {
          items: [
            {
              id: payload.booking_id,
              title: itemTitle,
              quantity: 1,
              unit_price: payload.amount,
              currency_id: 'ARS',
            },
          ],
          payer: {
            name: payload.payer_name,
            email: payload.payer_email,
          },
          external_reference: externalRef,
          statement_descriptor: siteConfig.statementDescriptor, // "CANCHARCLUB"
          back_urls: {
            success: `${baseUrl}/reserva/${payload.booking_id}/confirmado`,
            pending: `${baseUrl}/reserva/${payload.booking_id}/pendiente`,
            failure: `${baseUrl}/reserva/${payload.booking_id}/error`,
          },
          auto_return: 'approved',
          notification_url: `${baseUrl}/api/webhooks/mercadopago`,
          expires: true,
          expiration_date_from: new Date().toISOString(),
          expiration_date_to: new Date(Date.now() + 420_000).toISOString(), // 7 minutos de bloqueo
        },
      })

      return NextResponse.json({
        success: true,
        preference_id: preference.id,
        init_point: preference.init_point || preference.sandbox_init_point,
        statement_descriptor: siteConfig.statementDescriptor,
        item_title: itemTitle,
        is_simulated: false,
      })
    }

    return NextResponse.json({ success: false, error: 'Operación no soportada' }, { status: 400 })
  } catch (error: unknown) {
    console.error('Error procesando checkout Mercado Pago:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error interno al procesar pago en Canchar',
      },
      { status: 500 }
    )
  }
}
