import { DashboardLayoutClient } from '@/components/dashboard/dashboard-layout-client'
import { createClient } from '@/lib/supabase/server'
import { headers, cookies } from 'next/headers'
import { GracePeriodBanner } from '@/components/billing/grace-period-banner'
import { PendingActivationScreen } from '@/components/dashboard/pending-activation-screen'
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

  let tenantName = cookieTenantName || 'Club Pádel Central Tucumán'
  let tenantSlug = cookieTenantSlug || 'padel-central'
  let userRole = cookieRole || 'TENANT_ADMIN'
  let userName = cookieName || (cookieRole === 'TENANT_STAFF' ? 'Canchero (Mostrador)' : 'Dueño del Club')
  let mpConnected = true
  let subscriptionStatus: TenantSubscriptionStatus = cookieStatus || headerStatus || 'ACTIVE'
  let planId: SaaSPlanId | undefined = cookiePlanId || undefined

  let isActive = true  // Por defecto activo (modo demo)

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, tenant_id, tenants(name, slug, mp_access_token, subscription_status, is_active, plan_id)')
      .eq('id', user.id)
      .single()

    if (profile) {
      userRole = profile.role
      userName = profile.full_name || user.email?.split('@')[0] || 'Admin'
      const t = profile.tenants as unknown as {
        name?: string
        slug?: string
        mp_access_token?: string
        subscription_status?: TenantSubscriptionStatus
        is_active?: boolean
        plan_id?: SaaSPlanId
      } | null
      if (t) {
        tenantName = t.name || tenantName
        tenantSlug = t.slug || tenantSlug
        mpConnected = Boolean(t.mp_access_token)
        isActive = t.is_active !== false  // false explícito = pendiente de activación
        if (t.plan_id) {
          planId = t.plan_id
        }
        if (t.subscription_status && !cookieStatus) {
          subscriptionStatus = t.subscription_status
        }
      }
    }
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
      {children}
    </DashboardLayoutClient>
  )
}
