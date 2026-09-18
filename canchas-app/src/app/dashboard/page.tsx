import { CalendarGrid, type CalendarBooking } from '@/components/dashboard/calendar-grid'
import { createClient } from '@/lib/supabase/server'
import { getCalendarBookings, getClubSchedule } from '@/actions/club.actions'
import { cookies } from 'next/headers'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  const cookieStore = await cookies()
  const activeVenueId = cookieStore.get('canchar_active_venue_id')?.value || 'venue-main'

  // Obtener tenant_id del usuario activo (null si no tiene tenant)
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

  // Cargar canchas reales de la base de datos
  interface DbCourtRow {
    id: string
    name: string
    sport: string
    slot_duration_minutes?: number | null
    is_active: boolean
  }

  const { data: rawCourts } = tenantId 
    ? await supabase
        .from('courts')
        .select('id, name, sport, slot_duration_minutes, is_active')
        .eq('tenant_id', tenantId)
        .order('display_order', { ascending: true })
    : { data: [] }

  const courts = (rawCourts && rawCourts.length > 0)
    ? (rawCourts as unknown as DbCourtRow[]).map((c) => ({
        id: c.id,
        name: c.name,
        sport: c.sport,
        slot_duration: (c.slot_duration_minutes === 60 ? 'MIN_60' : 'MIN_90') as 'MIN_60' | 'MIN_90' | 'MIN_120',
        is_active: c.is_active,
      }))
    : []

  // Load real bookings and club operating schedule from DB
  const bookings = tenantId ? (await getCalendarBookings(tenantId, today)) as CalendarBooking[] : []
  const schedule = tenantId ? await getClubSchedule(tenantId) : undefined

  return (
    <div className="flex flex-col h-full space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Grilla de Turnos
          </h2>
          <p className="text-xs text-slate-400">
            Visualización y control de reservas en tiempo real para todas las canchas.
          </p>
        </div>
      </div>

      <div className="flex-1 min-h-[600px]">
        <CalendarGrid
          tenantId={tenantId || ''}
          courts={courts}
          initialBookings={bookings as unknown as CalendarBooking[]}
          initialDate={today}
          initialVenueId={activeVenueId}
          initialSchedule={schedule}
        />
      </div>
    </div>
  )
}
