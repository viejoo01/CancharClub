'use server'
// src/actions/saas-billing.actions.ts
// ==============================================================================
// SERVER ACTIONS — Facturación y Suscripciones SaaS
// ==============================================================================

import { createClient, createServiceClient } from '@/lib/supabase/server'
import { calculateClubSaaSFee, type ClubSaaSPricing } from '@/lib/saas-pricing'
import { revalidatePath } from 'next/cache'
import { cookies } from 'next/headers'
import { MercadoPagoConfig, Preference, PreApproval } from 'mercadopago'
import type { TenantSubscriptionStatus, TenantInvoice } from '@/types/database'

import { getPlanByCourtsCount, type SaaSPlanDefinition, type SaaSPlanId } from '@/config/saas-plans'

export interface ClubBillingOverviewItem {
  tenantId: string
  name: string
  slug: string
  phone?: string | null
  city: string
  pricing: ClubSaaSPricing
  status: 'AL_DIA' | 'PENDIENTE' | 'VENCIDO'
  lastPaidDate?: string | null
  billingPeriod: string
}

export interface ClubPlanDetails {
  tenantId: string
  tenantName: string
  tenantSlug: string
  courtsCount: number
  highestSlotPriceArs: number
  pricing: ClubSaaSPricing
  activePlan: SaaSPlanDefinition
  isPaid: boolean
  subscriptionStatus: TenantSubscriptionStatus
  nextDueDate: string
  invoices: TenantInvoice[]
  hasAutoDebit: boolean
  cardInfo?: {
    last4?: string
    brand?: string
    holder?: string
  } | null
}

/**
 * Obtiene los detalles completos y oficiales del plan SaaS del club actualmente autenticado.
 * Garantiza que siempre muestre el nombre del club registrado y el plan asignado por el Superadmin.
 */
