import { DashboardLayoutClient } from '@/components/dashboard/dashboard-layout-client'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { GracePeriodBanner } from '@/components/billing/grace-period-banner'
import { TenantProvider } from '@/hooks/use-tenant-id'
import type { TenantSubscriptionStatus } from '@/types/database'
import type { SaaSPlanId } from '@/config/saas-plans'
import { calculateClubSaaSFee, calculateDaysUntilDueDate } from '@/lib/saas-pricing'
import { verifySuperadminSessionToken } from '@/lib/auth-security'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()

  const saSession = cookieStore.get('sa_session')?.value
  const saSecret = process.env.SUPERADMIN_SESSION_SECRET
  const isSuperadminHMAC = Boolean(saSession && saSecret && verifySuperadminSessionToken(saSession, saSecret))
  const isSuperadminUser = Boolean(process.env.SUPERADMIN_USER_ID && user?.id === process.env.SUPERADMIN_USER_ID)
  const isSuperadminRole = cookieStore.get('demo_user_role')?.value === 'SUPERADMIN'
  const isSuperadmin = isSuperadminHMAC || isSuperadminUser || isSuperadminRole

  if (!user && !isSuperadmin) {
    redirect('/auth/login')
  }

  const serviceClient = await createServiceClient()

  let tenantId: string | null = null
  let tenantName = 'Mi Club Deportivo'
  let tenantSlug = 'mi-club'
  let userRole = 'TENANT_ADMIN'
  let userName = 'Dueno del Club'
  let mpConnected = true
  let subscriptionStatus: TenantSubscriptionStatus = 'ACTIVE'
  let planId: SaaSPlanId | undefined = undefined
  let tenantCreatedAt: string | null = null
  let cancellationEffectiveDate: string | null = null
  let isActive = true
  let hasCard = false

  function checkMpConnected(t: { mp_access_token?: string | null }): boolean {
    return Boolean(t.mp_access_token)
  }

  function parseTenantMeta(desc: string | null) {
    if (!desc) return
    try {
      const meta = JSON.parse(desc)
      if (meta.cancellation_effective_date) {
        cancellationEffectiveDate = String(meta.cancellation_effective_date)
      }
      if (meta.card_linked) hasCard = true
    } catch {}
  }

  function resolvePlanId(planIdField: string | null | undefined, baseSlotsField: number | null | undefined): SaaSPlanId | undefined {
    if (planIdField && ['CHICO_1', 'MEDIANO_2', 'CONSOLIDADO_3_4', 'GRANDE_5_PLUS'].includes(planIdField)) {
      return planIdField as SaaSPlanId
    }
    if (baseSlotsField) {
      return baseSlotsField === 1 ? 'CHICO_1' : baseSlotsField === 2 ? 'MEDIANO_2' : baseSlotsField <= 4 ? 'CONSOLIDADO_3_4' : 'GRANDE_5_PLUS'
    }
    return undefined
  }

  function mapSport(s: string): string {
    if (s === 'FUTBOL11' || s === 'FUTBOL_11') return 'Futbol 11'
    if (s === 'FUTBOL7' || s === 'FUTBOL_7') return 'Futbol 7'
    if (s === 'FUTBOL5' || s === 'FUTBOL_5') return 'Futbol 5'
    if (s === 'PADEL') return 'Padel'
    if (s === 'TENIS') return 'Tenis'
    if (s === 'BASQUET' || s === 'BASKET') return 'Basquet'
    return s
  }

  let initialCourtsCount = 0
  let initialSports: string[] = []

  if (isSuperadmin) {
    userRole = 'SUPERADMIN'
    userName = cookieStore.get('demo_user_name')?.value || 'Superadmin Plataforma'
    const requestedTenantId = cookieStore.get('canchar_tenant_id')?.value || cookieStore.get('demo_tenant_id')?.value
    if (requestedTenantId) {
      const [tenantRes, courtsRes, subRes] = await Promise.all([
        serviceClient
          .from('tenants')
          .select('id, name, slug, mp_access_token, subscription_status, is_active, base_slots_plan, created_at, description, plan_id')
          .eq('id', requestedTenantId)
          .maybeSingle(),
        serviceClient
          .from('courts')
          .select('id, sport, is_active')
          .eq('tenant_id', requestedTenantId),
        serviceClient
          .from('saas_subscriptions')
          .select('payment_notes, status')
          .eq('tenant_id', requestedTenantId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ])

      const st = tenantRes.data
      if (st) {
        tenantId = st.id
        tenantName = st.name || tenantName
        tenantSlug = st.slug || tenantSlug
        mpConnected = checkMpConnected(st)
        if (st.created_at) tenantCreatedAt = st.created_at
        parseTenantMeta(st.description || null)
        if (typeof st.is_active === 'boolean') isActive = st.is_active
        if (st.subscription_status) subscriptionStatus = st.subscription_status
        planId = resolvePlanId(st.plan_id, st.base_slots_plan)
      }

      const courtsData = courtsRes.data
      if (courtsData && courtsData.length > 0) {
        initialCourtsCount = courtsData.length
        initialSports = Array.from(new Set(courtsData.map(c => c.sport).filter(Boolean))).map(mapSport)
      }

      const subData = subRes.data
      if (subData?.payment_notes && (subData.payment_notes.includes('Tarjeta') || subData.payment_notes.includes('card'))) {
        hasCard = true
      }
    }

    const simulatedRole = cookieStore.get('demo_user_role')?.value
    if (simulatedRole === 'TENANT_STAFF' || simulatedRole === 'TENANT_ADMIN') {
      userRole = simulatedRole
    }
    const simulatedPlan = cookieStore.get('demo_plan_id')?.value as SaaSPlanId | undefined
    if (simulatedPlan && ['CHICO_1', 'MEDIANO_2', 'CONSOLIDADO_3_4', 'GRANDE_5_PLUS'].includes(simulatedPlan)) {
      planId = simulatedPlan
    }
  } else if (user) {
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role, full_name, tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    if (!profile || !profile.tenant_id) {
      console.warn('[SEGURIDAD] Acceso sin club: ' + user.email)
      await supabase.auth.signOut()
      redirect('/auth/login?error=no_club_assigned')
    }

    userRole = profile.role || 'TENANT_ADMIN'
    userName = profile.full_name || user.email?.split('@')[0] || 'Dueno del Club'

    const [tenantResult, courtsResult, subResult] = await Promise.all([
      serviceClient
        .from('tenants')
        .select('id, name, slug, mp_access_token, subscription_status, is_active, base_slots_plan, created_at, description, plan_id')
        .eq('id', profile.tenant_id)
        .maybeSingle(),
      serviceClient
        .from('courts')
        .select('id, sport, is_active')
        .eq('tenant_id', profile.tenant_id),
      serviceClient
        .from('saas_subscriptions')
        .select('payment_notes, status')
        .eq('tenant_id', profile.tenant_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    const t = tenantResult.data
    if (!t) {
      console.warn('[SEGURIDAD] Club no encontrado para ' + profile.tenant_id)
      await supabase.auth.signOut()
      redirect('/auth/login?error=club_not_found')
    }

    tenantId = t.id
    tenantName = t.name || tenantName
    tenantSlug = t.slug || tenantSlug
    mpConnected = checkMpConnected(t)
    if (t.created_at) tenantCreatedAt = t.created_at
    parseTenantMeta(t.description || null)
    if (typeof t.is_active === 'boolean') isActive = t.is_active
    if (t.subscription_status) subscriptionStatus = t.subscription_status
    planId = resolvePlanId(t.plan_id, t.base_slots_plan)

    const courtsData = courtsResult.data
    if (courtsData && courtsData.length > 0) {
      initialCourtsCount = courtsData.length
      initialSports = Array.from(new Set(courtsData.map(c => c.sport).filter(Boolean))).map(mapSport)
    }

    const subData = subResult.data
    if (subData?.payment_notes && (subData.payment_notes.includes('Tarjeta') || subData.payment_notes.includes('card'))) {
      hasCard = true
    }
    if (!hasCard) {
      const cookieHas = cookieStore.get('demo_has_card')?.value === 'true'
      const cookieLast4 = cookieStore.get('demo_card_last4')?.value
      if (cookieHas && cookieLast4) hasCard = true
    }
  }

  if ((subscriptionStatus as string) === 'PAYMENT_PENDING') {
    subscriptionStatus = 'ACTIVE'
  }

  if (!planId) {
    const courtsCount = initialCourtsCount > 0 ? initialCourtsCount : 2
    planId = courtsCount === 1 ? 'CHICO_1' : courtsCount === 2 ? 'MEDIANO_2' : courtsCount <= 4 ? 'CONSOLIDADO_3_4' : 'GRANDE_5_PLUS'
  }

  if (!isSuperadmin && tenantId && !hasCard) {
    redirect('/onboarding/tarjeta')
  }

  if (subscriptionStatus !== 'PAUSED' && subscriptionStatus !== 'LOCKED') {
    isActive = true
  }

  const pricing = calculateClubSaaSFee(initialCourtsCount || 2, 30000, tenantCreatedAt)
  const effectiveDueDate = cancellationEffectiveDate || pricing.nextDueDate
  const daysRemaining = calculateDaysUntilDueDate(effectiveDueDate)

  return (
    <DashboardLayoutClient
      tenantId={tenantId}
      tenantName={tenantName}
      tenantSlug={tenantSlug}
      userRole={userRole}
      userName={userName}
      mpConnected={mpConnected}
      planId={planId}
      isActive={isActive}
      hasCard={hasCard}
      courtsCount={initialCourtsCount}
      sports={initialSports}
      dueDate={effectiveDueDate}
      daysRemaining={daysRemaining}
      subscriptionStatus={subscriptionStatus}
      monthlyFeeArs={pricing.monthlyFeeArs}
      gracePeriodBanner={<GracePeriodBanner initialStatus={subscriptionStatus} />}
    >
      <TenantProvider value={tenantId} role={userRole} planId={planId}>
        {children}
      </TenantProvider>
    </DashboardLayoutClient>
  )
}
