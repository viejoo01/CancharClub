import { DashboardLayoutClient } from '@/components/dashboard/dashboard-layout-client'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { headers, cookies } from 'next/headers'
import { GracePeriodBanner } from '@/components/billing/grace-period-banner'
import { PendingActivationScreen } from '@/components/dashboard/pending-activation-screen'
import { TenantProvider } from '@/hooks/use-tenant-id'
import type { TenantSubscriptionStatus } from '@/types/database'
import type { SaaSPlanId } from '@/config/saas-plans'

export const dynamic = 'force-dynamic'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const headersList = await headers()
  const headerStatus = headersList.get('x-tenant-status') as TenantSubscriptionStatus | null
  const cookieStore = await cookies()
  const cookieStatus = cookieStore.get('demo_subscription_status')?.value as TenantSubscriptionStatus | null
  const cookiePlanId = cookieStore.get('demo_plan_id')?.value as SaaSPlanId | null
  const cookieRole = cookieStore.get('demo_user_role')?.value
  const cookieName = cookieStore.get('demo_user_name')?.value
  const cookieTenantName = cookieStore.get('demo_tenant_name')?.value
  const cookieTenantSlug = cookieStore.get('demo_tenant_slug')?.value
  const cookieTenantId = cookieStore.get('canchar_tenant_id')?.value || cookieStore.get('demo_tenant_id')?.value

  let tenantId: string | null = null
  let tenantName = cookieTenantName || 'Mi Club Deportivo'
  let tenantSlug = cookieTenantSlug || 'mi-club'
  let userRole = cookieRole || 'TENANT_ADMIN'
  let userName = cookieName || (cookieRole === 'TENANT_STAFF' ? 'Canchero (Mostrador)' : 'Dueño del Club')
  let mpConnected = true
  let subscriptionStatus: TenantSubscriptionStatus = cookieStatus || headerStatus || 'ACTIVE'
  let planId: SaaSPlanId | undefined = cookiePlanId || undefined

  const serviceClient = await createServiceClient()

  // Validar si el cookieTenantId existe efectivamente en la base de datos
  if (cookieTenantId) {
    const { data: checkT } = await serviceClient
      .from('tenants')
      .select('id, name, slug, mp_access_token, subscription_status, is_active, base_slots_plan')
      .eq('id', cookieTenantId)
      .maybeSingle()
    if (checkT) {
      tenantId = checkT.id
      tenantName = checkT.name || tenantName
      tenantSlug = checkT.slug || tenantSlug
    }
  }

  const cookieIsActive = cookieStore.get('demo_is_active')?.value
  let isActive = cookieIsActive === 'false' ? false : true

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, tenant_id, tenants(name, slug, mp_access_token, subscription_status, is_active, base_slots_plan)')
      .eq('id', user.id)
      .single()

    if (profile) {
      if (profile.tenant_id) {
        tenantId = profile.tenant_id
      }
      userRole = profile.role
      userName = profile.full_name || user.email?.split('@')[0] || 'Admin'
      const t = profile.tenants as unknown as {
        name?: string
        slug?: string
        mp_access_token?: string
        subscription_status?: TenantSubscriptionStatus
        is_active?: boolean
        base_slots_plan?: number
      } | null
      if (t) {
        tenantName = t.name || tenantName
        tenantSlug = t.slug || tenantSlug
        mpConnected = Boolean(t.mp_access_token)
        if (typeof t.is_active === 'boolean') {
          isActive = t.is_active
        } else if (cookieIsActive !== undefined) {
          isActive = cookieIsActive === 'true'
        }
        if (t.base_slots_plan && !cookiePlanId) {
          planId = t.base_slots_plan === 1 ? 'CHICO_1' : t.base_slots_plan === 2 ? 'MEDIANO_2' : t.base_slots_plan <= 4 ? 'CONSOLIDADO_3_4' : 'GRANDE_5_PLUS'
        }
        if (t.subscription_status && !cookieStatus) {
          subscriptionStatus = t.subscription_status
        }
      }
    }
  }

  // Si aún no tenemos tenantId, buscar por slug
  if (!tenantId && tenantSlug && tenantSlug !== 'mi-club') {
    try {
      const { data: tData } = await serviceClient
        .from('tenants')
        .select('id, name, slug')
        .eq('slug', tenantSlug)
        .maybeSingle()
      if (tData?.id) {
        tenantId = tData.id
        tenantName = tData.name || tenantName
        tenantSlug = tData.slug || tenantSlug
      }
    } catch {}
  }

  // Si todavía no tenemos tenantId, resolver el club activo desde la base de datos
  if (!tenantId) {
    try {
      const { data: defaultTenant } = await serviceClient
        .from('tenants')
        .select('id, name, slug, mp_access_token, subscription_status, is_active, base_slots_plan')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      if (defaultTenant) {
        tenantId = defaultTenant.id
        tenantName = defaultTenant.name || tenantName
        tenantSlug = defaultTenant.slug || tenantSlug
        mpConnected = Boolean(defaultTenant.mp_access_token)
        if (typeof defaultTenant.is_active === 'boolean') {
          isActive = defaultTenant.is_active
        }
      }
    } catch {}
  }

  return (
    <DashboardLayoutClient
      tenantName={tenantName}
      tenantSlug={tenantSlug}
      userRole={userRole}
      userName={userName}
      mpConnected={mpConnected}
      planId={planId}
      isActive={isActive}
      gracePeriodBanner={<GracePeriodBanner initialStatus={subscriptionStatus} />}
      pendingScreen={<PendingActivationScreen tenantName={tenantName} />}
    >
      <TenantProvider value={tenantId}>
        {children}
      </TenantProvider>
    </DashboardLayoutClient>
  )
}
