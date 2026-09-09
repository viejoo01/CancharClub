'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
  MapPin, 
  Phone, 
  Clock, 
  Calendar as CalendarIcon, 
  ChevronRight, 
  Sparkles,
  ShieldCheck,
  Trophy,
  Zap,
  AlertCircle,
  ArrowLeft
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { formatARS } from '@/lib/utils'
import { WaitlistModal } from '@/components/public/waitlist-modal'
import { PlayerBookingsModal } from '@/components/public/player-bookings-modal'

interface Slot {
  time: string
  courtId: string
  courtName: string
  sport: string
  totalPrice: number
  depositPrice: number
  isAvailable: boolean
}

export default function ClubPublicPage() {
  const [selectedSport, setSelectedSport] = useState<string>('PADEL')
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  )

  const [subscriptionStatus] = useState<string>(() => {
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split('; ')
      const statusCookie = cookies.find(c => c.startsWith('demo_subscription_status='))
      if (statusCookie) {
        return statusCookie.split('=')[1]
      }
    }
    return 'ACTIVE'
  })

  const [waitlistSlot, setWaitlistSlot] = useState<{
    courtId: string
    courtName: string
    time: string
    sport: string
  } | null>(null)
  const [isWaitlistOpen, setIsWaitlistOpen] = useState(false)

  const [isReservasModalOpen, setIsReservasModalOpen] = useState(false)

  const isPublicPaused = subscriptionStatus === 'PARTIALLY_SUSPENDED' || subscriptionStatus === 'LOCKED'

  // Información del Club
  const club = {
    name: 'Club Pádel Central Tucumán',
    address: 'Av. Aconquija 2400, Yerba Buena, Tucumán',
    phone: '+54 9 381 412-3456',
    sports: ['PADEL', 'FUTBOL_5', 'TENIS'],
    openHours: '08:00 a 00:00 hs',
    slug: 'padel-central',
  }

  // Turnos mock demostrativos para disponibilidad pública
  const slots: Slot[] = [
    { time: '17:30', courtId: 'c1', courtName: 'Cancha 1 (Panorámica)', sport: 'PADEL', totalPrice: 14000, depositPrice: 7000, isAvailable: true },
    { time: '18:00', courtId: 'c2', courtName: 'Cancha 2 (Techada)', sport: 'PADEL', totalPrice: 14000, depositPrice: 7000, isAvailable: false },
    { time: '19:00', courtId: 'c1', courtName: 'Cancha 1 (Panorámica)', sport: 'PADEL', totalPrice: 15000, depositPrice: 7500, isAvailable: true },
    { time: '19:30', courtId: 'c3', courtName: 'Cancha 3 (Blindex)', sport: 'PADEL', totalPrice: 14000, depositPrice: 7000, isAvailable: true },
    { time: '20:30', courtId: 'c1', courtName: 'Cancha 1 (Panorámica)', sport: 'PADEL', totalPrice: 15000, depositPrice: 7500, isAvailable: true },
    { time: '21:00', courtId: 'c2', courtName: 'Cancha 2 (Techada)', sport: 'PADEL', totalPrice: 15000, depositPrice: 7500, isAvailable: false },
    { time: '22:00', courtId: 'c3', courtName: 'Cancha 3 (Blindex)', sport: 'PADEL', totalPrice: 14000, depositPrice: 7000, isAvailable: true },
    { time: '22:30', courtId: 'c1', courtName: 'Cancha 1 (Panorámica)', sport: 'PADEL', totalPrice: 14000, depositPrice: 7000, isAvailable: true },
  ]

  const filteredSlots = slots.filter(s => s.sport === selectedSport)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      {/* Container Mobile First */}
      <div className="w-full max-w-xl flex-1 flex flex-col pb-12 border-x border-slate-900 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950">
        
        {/* Top Navbar */}
        <div className="px-5 py-3 flex items-center justify-between border-b border-slate-800/80 bg-slate-950">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Inicio</span>
          </Link>
          <button
            onClick={() => setIsReservasModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-emerald-500/50 text-xs font-semibold text-slate-200 transition-colors"
          >
            <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
            <span>Mis reservas</span>
          </button>
        </div>

        {/* Banner Hero */}
        <div className="relative h-48 w-full bg-gradient-to-tr from-emerald-950 via-slate-900 to-teal-950 overflow-hidden border-b border-slate-800 flex items-end p-5">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_var(--tw-gradient-stops))] from-emerald-500/20 via-transparent to-transparent" />
          
          <div className="relative z-10 flex items-center gap-3">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 p-0.5 shadow-xl shadow-emerald-950/50 flex items-center justify-center">
              <div className="w-full h-full bg-slate-950 rounded-[14px] flex items-center justify-center">
                <Trophy className="w-7 h-7 text-emerald-400" />
              </div>
            </div>
            <div>
              <h1 className="text-xl font-black text-white tracking-tight leading-tight">
                {club.name}
              </h1>
              <div className="flex items-center gap-1.5 text-xs text-slate-300 mt-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                <span className="truncate">{club.address}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Club Quick Info */}
        <div className="px-5 py-3.5 bg-slate-900/60 border-b border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>{club.openHours}</span>
          </div>
          <a
            href={`https://wa.me/${club.phone.replace(/\D/g, '')}`}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-semibold"
          >
            <Phone className="w-3.5 h-3.5" />
            <span>Contacto</span>
          </a>
        </div>

        {/* Deporte Selector */}
        <div className="px-5 pt-5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            1. Seleccioná el Deporte
          </div>
          <div className="grid grid-cols-3 gap-2">
            {club.sports.map((sp) => (
              <button
                key={sp}
                onClick={() => setSelectedSport(sp)}
                className={`py-3 px-2 rounded-xl text-xs font-bold transition-all flex flex-col items-center gap-1.5 border ${
                  selectedSport === sp
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-400 shadow-md shadow-emerald-950/40'
                    : 'bg-slate-900/80 border-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                <Zap className={`w-4 h-4 ${selectedSport === sp ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span>{sp === 'PADEL' ? 'Pádel' : sp === 'FUTBOL_5' ? 'Fútbol 5' : 'Tenis'}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Selector de Fecha */}
        <div className="px-5 pt-5">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center justify-between">
            <span>2. Fecha del Turno</span>
            <span className="text-[11px] text-emerald-400 font-normal">Hoy disponible</span>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="flex-1 h-11 rounded-xl border border-slate-800 bg-slate-900/90 px-4 text-sm font-semibold text-slate-100 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
        </div>

        {/* Turnos Disponibles */}
        <div className="px-5 pt-6 flex-1">
          {isPublicPaused ? (
            <div className="bg-gradient-to-b from-amber-950/40 to-slate-900 border border-amber-800/60 rounded-2xl p-6 text-center space-y-4 shadow-xl mb-6">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 mx-auto flex items-center justify-center">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-white text-base">Reservas Online Momentáneamente en Pausa</h3>
                <p className="text-xs text-slate-300 max-w-sm mx-auto leading-relaxed">
                  Las reservas automáticas por la web están pausadas momentáneamente. Podés consultar disponibilidad y reservar tu turno directamente con la recepción del club por WhatsApp.
                </p>
              </div>
              <Button
                asChild
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-5 rounded-xl shadow-lg shadow-emerald-950/40"
              >
                <a
                  href={`https://wa.me/${club.phone.replace(/\D/g, '')}?text=${encodeURIComponent('¡Hola! Quisiera consultar disponibilidad y reservar una cancha para hoy.')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Consultar Turnos por WhatsApp
                </a>
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                3. Horarios Disponibles
              </span>
              <Badge variant="default" className="text-[10px]">
                Reserva con Seña Online
              </Badge>
            </div>
          )}

          <div className="space-y-3">
            {filteredSlots.map((slot, index) => (
              <Card
                key={`${slot.courtId}-${slot.time}-${index}`}
                className={`border-slate-800 transition-all ${
                  slot.isAvailable
                    ? 'bg-slate-900/80 hover:border-emerald-500/60 hover:shadow-lg hover:shadow-emerald-950/20'
                    : 'bg-slate-950/40 opacity-40 border-dashed cursor-not-allowed'
                }`}
              >
                <CardContent className="p-3.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-slate-950 border border-slate-800 flex flex-col items-center justify-center font-black text-slate-100">
                      <span className="text-xs text-emerald-400">HS</span>
                      <span className="text-sm leading-tight">{slot.time}</span>
                    </div>
                    <div>
                      <div className="font-bold text-sm text-slate-100">
                        {slot.courtName}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        Total {formatARS(slot.totalPrice)} • <span className="text-emerald-400 font-semibold">Seña {formatARS(slot.depositPrice)}</span>
                      </div>
                    </div>
                  </div>

                  {slot.isAvailable ? (
                    isPublicPaused ? (
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                        className="border-emerald-700/60 text-emerald-400 hover:bg-emerald-950/40 text-xs font-semibold"
                      >
                        <a
                          href={`https://wa.me/${club.phone.replace(/\D/g, '')}?text=${encodeURIComponent(`Hola! Quisiera reservar el turno de las ${slot.time} hs en ${slot.courtName}.`)}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Phone className="w-3.5 h-3.5 mr-1" />
                          Pedir
                        </a>
                      </Button>
                    ) : (
                      <Link
                        href={`/club/${club.slug}/checkout?courtId=${slot.courtId}&courtName=${encodeURIComponent(slot.courtName)}&time=${slot.time}&date=${selectedDate}&total=${slot.totalPrice}&deposit=${slot.depositPrice}&sport=${slot.sport}`}
                      >
                        <Button
                          size="sm"
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1 shadow-md shadow-emerald-950/30"
                        >
                          <span>Reservar</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </Link>
                    )
                  ) : (
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge variant="secondary" className="text-[10px] bg-slate-800/80 text-slate-400">
                        Ocupado
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setWaitlistSlot({
                            courtId: slot.courtId,
                            courtName: slot.courtName,
                            time: slot.time,
                            sport: slot.sport,
                          })
                          setIsWaitlistOpen(true)
                        }}
                        className="h-6 px-2 text-[10px] border-amber-500/40 text-amber-400 hover:bg-amber-950/40 hover:text-amber-300 font-medium"
                      >
                        <Clock className="w-2.5 h-2.5 mr-1" />
                        Avisarme si se libera
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Footer Seguridad */}
        <div className="px-5 pt-8 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-500/60" />
          <span>Pagos protegidos mediante Mercado Pago Checkout Pro</span>
        </div>

        {/* Modal de Lista de Espera Automática */}
        {waitlistSlot && (
          <WaitlistModal
            isOpen={isWaitlistOpen}
            onClose={() => {
              setIsWaitlistOpen(false)
              setWaitlistSlot(null)
            }}
            tenantId="00000000-0000-0000-0000-000000000001"
            courtId={waitlistSlot.courtId}
            courtName={waitlistSlot.courtName}
            date={selectedDate}
            timeSlot={waitlistSlot.time}
          />
        )}

        {/* Modal de Consulta de Reservas para Jugadores */}
        <PlayerBookingsModal
          open={isReservasModalOpen}
          onOpenChange={setIsReservasModalOpen}
        />
      </div>
    </div>
  )
}