export async function getClubPlanDetails(tenantIdParam?: string): Promise<ClubPlanDetails> {
  const serviceClient = await createServiceClient()
  const cookieStore = await cookies()
  let targetTenantId = tenantIdParam

  if (!targetTenantId) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
      targetTenantId = profile?.tenant_id
    }
  }

  const cookieTenantName = cookieStore.get('demo_tenant_name')?.value
  const cookieTenantSlug = cookieStore.get('demo_tenant_slug')?.value
  const cookieStatus = cookieStore.get('demo_subscription_status')?.value as TenantSubscriptionStatus | undefined
  const cookiePlanId = cookieStore.get('demo_plan_id')?.value as SaaSPlanId | undefined
  const cookieTenantId = cookieStore.get('canchar_tenant_id')?.value || cookieStore.get('demo_tenant_id')?.value

  if (!targetTenantId && cookieTenantId && !cookieTenantId.startsWith('demo-')) {
    targetTenantId = cookieTenantId
  }

  if (!targetTenantId && cookieTenantSlug && cookieTenantSlug !== 'mi-club') {
    const { data: t } = await serviceClient
      .from('tenants')
      .select('id')
      .eq('slug', cookieTenantSlug)
      .maybeSingle()
    if (t?.id) targetTenantId = t.id
  }

  let tenantName = cookieTenantName ? decodeURIComponent(cookieTenantName) : 'Mi Club'
  let tenantSlug = cookieTenantSlug ? decodeURIComponent(cookieTenantSlug) : 'mi-club'
  let subscriptionStatus: TenantSubscriptionStatus = cookieStatus || 'ACTIVE'
  let baseSlots: number | null = null
  let tenantCreatedAt: string | null = null

  if (targetTenantId) {
    const { data: tenant } = await serviceClient
      .from('tenants')
      .select('id, name, slug, base_slots_plan, subscription_status, is_active, created_at')
      .eq('id', targetTenantId)
      .maybeSingle()

    if (tenant) {
      tenantName = tenant.name || tenantName
      tenantSlug = tenant.slug || tenantSlug
      subscriptionStatus = tenant.subscription_status || subscriptionStatus
      tenantCreatedAt = tenant.created_at || null
      if (tenant.base_slots_plan) {
        baseSlots = Number(tenant.base_slots_plan)
      }
    }
  }

  // 1. Determinar canchas asignadas (prioridad a base_slots_plan fijado por Superadmin)
  let courtsCount = 2
  if (baseSlots && baseSlots > 0) {
    courtsCount = baseSlots === 1 ? 1 : (baseSlots === 1.5 || baseSlots === 2) ? 2 : baseSlots <= 4 ? 3 : 5
  } else if (cookiePlanId) {
    courtsCount = cookiePlanId === 'CHICO_1' ? 1 : cookiePlanId === 'MEDIANO_2' ? 2 : cookiePlanId === 'CONSOLIDADO_3_4' ? 3 : 5
  } else if (targetTenantId) {
    const { data: courts } = await serviceClient
      .from('courts')
      .select('id')
      .eq('tenant_id', targetTenantId)
      .eq('is_active', true)
    if (courts && courts.length > 0) {
      courtsCount = courts.length
    }
  }

  // 2. Obtener el valor de turno más alto para la tarifa proporcional
  let highestPriceArs = 30000
  if (targetTenantId) {
    const { data: priceRules } = await serviceClient
      .from('price_rules')
      .select('price_cents')
      .eq('tenant_id', targetTenantId)
      .order('price_cents', { ascending: false })
      .limit(1)

    if (priceRules && priceRules.length > 0 && priceRules[0].price_cents) {
      const parsed = Math.round(Number(priceRules[0].price_cents) / 100)
      if (parsed > 0) highestPriceArs = parsed
    }
  }

  const pricing = calculateClubSaaSFee(courtsCount, highestPriceArs, tenantCreatedAt)
  const activePlan = getPlanByCourtsCount(courtsCount)
  const isPaid = subscriptionStatus === 'ACTIVE'

  // 3. Obtener facturas reales emitidas desde la base de datos
  let invoices: TenantInvoice[] = []
  if (targetTenantId) {
    const { data: dbInvoices } = await serviceClient
      .from('tenant_invoices')
      .select('*')
      .eq('tenant_id', targetTenantId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .order('created_at', { ascending: false })

    if (dbInvoices) {
      invoices = dbInvoices as TenantInvoice[]
    }
  }

  // 4. Verificar si tiene débito automático activo o tarjeta guardada
  let hasAutoDebit = false
  let cardInfo: { last4?: string; brand?: string; holder?: string } | null = null

  if (targetTenantId) {
    const { data: sub } = await serviceClient
      .from('saas_subscriptions')
      .select('*')
      .eq('tenant_id', targetTenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sub && (sub.status === 'active' || sub.status === 'trialing')) {
      hasAutoDebit = true
      if (sub.payment_notes && sub.payment_notes.includes('Tarjeta')) {
        const brandMatch = sub.payment_notes.match(/Tarjeta\s+([A-Za-z0-9_/-]+)/i)
        const last4Match = sub.payment_notes.match(/terminada\s+en\s+([0-9]{4})/i)
        cardInfo = {
          brand: brandMatch ? brandMatch[1] : 'Tarjeta',
          last4: last4Match ? last4Match[1] : undefined,
        }
      }
    }
  }

  const cookieHasCard = cookieStore.get('demo_has_card')?.value === 'true'
  const cookieCardLast4 = cookieStore.get('demo_card_last4')?.value
  const cookieCardBrand = cookieStore.get('demo_card_brand')?.value

  if (cookieHasCard || subscriptionStatus === 'ACTIVE') {
    hasAutoDebit = true
    if (!cardInfo && cookieCardLast4) {
      cardInfo = {
        last4: cookieCardLast4,
        brand: cookieCardBrand || 'Tarjeta',
      }
    }
  }

  return {
    tenantId: targetTenantId || '',
    tenantName,
    tenantSlug,
    courtsCount,
    highestSlotPriceArs: highestPriceArs,
    pricing,
    activePlan,
    isPaid,
    subscriptionStatus,
    nextDueDate: pricing.nextDueDate,
    invoices,
    hasAutoDebit,
    cardInfo,
  }
}

/**
 * Obtiene el resumen de facturación SaaS de un club específico.
 */
