import { Sidebar } from '@/components/dashboard/sidebar'
import { Header } from '@/components/dashboard/header'
import { createClient } from '@/lib/supabase/server'
import { headers, cookies } from 'next/headers'
import { GracePeriodBanner } from '@/components/billing/grace-period-banner'
import type { TenantSubscriptionStatus } from '@/types/database'

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

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, tenant_id, tenants(name, slug, mp_access_token, subscription_status)')
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
      } | null
      if (t) {
        tenantName = t.name || tenantName
        tenantSlug = t.slug || tenantSlug
        mpConnected = Boolean(t.mp_access_token)
        if (t.subscription_status && !cookieStatus) {
          subscriptionStatus = t.subscription_status
        }
      }
    }
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-950 text-slate-100">
      <Sidebar
        tenantName={tenantName}
        tenantSlug={tenantSlug}
        userRole={userRole}
      />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        <Header
          userName={userName}
          mpConnected={mpConnected}
        />
        <GracePeriodBanner initialStatus={subscriptionStatus} />
        <main className="flex-1 overflow-y-auto p-6 bg-gradient-to-b from-slate-950 to-slate-900/80">
          {children}
        </main>
      </div>
    </div>
  )
}
