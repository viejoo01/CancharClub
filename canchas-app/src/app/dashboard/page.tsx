import { CalendarGrid, type CalendarBooking } from '@/components/dashboard/calendar-grid'
import { OnboardingChecklist } from '@/components/dashboard/onboarding-checklist'
import type { QuickBookingPriceRule } from '@/components/dashboard/quick-booking-modal'
import { createClient } from '@/lib/supabase/server'
import { getCalendarBookings, getClubSchedule, getClubPriceRules } from '@/actions/club.actions'
import { resolveEffectiveTenantId } from '@/lib/auth-security'
import { getArgentinaTodayIso } from '@/lib/utils'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export default async function DashboardPage(props: {
  searchParams?: Promise<{ date?: string }>
}) {
  const supabase = await createClient()
  const searchParams = props.searchParams ? await props.searchParams : undefined
  const today = searchParams?.date || getArgentinaTodayIso()

  const cookieStore = await cookies()
  const activeVenueId = cookieStore.get('canchar_active_venue_id')?.value || 'venue-main'

  const { data: { user } } = await supabase.auth.getUser()
  let tenantId: string | null = null

  if (user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id')
      .eq('id', user.id)
      .single()
    if (profile?.tenant_id) {
      tenantId = profile.tenant_id
    }
  }

  tenantId = await resolveEffectiveTenantId(tenantId)

  interface DbCourtRow {
    id: string
    name: string
    sport: string
    slot_duration_minutes?: number | null
    is_active: boolean
    created_at?: string | null
  }

  const [rawCourtsResult, bookings, schedule, priceRules, tenantResult] = await Promise.all([
    tenantId
      ? supabase
          .from('courts')
          .select('id, name, sport, slot_duration_minutes, is_active, created_at')
          .eq('tenant_id', tenantId)
          .order('created_at', { ascending: true })
      : Promise.resolve({ data: [] as DbCourtRow[] }),
    tenantId ? (getCalendarBookings(tenantId, today) as Promise<CalendarBooking[]>) : Promise.resolve([] as CalendarBooking[]),
    tenantId ? getClubSchedule(tenantId) : Promise.resolve(undefined),
    tenantId ? (getClubPriceRules(tenantId) as unknown as Promise<QuickBookingPriceRule[]>) : Promise.resolve([] as QuickBookingPriceRule[]),
    tenantId
      ? supabase
          .from('tenants')
          .select('name, slug, bank_alias, bank_cbu, mp_access_token')
          .eq('id', tenantId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const rawCourts = rawCourtsResult.data

  const courts = (rawCourts && rawCourts.length > 0)
    ? (rawCourts as unknown as DbCourtRow[]).map((c) => ({
        id: c.id,
        name: c.name,
        sport: c.sport,
        slot_duration: (c.slot_duration_minutes === 60 ? 'MIN_60' : 'MIN_90') as 'MIN_60' | 'MIN_90' | 'MIN_120',
        is_active: c.is_active,
        created_at: c.created_at ?? null,
      }))
    : []

  const tenant = tenantResult?.data
  const tenantSlug = tenant?.slug || 'mi-club'
  const tenantName = tenant?.name || 'Mi Club'
  const hasBankConfigured = Boolean(tenant?.bank_alias || tenant?.bank_cbu || tenant?.mp_access_token)

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
          tenantId={tenantId || ''}
          courts={courts}
          initialBookings={bookings as unknown as CalendarBooking[]}
          initialDate={today}
          initialVenueId={activeVenueId}
          initialSchedule={schedule}
          priceRules={priceRules}
        />
      </div>
    </div>
  )
}