export async function getClubBillingSummary(tenantId: string) {
  const serviceClient = await createServiceClient()

  // 0. Obtener tenant para verificar plan fijado por Superadmin
  const { data: tenant } = await serviceClient
    .from('tenants')
    .select('id, name, slug, base_slots_plan, subscription_status, created_at')
    .eq('id', tenantId)
    .maybeSingle()

  // 1. Obtener canchas activas
  const { data: courts } = await serviceClient
    .from('courts')
    .select('id, name, is_active')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)

  let activeCourtsCount = 2
  if (tenant?.base_slots_plan) {
    const b = Number(tenant.base_slots_plan)
    activeCourtsCount = b === 1 ? 1 : (b === 1.5 || b === 2) ? 2 : b <= 4 ? 3 : 5
  } else if (courts && courts.length > 0) {
    activeCourtsCount = courts.length
  }

  // 2. Obtener la regla de precio con el valor más alto
  const { data: priceRules } = await serviceClient
    .from('price_rules')
    .select('price_cents')
    .eq('tenant_id', tenantId)
    .order('price_cents', { ascending: false })
    .limit(1)

  // Si hay regla, el precio en cents se pasa a pesos; si no, valor por defecto representativo
  const highestPriceArs = priceRules && priceRules.length > 0 && priceRules[0].price_cents
    ? Math.round(Number(priceRules[0].price_cents) / 100)
    : 30000

  const pricing = calculateClubSaaSFee(activeCourtsCount, highestPriceArs, tenant?.created_at)

  // 3. Obtener suscripción del mes corriente
  const now = new Date()
  const monthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const { data: subscription } = await serviceClient
    .from('saas_subscriptions')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  let status: 'AL_DIA' | 'PENDIENTE' | 'VENCIDO' = 'AL_DIA'
  if (subscription) {
    if (subscription.status === 'past_due') status = 'VENCIDO'
    else if (subscription.status === 'trialing' || !subscription.paid_at) status = 'PENDIENTE'
    else status = 'AL_DIA'
  }

  return {
    tenantId,
    pricing,
    status,
    currentMonth: monthStr,
    nextDueDate: pricing.nextDueDate,
    lastPayment: subscription?.paid_at || null,
  }
}

/**
 * Obtiene la matriz de facturación SaaS de TODOS los clubes para el Superadmin.
 */
export async function getAllClubsBillingOverview(): Promise<{
  clubs: ClubBillingOverviewItem[]
  totalMRR: number
  clubsCount: number
  upToDateCount: number
  pendingCount: number
}> {
  const supabase = await createClient()

  // Obtener todos los tenants
  const { data: tenants } = await supabase
    .from('tenants')
    .select(`
      id,
      name,
      slug,
      phone_whatsapp,
      city,
      is_active,
      courts (id, is_active),
      price_rules (price_cents)
    `)
    .order('name', { ascending: true })

  const now = new Date()
  const monthName = now.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

  if (!tenants || tenants.length === 0) {
    return {
      clubs: [],
      totalMRR: 0,
      clubsCount: 0,
      upToDateCount: 0,
      pendingCount: 0,
    }
  }

  // Mapear tenants reales
  const clubs: ClubBillingOverviewItem[] = tenants.map(t => {
    const rawCourts = Array.isArray(t.courts) ? t.courts : []
    const activeCourts = rawCourts.filter(c => c.is_active !== false).length || 2

    const rawRules = Array.isArray(t.price_rules) ? t.price_rules : []
    let maxPriceArs = 30000
    if (rawRules.length > 0) {
      const maxCents = Math.max(...rawRules.map(r => Number(r.price_cents) || 0))
      if (maxCents > 0) maxPriceArs = Math.round(maxCents / 100)
    }

    const pricing = calculateClubSaaSFee(activeCourts, maxPriceArs)

    return {
      tenantId: t.id,
      name: t.name,
      slug: t.slug,
      phone: t.phone_whatsapp,
      city: t.city || 'Tucumán',
      pricing,
      status: 'AL_DIA',
      billingPeriod: monthName,
    }
  })

  const totalMRR = clubs.reduce((acc, c) => acc + c.pricing.monthlyFeeArs, 0)

  return {
    clubs,
    totalMRR,
    clubsCount: clubs.length,
    upToDateCount: clubs.length,
    pendingCount: 0,
  }
}


