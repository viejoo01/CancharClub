import { NextResponse } from 'next/server'
import { MercadoPagoConfig, PreApproval } from 'mercadopago'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const mpAccessToken = process.env.MP_SUPERADMIN_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
const mpClient = new MercadoPagoConfig({ 
  accessToken: mpAccessToken || 'TEST-0000000000000000'
})

export async function POST(req: Request) {
  try {
    const { token, paymentMethodId } = await req.json()
    const supabase = await createClient()

    // 1. Obtener datos del tenant logueado
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Buscar tenant por email de usuario o por profiles.tenant_id
    let { data: tenant } = await supabase
      .from('tenants')
      .select('id, name, email, trial_ends_at, description')
      .eq('email', user.email)
      .maybeSingle()

    if (!tenant) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()

      if (profile?.tenant_id) {
        const { data: t } = await supabase
          .from('tenants')
          .select('id, name, email, trial_ends_at, description')
          .eq('id', profile.tenant_id)
          .maybeSingle()
        tenant = t
      }
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Club no encontrado' }, { status: 404 })
    }

    // Calcular fecha del primer cobro (fin de los 15 días de prueba)
    const startDate = tenant.trial_ends_at 
      ? new Date(tenant.trial_ends_at).toISOString()
      : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString()

    // 2. Crear contrato PreApproval en Mercado Pago con fecha diferida
    const preapproval = new PreApproval(mpClient)
    const mpSubscription = await preapproval.create({
      body: {
        payer_email: tenant.email,
        back_url: 'https://www.cancharclub.com.ar/dashboard/billing',
        reason: `CancharClub SaaS - ${tenant.name}`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: 100000, // Monto del plan base
          currency_id: 'ARS',
          start_date: startDate // MP no debita hoy; programa el primer cobro para esta fecha
        },
        card_token_id: token,
        status: 'authorized'
      }
    })

    if (!mpSubscription.id || mpSubscription.status !== 'authorized') {
      return NextResponse.json({ 
        error: 'La tarjeta fue rechazada por la entidad bancaria.' 
      }, { status: 400 })
    }

    // 3. Persistir el ID permanente de suscripción en Supabase
    const serviceClient = await createServiceClient()
    let meta: Record<string, unknown> = {}
    if (tenant.description) {
      try {
        meta = JSON.parse(tenant.description)
      } catch {}
    }
    meta.card_linked = true
    meta.card_brand = paymentMethodId
    meta.mp_preapproval_id = mpSubscription.id

    try {
      await serviceClient
        .from('tenants')
        .update({
          mp_preapproval_id: mpSubscription.id,
          card_brand: paymentMethodId,
          card_linked: true,
          description: JSON.stringify(meta),
          updated_at: new Date().toISOString()
        })
        .eq('id', tenant.id)
    } catch {
      await serviceClient
        .from('tenants')
        .update({
          mp_preapproval_id: mpSubscription.id,
          description: JSON.stringify(meta)
        })
        .eq('id', tenant.id)
    }

    return NextResponse.json({ success: true, preapprovalId: mpSubscription.id })

  } catch (error: unknown) {
    const errorMsg = error instanceof Error ? error.message : 'Error al procesar la vinculación con Mercado Pago'
    console.error('[LinkCard Error]:', error)
    return NextResponse.json({ 
      error: errorMsg 
    }, { status: 500 })
  }
}
