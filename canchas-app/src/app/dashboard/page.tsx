import { CalendarGrid, type CalendarBooking, type CourtItem } from '@/components/dashboard/calendar-grid'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import type { QuickBookingPriceRule } from '@/components/dashboard/quick-booking-modal'
import type { ClubScheduleConfig } from '@/lib/time-slots'
import { createClient } from '@/lib/supabase/server'
import { getCalendarBookings, getClubSchedule, getClubPriceRules } from '@/actions/club.actions'
import { resolveEffectiveTenantId } from '@/lib/auth-security'
import { getArgentinaTodayIso } from '@/lib/utils'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export interface DashboardPageData {
  tenantId: string
  tenantSlug: string
  tenantName: string
  hasBankConfigured: boolean
  initialDate: string
  activeVenueId: string
  courts: CourtItem[]
  bookings: CalendarBooking[]
  schedule?: ClubScheduleConfig
  priceRules: QuickBookingPriceRule[]
}

interface DbCourtSelectRow {
  id: string
  name: string
  sport: string
  slot_duration_minutes: number | null
  is_active: boolean
  created_at: string | null
}

interface DbTenantSelectRow {
  name: string
  slug: string
  bank_alias: string | null
  bank_cbu: string | null
  mp_access_token: string | null
}

/**
 * Data Loader en Server Component:
 * Ejecuta todas las consultas en paralelo en el servidor (Supabase + Caché Redis)
 * para alimentar al cliente sin peticiones de red redundantes en el montaje inicial.
 */
async function loadDashboardInitialData(requestedDate?: string): Promise<DashboardPageData> {
  const supabase = await createClient()
  const initialDate = requestedDate || getArgentinaTodayIso()

  const cookieStore = await cookies()
  const activeVenueId = cookieStore.get('canchar_active_venue_id')?.value || 'venue-main'

  const { data: { user } } = await supabase.auth.getUser()
  let rawTenantId: string | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .maybeSingle()
    if (profile?.tenant_id) {
      rawTenantId = profile.tenant_id
    }
  }

  const effectiveTenantId = await resolveEffectiveTenantId(rawTenantId)

  if (!effectiveTenantId) {
    return {
      tenantId: '',
      tenantSlug: 'mi-club',
      tenantName: 'Mi Club',
      hasBankConfigured: false,
      initialDate,
      activeVenueId,
      courts: [],
      bookings: [],
      priceRules: [],
    }
  }

  // Carga paralela de alto rendimiento en el servidor
  const [courtsRes, bookingsData, scheduleData, priceRulesData, tenantRes] = await Promise.all([
    supabase
      .from('courts')
      .select('id, name, sport, slot_duration_minutes, is_active, created_at')
      .eq('tenant_id', effectiveTenantId)
      .order('created_at', { ascending: true }),
    getCalendarBookings(effectiveTenantId, initialDate),
    getClubSchedule(effectiveTenantId),
    getClubPriceRules(effectiveTenantId),
    supabase
      .from('tenants')
      .select('name, slug, bank_alias, bank_cbu, mp_access_token')
      .eq('id', effectiveTenantId)
      .maybeSingle(),
  ])

  const rawCourts = (courtsRes.data || []) as unknown as DbCourtSelectRow[]
  const courts: CourtItem[] = rawCourts.map((c) => ({
    id: c.id,
    name: c.name,
    sport: c.sport,
    slot_duration: (c.slot_duration_minutes === 60 ? 'MIN_60' : c.slot_duration_minutes === 120 ? 'MIN_120' : 'MIN_90'),
    is_active: c.is_active,
    created_at: c.created_at,
  }))

  const tenant = tenantRes?.data as unknown as DbTenantSelectRow | null
  const tenantSlug = tenant?.slug || 'mi-club'
  const tenantName = tenant?.name || 'Mi Club'
  const hasBankConfigured = Boolean(tenant?.bank_alias || tenant?.bank_cbu || tenant?.mp_access_token)

  return {
    tenantId: effectiveTenantId,
    tenantSlug,
    tenantName,
    hasBankConfigured,
    initialDate,
    activeVenueId,
    courts,
    bookings: (bookingsData || []) as unknown as CalendarBooking[],
    schedule: scheduleData || undefined,
    priceRules: (priceRulesData || []) as unknown as QuickBookingPriceRule[],
  }
}

export default async function DashboardPage(props: {
  searchParams?: Promise<{ date?: string }>
}) {
  const searchParams = props.searchParams ? await props.searchParams : undefined
  const data = await loadDashboardInitialData(searchParams?.date)
  const {
    tenantId,
    tenantSlug,
    tenantName,
    hasBankConfigured,
    courts,
    bookings,
    initialDate,
    activeVenueId,
    schedule,
    priceRules,
  } = data

  return (
    <div className="flex flex-col h-full w-full space-y-2">
      <OnboardingChecklist
        tenantSlug={tenantSlug}
        tenantName={tenantName}
        courtsCount={courts.length}
        hasBankConfigured={hasBankConfigured}
      />

      <div className="flex-1 min-h-0 w-full">
        <CalendarGrid
          tenantId={tenantId}
          courts={courts}
          initialBookings={bookings}
          initialDate={initialDate}
          initialVenueId={activeVenueId}
          initialSchedule={schedule}
          priceRules={priceRules}
        />
      </div>
    </div>
  )
}