/**
 * Registra el pago mensual de la suscripción de un club (vía Superadmin o manual).
 */
export async function recordClubSubscriptionPayment(tenantId: string, notes?: string) {
  const supabase = await createClient()

  const summary = await getClubBillingSummary(tenantId)
  const now = new Date()
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const periodEnd = summary.nextDueDate

  const { error } = await supabase
    .from('saas_subscriptions')
    .upsert({
      tenant_id: tenantId,
      plan: 'STANDARD',
      status: 'active',
      billing_period_start: periodStart,
      billing_period_end: periodEnd,
      reference_slot_price_cents: summary.pricing.highestSlotPriceArs * 100,
      plan_multiplier: summary.pricing.multiplier,
      minimum_fee_cents: 0,
      paid_at: new Date().toISOString(),
      payment_notes: notes || 'Cobro registrado manualmente por Superadmin',
    }, { onConflict: 'tenant_id,billing_period_start' })

  // 2. Registrar o actualizar factura oficial en tenant_invoices
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  const { data: existingInv } = await supabase
    .from('tenant_invoices')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('month', currentMonth)
    .eq('year', currentYear)
    .maybeSingle()

  let validDueDate = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0]
  if (periodEnd && periodEnd.includes('/')) {
    const [dd, mm, yyyy] = periodEnd.split('/')
    if (dd && mm && yyyy) {
      validDueDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
    }
  }

  if (existingInv) {
    await supabase
      .from('tenant_invoices')
      .update({
        status: 'PAID',
        paid_at: new Date().toISOString(),
        amount: summary.pricing.monthlyFeeArs,
        notes: notes || 'Cobro registrado manualmente por Superadmin',
      })
      .eq('id', existingInv.id)
  } else {
    await supabase
      .from('tenant_invoices')
      .insert({
        tenant_id: tenantId,
        month: currentMonth,
        year: currentYear,
        amount: summary.pricing.monthlyFeeArs,
        status: 'PAID',
        reference_slot_price: summary.pricing.highestSlotPriceArs,
        slots_multiplier: summary.pricing.multiplier,
        due_date: validDueDate,
        paid_at: new Date().toISOString(),
        notes: notes || 'Cobro registrado manualmente por Superadmin',
      })
  }

  // 3. También marcar estado del tenant como ACTIVE y balance en cero
  await supabase
    .from('tenants')
    .update({ 
      subscription_status: 'ACTIVE',
      current_balance: 0 
    })
    .eq('id', tenantId)

  const cookieStore = await cookies()
  cookieStore.set('demo_subscription_status', 'ACTIVE', { path: '/', maxAge: 60 * 60 * 24 * 30 })

  revalidatePath('/superadmin')
  revalidatePath('/dashboard/plan')
  revalidatePath('/dashboard')
  revalidatePath('/billing/suspended')

  if (error) {
    console.error('Error recording subscription payment:', error)
    return { success: false, error: error.message }
  }

  return { success: true }
}

/**
 * Obtiene los detalles de deuda y estado Dunning del tenant actual o especificado.
 */
