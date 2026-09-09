import { CalendarGrid, type CalendarBooking } from '@/components/dashboard/calendar-grid'
import { createClient } from '@/lib/supabase/server'
import { getCalendarBookings } from '@/actions/club.actions'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const supabase = await createClient()
  const today = new Date().toISOString().split('T')[0]

  // Obtener tenant_id del usuario activo
  const { data: { user } } = await supabase.auth.getUser()
  let tenantId = '00000000-0000-0000-0000-000000000001'

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

  // Cargar canchas
  const { data: rawCourts } = await supabase
    .from('courts')
    .select('id, name, sport, slot_duration, is_active')
    .eq('tenant_id', tenantId)
    .order('display_order', { ascending: true })

  // Canchas mock/fallback si aún no se han configurado en la BD
  const courts = (rawCourts && rawCourts.length > 0)
    ? rawCourts
    : [
        { id: 'court-1', name: 'Cancha 1 (Panorámica)', sport: 'PADEL', slot_duration: 'MIN_90' as const, is_active: true },
        { id: 'court-2', name: 'Cancha 2 (Techada)', sport: 'PADEL', slot_duration: 'MIN_90' as const, is_active: true },
        { id: 'court-3', name: 'Cancha 3 (Blindex)', sport: 'PADEL', slot_duration: 'MIN_90' as const, is_active: true },
        { id: 'court-4', name: 'Fútbol 5 (Sintético)', sport: 'FUTBOL_5', slot_duration: 'MIN_60' as const, is_active: true },
      ]

  // Cargar reservas del día
  let bookings = (await getCalendarBookings(tenantId, today)) as CalendarBooking[]
  if (!bookings || bookings.length === 0) {
    bookings = [


      {
        id: 'demo-b-1',
        court_id: 'court-1',
        customer_name: 'Martín Alurralde',
        customer_phone: '+54 9 381 411-2233',
        customer_email: 'martin@demo.com',
        booking_range: '',
        status: 'CONFIRMED' as const,
        origin: 'ONLINE',
        total_amount_ars: 18000,
        deposit_amount_ars: 5000,
        total_paid: 5000,
        balance_due: 13000,
        internal_notes: 'Pádel 7ma categoría - Pagó seña por Mercado Pago',
        starts_at: `${today}T18:00:00.000Z`,
        ends_at: `${today}T19:30:00.000Z`,
        courts: { name: 'Cancha 1 (Panorámica)', sport: 'PADEL', slot_duration: 'MIN_90' },
        booking_payments: [{ amount_ars: 5000, payment_method: 'MERCADOPAGO', created_at: `${today}T10:00:00.000Z` }]
      },
      {
        id: 'demo-b-2',
        court_id: 'court-2',
        customer_name: 'Santiago Terán',
        customer_phone: '+54 9 381 599-8877',
        customer_email: 'santi@demo.com',
        booking_range: '',
        status: 'COMPLETED' as const,
        origin: 'MANUAL_ADMIN',
        total_amount_ars: 16000,
        deposit_amount_ars: 16000,
        total_paid: 16000,
        balance_due: 0,
        internal_notes: 'Abonado 100% en efectivo en recepción',
        starts_at: `${today}T19:30:00.000Z`,
        ends_at: `${today}T21:00:00.000Z`,
        courts: { name: 'Cancha 2 (Techada)', sport: 'PADEL', slot_duration: 'MIN_90' },
        booking_payments: [{ amount_ars: 16000, payment_method: 'CASH', created_at: `${today}T19:25:00.000Z` }]
      },
      {
        id: 'demo-b-3',
        court_id: 'court-4',
        customer_name: 'Luciano Paz (Torneo F5)',
        customer_phone: '+54 9 381 633-4455',
        customer_email: 'luciano@demo.com',
        booking_range: '',
        status: 'CONFIRMED' as const,
        origin: 'ONLINE',
        total_amount_ars: 24000,
        deposit_amount_ars: 8000,
        total_paid: 8000,
        balance_due: 16000,
        internal_notes: 'Fútbol 5 nocturno - Traen pelotas propias',
        starts_at: `${today}T21:00:00.000Z`,
        ends_at: `${today}T22:00:00.000Z`,
        courts: { name: 'Fútbol 5 (Sintético)', sport: 'FUTBOL_5', slot_duration: 'MIN_60' },
        booking_payments: [{ amount_ars: 8000, payment_method: 'MERCADOPAGO', created_at: `${today}T14:10:00.000Z` }]
      }
    ]
  }


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
          tenantId={tenantId}
          courts={courts}
          initialBookings={bookings as unknown as CalendarBooking[]}
          initialDate={today}
        />
      </div>
    </div>
  )
}
