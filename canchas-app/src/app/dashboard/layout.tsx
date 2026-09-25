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

  // 1. Verificación estricta de Superadmin (HMAC firmado o ID configurado)
  const saSession = cookieStore.get('sa_session')?.value
  const saSecret = process.env.SUPERADMIN_SESSION_SECRET
  const isSuperadminHMAC = Boolean(saSession && saSecret && verifySuperadminSessionToken(saSession, saSecret))
  const isSuperadminUser = Boolean(process.env.SUPERADMIN_USER_ID && user?.id === process.env.SUPERADMIN_USER_ID)
  const isSuperadminRole = cookieStore.get('demo_user_role')?.value === 'SUPERADMIN'
  const isSuperadmin = isSuperadminHMAC || isSuperadminUser || isSuperadminRole

  // 2. SEGURIDAD CRÍTICA MULTI-TENANT:
  // Si no hay usuario autenticado en Supabase y no es Superadmin:
  // EXPULSIÓN INMEDIATA al login. Jamás renderizar ni adivinar clubes.
  if (!user && !isSuperadmin) {
    redirect('/auth/login')
  }

  const serviceClient = await createServiceClient()

  let tenantId: string | null = null
  let tenantName = 'Mi Club Deportivo'
  let tenantSlug = 'mi-club'
  let userRole = 'TENANT_ADMIN'
  let userName = 'Dueño del Club'
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

  function parseTenantMeta(t: { created_at?: string | null; description?: string | null }) {
    if (t.created_at) tenantCreatedAt = t.created_at
    if (t.description) {
      try {
        const meta = JSON.parse(t.description)
        if (meta.cancellation_effective_date) {
          cancellationEffectiveDate = String(meta.cancellation_effective_date)
        }
      } catch {}
    }
  }

  if (isSuperadmin) {
    // Modo Superadmin: Puede ver el club que solicite explícitamente en cookies o el primero si no hay ninguno
    userRole = 'SUPERADMIN'
    userName = cookieStore.get('demo_user_name')?.value || 'Superadmin Plataforma'
    const requestedTenantId = cookieStore.get('canchar_tenant_id')?.value || cookieStore.get('demo_tenant_id')?.value
    if (requestedTenantId) {
      const { data: st } = await serviceClient
        .from('tenants')
        .select('id, name, slug, mp_access_token, subscription_status, is_active, base_slots_plan, payment_methods, created_at, description')
        .eq('id', requestedTenantId)
        .maybeSingle()
      if (st) {
        tenantId = st.id
        tenantName = st.name || tenantName
        tenantSlug = st.slug || tenantSlug
        mpConnected = checkMpConnected(st)
        parseTenantMeta(st)
        if (typeof st.is_active === 'boolean') isActive = st.is_active
        if (st.subscription_status) subscriptionStatus = st.subscription_status
        if (st.base_slots_plan) {
          planId = st.base_slots_plan === 1 ? 'CHICO_1' : st.base_slots_plan === 2 ? 'MEDIANO_2' : st.base_slots_plan <= 4 ? 'CONSOLIDADO_3_4' : 'GRANDE_5_PLUS'
        }
      }
    }
  } else if (user) {
    // 3. AISLAMIENTO TOTAL PARA CLUBES:
    // El club es EXCLUSIVAMENTE el vinculado al profile.tenant_id del usuario autenticado en Supabase.
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('role, full_name, tenant_id')
      .eq('id', user.id)
      .maybeSingle()

    // Si el usuario autenticado no tiene un perfil o no tiene club asignado:
    if (!profile || !profile.tenant_id) {
      console.warn(`[SEGURIDAD] Intento de acceso no autorizado al dashboard sin club asignado: usuario ${user.email} (${user.id}).`)
      await supabase.auth.signOut()
      redirect('/auth/login?error=no_club_assigned')
    }

    userRole = profile.role || 'TENANT_ADMIN'
    userName = profile.full_name || user.email?.split('@')[0] || 'Dueño del Club'

    // Obtener estrictamente los datos del club asignado a este usuario
    const { data: t } = await serviceClient
      .from('tenants')
      .select('id, name, slug, mp_access_token, subscription_status, is_active, base_slots_plan, payment_methods, created_at, description')
      .eq('id', profile.tenant_id)
      .maybeSingle()

    if (!t) {
      console.warn(`[SEGURIDAD] Club ID ${profile.tenant_id} asignado al usuario ${user.email} no existe en la base de datos. Expulsando.`)
      await supabase.auth.signOut()
      redirect('/auth/login?error=club_not_found')
    }

    tenantId = t.id
    tenantName = t.name || tenantName
    tenantSlug = t.slug || tenantSlug
    mpConnected = checkMpConnected(t)
    parseTenantMeta(t)
    if (typeof t.is_active === 'boolean') {
      isActive = t.is_active
    }
    if (t.subscription_status) {
      subscriptionStatus = t.subscription_status
    }
    if (t.base_slots_plan) {
      planId = t.base_slots_plan === 1 ? 'CHICO_1' : t.base_slots_plan === 2 ? 'MEDIANO_2' : t.base_slots_plan <= 4 ? 'CONSOLIDADO_3_4' : 'GRANDE_5_PLUS'
    }
  }

  // Normalizar status: PAYMENT_PENDING se normaliza a ACTIVE para no generar pantallas de espera
  if ((subscriptionStatus as string) === 'PAYMENT_PENDING') {
    subscriptionStatus = 'ACTIVE'
  }

  // Obtener canchas y deportes reales del club para sincronizar sedes/switcher
  let initialCourtsCount = 0
  let initialSports: string[] = []
  if (tenantId) {
    try {
      const { data: courtsData } = await serviceClient
        .from('courts')
        .select('id, sport, is_active')
        .eq('tenant_id', tenantId)
      if (courtsData && courtsData.length > 0) {
        initialCourtsCount = courtsData.length
        const rawSports = Array.from(new Set(courtsData.map(c => c.sport).filter(Boolean)))
        initialSports = rawSports.map(s => {
          if (s === 'FUTBOL5' || s === 'FUTBOL_5') return 'Fútbol 5'
          if (s === 'FUTBOL7' || s === 'FUTBOL_7') return 'Fútbol 7'
          if (s === 'PADEL') return 'Pádel'
          if (s === 'TENIS') return 'Tenis'
          if (s === 'BASQUET' || s === 'BASKET') return 'Básquet'
          return s
        })
      }
    } catch {}
  }

  // REGLA ESTRICTA DE ASIGNACIÓN DE PLAN SAAS:
  // Si no está explícitamente fijado, se calcula estrictamente según la cantidad real de canchas del club:
  if (!planId) {
    const courtsCount = initialCourtsCount > 0 ? initialCourtsCount : 2
    planId = courtsCount === 1 ? 'CHICO_1' : courtsCount === 2 ? 'MEDIANO_2' : courtsCount <= 4 ? 'CONSOLIDADO_3_4' : 'GRANDE_5_PLUS'
  }

  // Cálculo del vencimiento oficial y días restantes para alertas progresivas
  const pricing = calculateClubSaaSFee(initialCourtsCount || 2, 30000, tenantCreatedAt)
  const effectiveDueDate = cancellationEffectiveDate || pricing.nextDueDate
  const daysRemaining = calculateDaysUntilDueDate(effectiveDueDate)

  // Verificar en saas_subscriptions si el club ya vinculó su tarjeta oficial
  if (tenantId && !hasCard) {
    try {
      const { data: subData } = await serviceClient
        .from('saas_subscriptions')
        .select('payment_notes, status')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      if (subData && (subData.payment_notes?.includes('Tarjeta') || subData.payment_notes?.includes('card') || subData.status === 'active')) {
        hasCard = true
      }
    } catch {}
  }

  // Los clubes recién agregados o activos siempre tienen acceso operativo completo.
  // Solo se consideran bloqueados por mora si su estado es explícitamente PAUSED o LOCKED.
  if (subscriptionStatus !== 'PAUSED' && subscriptionStatus !== 'LOCKED') {
    isActive = true
  }

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