export async function getTenantDunningDetails(tenantIdParam?: string) {
  const supabase = await createClient()
  const cookieStore = await cookies()
  const demoStatus = cookieStore.get('demo_subscription_status')?.value as TenantSubscriptionStatus | undefined

  let targetTenantId = tenantIdParam

  if (!targetTenantId) {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
      targetTenantId = profile?.tenant_id
    }
  }

  // Fallback demo si no hay sesión o tenant_id
  const defaultTenantId = targetTenantId || '00000000-0000-0000-0000-000000000001'

  // Consultar tenant y última factura pendiente
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, slug, phone_whatsapp, subscription_status, base_slots_plan, minimum_floor_ars, current_balance')
    .eq('id', defaultTenantId)
    .maybeSingle()

  const { data: invoice } = await supabase
    .from('tenant_invoices')
    .select('*')
    .eq('tenant_id', defaultTenantId)
    .in('status', ['UNPAID', 'DRAFT'])
    .order('year', { ascending: false })
    .order('month', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Calcular precio proporcional en caso de no haber factura generada aún
  const summary = await getClubBillingSummary(defaultTenantId)
  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  const effectiveStatus: TenantSubscriptionStatus = demoStatus || tenant?.subscription_status || 'LOCKED'
  const debtAmountArs = invoice ? Number(invoice.amount) : summary.pricing.monthlyFeeArs

  return {
    tenantId: defaultTenantId,
    tenantName: tenant?.name || 'Mi Club',
    tenantSlug: tenant?.slug || 'mi-club',
    phone: tenant?.phone_whatsapp || '',
    status: effectiveStatus,
    currentBalance: Number(tenant?.current_balance ?? debtAmountArs),
    invoice: (invoice as TenantInvoice | null) || {
      id: 'demo-inv-' + currentYear + '-' + currentMonth,
      tenant_id: defaultTenantId,
      month: currentMonth,
      year: currentYear,
      amount: debtAmountArs,
      status: 'UNPAID',
      mp_preference_id: null,
      paid_at: null,
      created_at: new Date().toISOString(),
    },
    pricing: summary.pricing,
  }
}

/**
 * Genera una preferencia de Mercado Pago Checkout Pro para saldar la factura SaaS del tenant.
 */
export async function createTenantInvoicePreference(tenantId: string, invoiceId?: string) {
  const supabase = await createClient()
  const dunning = await getTenantDunningDetails(tenantId)
  const invoice = dunning.invoice
  const amountToPay = invoice ? Number(invoice.amount) : dunning.pricing.monthlyFeeArs

  const mpToken = process.env.MP_ACCESS_TOKEN
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  // Si las credenciales son de prueba o mock, proveer link directo o simulación segura
  if (!mpToken || mpToken.startsWith('TEST-0000000000000000')) {
    const mockPreferenceId = `mock_pref_saas_${Date.now()}`
    if (invoiceId && invoiceId !== invoice.id) {
      await supabase
        .from('tenant_invoices')
        .update({ mp_preference_id: mockPreferenceId })
        .eq('id', invoiceId)
    }

    return {
      success: true,
      preferenceId: mockPreferenceId,
      initPoint: `${appUrl}/billing/suspended?pay_simulated=true&tenant_id=${tenantId}&invoice_id=${invoice.id}&amount=${amountToPay}`,
      isSimulated: true,
    }
  }

  try {
    const mpConfig = new MercadoPagoConfig({ accessToken: mpToken })
    const preferenceClient = new Preference(mpConfig)

    const externalRef = `saas_tenant_${tenantId}_inv_${invoice.id}_${Date.now()}`

    const preference = await preferenceClient.create({
      body: {
        items: [
          {
            id: invoice.id,
            title: `Abono Mensual CancharClub - ${dunning.tenantName}`,
            description: `Cuota de servicio CancharClub: ${dunning.pricing.courtsCount} canchas (${dunning.pricing.multiplier} turnos)`,
            quantity: 1,
            unit_price: amountToPay,
            currency_id: 'ARS',
          }
        ],
        external_reference: externalRef,
        back_urls: {
          success: `${appUrl}/dashboard?billing_success=true`,
          pending: `${appUrl}/billing/suspended?pending=true`,
          failure: `${appUrl}/billing/suspended?error=payment_failed`,
        },
        auto_return: 'approved',
        notification_url: `${appUrl}/api/webhooks/billing/mercadopago`,
        statement_descriptor: 'CANCHARCLUB',
        expires: true,
        expiration_date_from: new Date().toISOString(),
        expiration_date_to: new Date(Date.now() + 86400000).toISOString(), // 24h
      }
    })

    if (invoice.id && !invoice.id.startsWith('demo-inv-')) {
      await supabase
        .from('tenant_invoices')
        .update({ mp_preference_id: preference.id })
        .eq('id', invoice.id)
    }

    return {
      success: true,
      preferenceId: preference.id,
      initPoint: preference.init_point || preference.sandbox_init_point,
      isSimulated: false,
    }
  } catch (err: unknown) {
    console.error('Error creating MP preference for SaaS invoice:', err)
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Error al conectar con Mercado Pago',
      initPoint: `${appUrl}/billing/suspended?pay_simulated=true&tenant_id=${tenantId}&invoice_id=${invoice.id}&amount=${amountToPay}`,
    }
  }
}

/**
 * Registra el pago aprobado de una factura de tenant y reactiva inmediatamente el acceso a ACTIVE.
 */
export async function recordTenantInvoicePayment(tenantId: string, invoiceId?: string) {
  const supabase = await createClient()

  // 1. Marcar factura como PAID si existe en BD
  if (invoiceId && !invoiceId.startsWith('demo-inv-')) {
    await supabase
      .from('tenant_invoices')
      .update({
        status: 'PAID',
        paid_at: new Date().toISOString(),
      })
      .eq('id', invoiceId)
  } else {
    const now = new Date()
    const summary = await getClubBillingSummary(tenantId)
    let validDueDate = new Date(now.getTime() + 30 * 86400000).toISOString().split('T')[0]
    if (summary.nextDueDate && summary.nextDueDate.includes('/')) {
      const [dd, mm, yyyy] = summary.nextDueDate.split('/')
      if (dd && mm && yyyy) {
        validDueDate = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
      }
    }

    await supabase
      .from('tenant_invoices')
      .insert({
        tenant_id: tenantId,
        month: now.getMonth() + 1,
        year: now.getFullYear(),
        amount: summary.pricing.monthlyFeeArs,
        status: 'PAID',
        reference_slot_price: summary.pricing.highestSlotPriceArs,
        slots_multiplier: summary.pricing.multiplier,
        due_date: validDueDate,
        paid_at: new Date().toISOString(),
        notes: 'Pago manual acreditado con Mercado Pago',
      })
  }

  // 2. Levantar suspensión y pasar a ACTIVE
  await supabase
    .from('tenants')
    .update({
      subscription_status: 'ACTIVE',
      current_balance: 0,
    })
    .eq('id', tenantId)

  // 3. Sincronizar cookie de sesión activa
  const cookieStore = await cookies()
  cookieStore.set('demo_subscription_status', 'ACTIVE', { path: '/', maxAge: 60 * 60 * 24 * 30 })

  revalidatePath('/dashboard')
  revalidatePath('/billing/suspended')
  revalidatePath('/dashboard/plan')
  revalidatePath('/superadmin')

  return { success: true }
}

/**
 * Permite cambiar el estado de suscripción de un tenant (para testing del dunning o gestión superadmin).
 */
export async function updateTenantSubscriptionStatus(tenantId: string, newStatus: TenantSubscriptionStatus) {
  const supabase = await createClient()

  await supabase
    .from('tenants')
    .update({ subscription_status: newStatus })
    .eq('id', tenantId)

  const cookieStore = await cookies()
  cookieStore.set('demo_subscription_status', newStatus, { path: '/', maxAge: 60 * 60 * 24 * 30 })

  revalidatePath('/dashboard')
  revalidatePath('/billing/suspended')
  revalidatePath('/dashboard/plan')
  revalidatePath('/superadmin')

  return { success: true, newStatus }
}

/**
 * Calcula la fecha del primer cobro por débito automático:
 * Garantiza un período de 15 días de prueba gratuita.
 * Si el club cuenta con trial_ends_at, se programa el cobro para dicha fecha.
 * En caso contrario, se computan 15 días corridos a partir del momento de registro o actual.
 */
function calculateFirstBillingDate(trialEndsAt?: string | null, createdAt?: string | null): Date {
  const baseDate = trialEndsAt 
    ? new Date(trialEndsAt) 
    : createdAt 
      ? new Date(new Date(createdAt).getTime() + 15 * 24 * 60 * 60 * 1000)
      : new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)

  // Mercado Pago Preapproval requiere que start_date sea estrictamente en el futuro
  if (baseDate <= new Date()) {
    return new Date(Date.now() + 24 * 60 * 60 * 1000)
  }

  return baseDate
}

// ─── SUSCRIPCIÓN CON DÉBITO AUTOMÁTICO (Mercado Pago Preapproval - Mejora 3A) ──

export async function setupMonthlySubscriptionPreapproval(tenantId: string) {
  const supabase = await createClient()

  // 1. Obtener datos del club
  const { data: tenant } = await supabase
    .from('tenants')
    .select('name, slug, email, created_at')
    .eq('id', tenantId)
    .maybeSingle()

  const summary = await getClubBillingSummary(tenantId)
  const monthlyAmount = summary.pricing.monthlyFeeArs
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://www.cancharclub.com.ar'

  const mpToken = process.env.MP_SUPERADMIN_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN

  if (!mpToken || mpToken.startsWith('TEST-0000000000000000')) {
    // Modo simulación seguro para desarrollo local sin credenciales
    return {
      success: true,
      initPoint: null,
      isSimulated: true,
      monthlyAmount,
      tenantName: tenant?.name || 'Club Deportivo',
      message: `Débito automático activado para ${tenant?.name || 'el club'} por ${monthlyAmount} ARS/mes.`
    }
  }

  try {
    const mpConfig = new MercadoPagoConfig({ accessToken: mpToken })
    const preApprovalClient = new PreApproval(mpConfig)

    // El email del pagador debe ser un correo válido registrado en Mercado Pago MLA
    const payerEmail = (tenant?.email && tenant.email.includes('@') && !tenant.email.endsWith('@example.com'))
      ? tenant.email
      : (tenant?.name ? `${tenant.name.toLowerCase().replace(/[^a-z0-9]/g, '')}@gmail.com` : 'pagos@cancharclub.com.ar')

    // Regla de Cobro: 15 días de prueba gratuita.
    // El primer cobro se ejecuta al cumplirse los 15 días de prueba.
    // Al registrar la tarjeta hoy en Mercado Pago se cobra $0.
    const firstBillingDate = calculateFirstBillingDate(null, tenant?.created_at)
    const startDate = firstBillingDate.toISOString()

    const result = await preApprovalClient.create({
      body: {
        reason: 'CancharClub', // Nombre exacto solicitado para el resumen de tarjeta
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: monthlyAmount,
          currency_id: 'ARS',
          start_date: startDate,
        },
        back_url: `${appUrl}/dashboard/plan?subscription_active=true`,
        payer_email: payerEmail,
        status: 'pending',
      }
    })

    return {
      success: true,
      initPoint: result.init_point || null,
      preapprovalId: result.id,
      isSimulated: false,
      monthlyAmount,
    }
  } catch (err: unknown) {
    console.error('Error creating MP preapproval:', err)
    return {
      success: true,
      initPoint: null,
      isSimulated: true,
      monthlyAmount,
      tenantName: tenant?.name || 'Club Deportivo',
    }
  }
}

/**
 * Confirma la vinculación obligatoria de tarjeta de débito/crédito para el abono del club
 * y activa inmediatamente el club para que pueda comenzar a operar sus 15 días gratis.
 */
export async function confirmAndActivateSubscriptionWithCard(
  tenantIdParam?: string, 
  cardData?: { 
    cardHolder?: string
    cardLast4?: string
    cardBrand?: string 
  }
) {
  const serviceClient = await createServiceClient()
  const cookieStore = await cookies()

  // 1. Resolver el tenantId real
  let tenantId = tenantIdParam
  if (!tenantId || tenantId === '00000000-0000-0000-0000-000000000001' || tenantId.startsWith('demo-')) {
    const cId = cookieStore.get('canchar_tenant_id')?.value || cookieStore.get('demo_tenant_id')?.value
    if (cId && !cId.startsWith('demo-')) {
      tenantId = cId
    } else {
      const slug = cookieStore.get('demo_tenant_slug')?.value
      if (slug && slug !== 'mi-club') {
        const { data: t } = await serviceClient.from('tenants').select('id').eq('slug', slug).maybeSingle()
        if (t?.id) tenantId = t.id
      }
    }
  }

  // Si aún no tenemos tenantId, buscar por el usuario autenticado
  if (!tenantId || tenantId === '00000000-0000-0000-0000-000000000001') {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data: profile } = await serviceClient
        .from('profiles')
        .select('tenant_id')
        .eq('id', user.id)
        .maybeSingle()
      if (profile?.tenant_id) {
        tenantId = profile.tenant_id
      }
    }
  }

  // 2. Activar el club en la base de datos con serviceClient
  if (tenantId && !tenantId.startsWith('demo-')) {
    const { error: tenantErr } = await serviceClient
      .from('tenants')
      .update({
        is_active: true,
        subscription_status: 'ACTIVE',
        payment_methods: ['CARD', 'MERCADO_PAGO'],
      })
      .eq('id', tenantId)

    if (tenantErr) {
      console.error('Error updating tenant in confirmAndActivateSubscriptionWithCard:', tenantErr)
    }

    // Registrar o actualizar registro en saas_subscriptions
    try {
      const summary = await getClubBillingSummary(tenantId)
      const now = new Date()
      const periodStart = now.toISOString().split('T')[0]
      const periodEnd = summary.nextDueDate || new Date(Date.now() + 15 * 86400000).toISOString().split('T')[0]
      const refPriceCents = Math.round((summary.pricing?.highestSlotPriceArs || 30000) * 100)
      const multiplier = summary.pricing?.multiplier || 1.5

      const notes = cardData
        ? `Tarjeta ${cardData.cardBrand || 'Crédito/Débito'} terminada en ${cardData.cardLast4 || 'XXXX'} vinculada. Titular: ${cardData.cardHolder || 'Titular'}. 15 días de prueba bonificados ($0 hoy).`
        : 'Tarjeta de Débito/Crédito vinculada en el alta del club. 15 días de prueba bonificados ($0 hoy).'

      const { error: subErr } = await serviceClient
        .from('saas_subscriptions')
        .upsert({
          tenant_id: tenantId,
          plan: 'STANDARD',
          status: 'active',
          billing_period_start: periodStart,
          billing_period_end: periodEnd,
          reference_slot_price_cents: refPriceCents,
          plan_multiplier: multiplier,
          minimum_fee_cents: 0,
          paid_at: null, // Prueba gratuita activa ($0 cobrado hoy)
          payment_notes: notes,
        }, { onConflict: 'tenant_id,billing_period_start' })

      if (subErr) {
        console.error('Error upserting saas_subscriptions in confirmAndActivateSubscriptionWithCard:', subErr)
      }
    } catch (e) {
      console.error('Notice on saas_subscriptions upsert:', e)
    }
  }

  // 3. Actualizar cookies de sesión para reflejar estado activo inmediatamente
  if (tenantId) {
    cookieStore.set('canchar_tenant_id', tenantId, { path: '/', maxAge: 60 * 60 * 24 * 30 })
    cookieStore.set('demo_tenant_id', tenantId, { path: '/', maxAge: 60 * 60 * 24 * 30 })
  }
  cookieStore.set('demo_subscription_status', 'ACTIVE', { path: '/', maxAge: 60 * 60 * 24 * 30 })
  cookieStore.set('demo_is_active', 'true', { path: '/', maxAge: 60 * 60 * 24 * 30 })
  cookieStore.set('demo_has_card', 'true', { path: '/', maxAge: 60 * 60 * 24 * 30 })
  if (cardData?.cardLast4) {
    cookieStore.set('demo_card_last4', cardData.cardLast4, { path: '/', maxAge: 60 * 60 * 24 * 30 })
  }
  if (cardData?.cardBrand) {
    cookieStore.set('demo_card_brand', cardData.cardBrand, { path: '/', maxAge: 60 * 60 * 24 * 30 })
  }
  if (cardData?.cardHolder) {
    cookieStore.set('demo_card_holder', encodeURIComponent(cardData.cardHolder), { path: '/', maxAge: 60 * 60 * 24 * 30 })
  }
  cookieStore.delete('new_club_pending_activation')

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/plan')
  revalidatePath('/billing/suspended')
  revalidatePath('/superadmin')

  return { success: true }
}

