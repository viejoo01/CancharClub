'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Calendar,
  CheckCircle2,
  Search,
  Maximize2,
  Minimize2,
  RefreshCw,
  UtensilsCrossed,
  QrCode,
  Delete,
  ShieldCheck,
  Check,
  Flame,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CancharClubIcon } from '@/components/shared/canchar-club-logo'
import {
  getClubPublicData,
  getPublicClubs,
  getClubCourts,
} from '@/actions/club.actions'
import { type ClubData } from '@/config/clubs-catalog'
import {
  lookupPlayerBookings,
  checkInTotemBooking,
  type PlayerBookingDetail,
} from '@/actions/booking.actions'
import { formatARS } from '@/lib/utils'
import { toast } from 'sonner'
import Link from 'next/link'

export default function TotemPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
          <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
        </div>
      }
    >
      <TotemKioskContent />
    </Suspense>
  )
}

function TotemKioskContent() {
  const searchParams = useSearchParams()
  const urlClubSlug = searchParams.get('club') || searchParams.get('slug') || ''
  const urlTenantId = searchParams.get('tenant_id') || ''

  // Hora actual en tiempo real
  const [currentTime, setCurrentTime] = useState<string>('')
  const [currentDate, setCurrentDate] = useState<string>('')
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Datos del Club
  const [selectedClub, setSelectedClub] = useState<ClubData | null>(null)
  const [courts, setCourts] = useState<Array<{ id: string; name: string; sport: string; surface: string }>>([])

  // Pestaña activa del tótem
  const [activeTab, setActiveTab] = useState<'CHECKIN' | 'COURTS' | 'CANTINA'>('CHECKIN')

  // Check-In: Búsqueda y Resultados
  const [inputDigits, setInputDigits] = useState('')
  const [searching, setSearching] = useState(false)
  const [foundBookings, setFoundBookings] = useState<PlayerBookingDetail[]>([])
  const [hasSearched, setHasSearched] = useState(false)
  const [checkedInIds, setCheckedInIds] = useState<Set<string>>(new Set())
  const [checkingInId, setCheckingInId] = useState<string | null>(null)

  // Reloj en vivo
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setCurrentTime(
        now.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      )
      setCurrentDate(
        now.toLocaleDateString('es-AR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // Cargar lista de clubes y club seleccionado
  useEffect(() => {
    let isMounted = true
    async function loadClubData() {
      try {
        const allClubs = await getPublicClubs()
        if (!isMounted) return

        let target: ClubData | null = null
        if (urlClubSlug) {
          target = allClubs.find((c) => c.slug === urlClubSlug) || null
          if (!target) {
            try {
              target = await getClubPublicData(urlClubSlug)
            } catch {
              target = null
            }
          }
        } else if (urlTenantId) {
          target = allClubs.find((c) => c.id === urlTenantId) || null
        }

        // Si no hay parámetro de URL, tomar el primer club del listado
        if (!target && allClubs.length > 0) {
          target = allClubs[0]
        }

        setSelectedClub(target)

        if (target && target.id) {
          const courtsRes = await getClubCourts(target.id)
          if (isMounted && courtsRes) {
            setCourts(courtsRes)
          }
        }
      } catch (err) {
        console.error('[Totem] Error cargando club:', err)
      }
    }

    loadClubData()
    return () => {
      isMounted = false
    }
  }, [urlClubSlug, urlTenantId])

  // Reset por inactividad tras 45 segundos para privacidad del usuario
  useEffect(() => {
    if (!inputDigits && foundBookings.length === 0) return

    const resetTimer = setTimeout(() => {
      setInputDigits('')
      setFoundBookings([])
      setHasSearched(false)
    }, 45000)

    return () => clearTimeout(resetTimer)
  }, [inputDigits, foundBookings])

  // Toggle Fullscreen
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
      setIsFullscreen(true)
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen().catch(() => {})
        setIsFullscreen(false)
      }
    }
  }

  // Teclado numérico táctil (Keypad)
  const handleDigitPress = (digit: string) => {
    if (inputDigits.length < 12) {
      setInputDigits((prev) => prev + digit)
    }
  }

  const handleDeleteDigit = () => {
    setInputDigits((prev) => prev.slice(0, -1))
  }

  const handleClearDigits = () => {
    setInputDigits('')
    setFoundBookings([])
    setHasSearched(false)
  }

  // Buscar turnos de hoy
  const handleSearchBookings = async () => {
    const clean = inputDigits.replace(/\D/g, '').trim()
    if (clean.length < 6) {
      toast.error('Número incompleto', {
        description: 'Ingresá tu número de celular o DNI (al menos 6 dígitos).',
      })
      return
    }

    setSearching(true)
    setHasSearched(true)
    try {
      const res = await lookupPlayerBookings({ phone: clean })
      if (res.success && res.data) {
        // Filtrar por club seleccionado si está definido
        const clubName = selectedClub?.name?.toLowerCase()
        const filtered = clubName
          ? res.data.filter((b) => !b.clubName || b.clubName.toLowerCase().includes(clubName))
          : res.data

        setFoundBookings(filtered)
        if (filtered.length === 0) {
          toast.info('Sin turnos para hoy', {
            description: 'No encontramos turnos registrados hoy con ese número en este club.',
          })
        }
      } else {
        setFoundBookings([])
        toast.error('No se encontraron reservas', {
          description: res.error || 'Verificá el número ingresado.',
        })
      }
    } catch {
      toast.error('Error al consultar turnos')
      setFoundBookings([])
    } finally {
      setSearching(false)
    }
  }

  // Confirmar Check-in
  const handleCheckIn = async (booking: PlayerBookingDetail) => {
    if (!selectedClub?.id) return
    setCheckingInId(booking.id)
    try {
      const res = await checkInTotemBooking({
        bookingId: booking.id,
        tenantId: selectedClub.id,
      })

      if (res.success) {
        setCheckedInIds((prev) => new Set(prev).add(booking.id))
        toast.success('¡Llegada Confirmada!', {
          description: `¡Hola ${booking.customerName}! Tu llegada fue notificada a recepción. Cancha ${booking.courtName} te espera.`,
          duration: 6000,
        })
      } else {
        toast.error('No se pudo registrar la llegada: ' + (res.error || 'Intentá de nuevo'))
      }
    } catch {
      toast.error('Error al registrar llegada')
    } finally {
      setCheckingInId(null)
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between selection:bg-emerald-500 selection:text-white select-none">
      {/* ─── BARRA SUPERIOR KIOSK ─── */}
      <header className="w-full bg-slate-900/90 border-b border-slate-800/80 px-6 py-4 flex items-center justify-between backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
            <CancharClubIcon className="w-7 h-7" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black tracking-tight text-white">
                {selectedClub?.name || 'Tótem de Acceso'}
              </h1>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[10px] uppercase font-bold tracking-wider">
                Tótem de Acceso
              </Badge>
            </div>
            <p className="text-xs text-slate-400 flex items-center gap-1.5 capitalize">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              {currentDate}
            </p>
          </div>
        </div>

        {/* Reloj Digital Gigante & Botón Fullscreen */}
        <div className="flex items-center gap-4">
          <div className="text-right">
            <span className="text-2xl sm:text-4xl font-black font-mono tracking-tight text-emerald-400 drop-shadow-[0_0_15px_rgba(16,185,129,0.25)]">
              {currentTime}
            </span>
            <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
              Hora Oficial Club
            </p>
          </div>

          <button
            onClick={toggleFullscreen}
            title={isFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
            className="w-11 h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition-colors cursor-pointer border border-slate-700"
          >
            {isFullscreen ? <Minimize2 className="w-5 h-5" /> : <Maximize2 className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* ─── BOTONES DE MÓDULOS PRINCIPALES ─── */}
      <div className="px-6 pt-5">
        <div className="grid grid-cols-3 gap-3 max-w-4xl mx-auto">
          <button
            onClick={() => setActiveTab('CHECKIN')}
            className={`h-16 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-3 transition-all cursor-pointer border ${
              activeTab === 'CHECKIN'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-xl shadow-emerald-950/60 scale-[1.02]'
                : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-850'
            }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            <span>Auto Check-In</span>
          </button>

          <button
            onClick={() => setActiveTab('COURTS')}
            className={`h-16 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-3 transition-all cursor-pointer border ${
              activeTab === 'COURTS'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-xl shadow-emerald-950/60 scale-[1.02]'
                : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-850'
            }`}
          >
            <Flame className="w-5 h-5" />
            <span>Canchas en Vivo</span>
          </button>

          <button
            onClick={() => setActiveTab('CANTINA')}
            className={`h-16 rounded-2xl font-black text-sm sm:text-base flex items-center justify-center gap-3 transition-all cursor-pointer border ${
              activeTab === 'CANTINA'
                ? 'bg-emerald-600 text-white border-emerald-400 shadow-xl shadow-emerald-950/60 scale-[1.02]'
                : 'bg-slate-900/80 text-slate-300 border-slate-800 hover:bg-slate-850'
            }`}
          >
            <UtensilsCrossed className="w-5 h-5" />
            <span>Cantina & Bar</span>
          </button>
        </div>
      </div>

      {/* ─── CONTENIDO PRINCIPAL SEGÚN PESTAÑA ─── */}
      <main className="flex-1 px-6 py-6 max-w-5xl w-full mx-auto flex flex-col justify-center">
        {/* PESTAÑA 1: AUTO CHECK-IN */}
        {activeTab === 'CHECKIN' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Lado Izquierdo: Teclado táctil para Celular/DNI */}
            <div className="lg:col-span-6 bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
              <div className="mb-4">
                <span className="text-xs uppercase tracking-widest text-emerald-400 font-extrabold">
                  Paso 1
                </span>
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  Ingresá tu Teléfono o DNI
                </h2>
                <p className="text-xs text-slate-400">
                  Tocá los números en pantalla para localizar tu turno de hoy.
                </p>
              </div>

              {/* Pantalla visual de los dígitos ingresados */}
              <div className="h-16 rounded-2xl bg-slate-950 border-2 border-slate-800 flex items-center justify-between px-5 mb-5">
                <span className="text-2xl sm:text-3xl font-mono font-bold tracking-wider text-emerald-400">
                  {inputDigits || (
                    <span className="text-slate-600 font-sans text-lg font-normal">
                      Ej: 1123456789
                    </span>
                  )}
                </span>
                {inputDigits && (
                  <button
                    onClick={handleDeleteDigit}
                    className="p-2 text-slate-400 hover:text-white active:scale-95 transition-all"
                  >
                    <Delete className="w-6 h-6" />
                  </button>
                )}
              </div>

              {/* Teclado Numérico Touch Grande */}
              <div className="grid grid-cols-3 gap-3">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    onClick={() => handleDigitPress(digit)}
                    className="h-16 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-emerald-600 active:text-white text-white font-mono font-bold text-2xl transition-all shadow-md active:scale-95 flex items-center justify-center border border-slate-700 cursor-pointer"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  onClick={handleClearDigits}
                  className="h-16 rounded-2xl bg-red-950/40 hover:bg-red-900/50 text-red-300 font-bold text-xs uppercase tracking-wider transition-all border border-red-800/40 cursor-pointer active:scale-95 flex items-center justify-center"
                >
                  Borrar
                </button>
                <button
                  onClick={() => handleDigitPress('0')}
                  className="h-16 rounded-2xl bg-slate-800/90 hover:bg-slate-700 active:bg-emerald-600 active:text-white text-white font-mono font-bold text-2xl transition-all shadow-md active:scale-95 flex items-center justify-center border border-slate-700 cursor-pointer"
                >
                  0
                </button>
                <button
                  onClick={handleDeleteDigit}
                  className="h-16 rounded-2xl bg-slate-800/90 hover:bg-slate-700 text-slate-300 transition-all border border-slate-700 cursor-pointer active:scale-95 flex items-center justify-center"
                >
                  <Delete className="w-6 h-6" />
                </button>
              </div>

              {/* Botón Buscar Turno */}
              <Button
                onClick={handleSearchBookings}
                disabled={searching || inputDigits.length < 6}
                className="w-full h-14 mt-4 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-base rounded-2xl shadow-xl shadow-emerald-950/60 cursor-pointer flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {searching ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span>Consultando sistema del club...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-5 h-5" />
                    <span>Buscar Mi Turno</span>
                  </>
                )}
              </Button>
            </div>

            {/* Lado Derecho: Resultados y Botón de Check-in */}
            <div className="lg:col-span-6 flex flex-col gap-4">
              <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl min-h-95">
                <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                  <div>
                    <span className="text-xs uppercase tracking-widest text-emerald-400 font-extrabold">
                      Paso 2
                    </span>
                    <h3 className="text-xl font-black text-white">Turnos Encontrados</h3>
                  </div>
                  {foundBookings.length > 0 && (
                    <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                      {foundBookings.length} turno(s)
                    </Badge>
                  )}
                </div>

                {foundBookings.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
                    <Calendar className="w-16 h-16 text-slate-700 mb-3 stroke-[1.2]" />
                    <p className="text-sm font-semibold text-slate-400">
                      {hasSearched
                        ? 'No se encontraron turnos con el número ingresado'
                        : 'Ingresá tu número a la izquierda para buscar'}
                    </p>
                    <p className="text-xs text-slate-500 mt-1 max-w-xs">
                      Aparecerán tus turnos reservados para hoy con el horario y cancha asignada.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {foundBookings.map((b) => {
                      const isCheckedIn = checkedInIds.has(b.id)
                      const isProcessing = checkingInId === b.id

                      return (
                        <div
                          key={b.id}
                          className="bg-slate-950/80 border-2 border-slate-800 rounded-2xl p-5 hover:border-slate-700 transition-all"
                        >
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-extrabold text-lg text-white">
                                  {b.customerName}
                                </span>
                                <Badge variant="outline" className="text-xs font-mono border-slate-700 text-slate-300">
                                  Cancha: {b.courtName}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-400 mt-0.5">
                                Reserva #{b.code || b.id.slice(0, 8).toUpperCase()}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="text-xl font-black font-mono text-emerald-400">
                                {b.timeFormatted || (b.startsAt && b.endsAt ? `${b.startsAt.slice(11, 16)} - ${b.endsAt.slice(11, 16)}` : 'Hoy')}
                              </span>
                              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                                Horario
                              </p>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
                            <div>
                              <span className="text-xs text-slate-400">Estado de pago:</span>
                              <p className="text-sm font-bold text-slate-200">
                                {b.balanceRemaining > 0 ? `Saldo Pendiente: ${formatARS(b.balanceRemaining)}` : 'Total Pagado'}
                              </p>
                            </div>

                            <Button
                              onClick={() => handleCheckIn(b)}
                              disabled={isCheckedIn || isProcessing}
                              className={`h-12 px-6 rounded-xl font-black text-sm cursor-pointer transition-all flex items-center gap-2 ${
                                isCheckedIn
                                  ? 'bg-emerald-600/40 text-emerald-300 border border-emerald-500/40 cursor-default'
                                  : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/60'
                              }`}
                            >
                              {isProcessing ? (
                                <>
                                  <RefreshCw className="w-4 h-4 animate-spin" />
                                  <span>Registrando...</span>
                                </>
                              ) : isCheckedIn ? (
                                <>
                                  <Check className="w-4 h-4" />
                                  <span>¡Llegada Confirmada!</span>
                                </>
                              ) : (
                                <>
                                  <CheckCircle2 className="w-4 h-4" />
                                  <span>Marcar Llegada</span>
                                </>
                              )}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PESTAÑA 2: ESTADO DE CANCHAS EN VIVO */}
        {activeTab === 'COURTS' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
              <div>
                <span className="text-xs uppercase tracking-widest text-emerald-400 font-extrabold">
                  Cartelera en Vivo
                </span>
                <h2 className="text-2xl font-black text-white">Disponibilidad de Canchas</h2>
                <p className="text-xs text-slate-400">
                  Estado actualizado en tiempo real para jugadores en recepción.
                </p>
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                {courts.length} canchas operativas
              </Badge>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {courts.map((court) => (
                <div
                  key={court.id}
                  className="bg-slate-950/90 border border-slate-800/90 rounded-2xl p-5 flex flex-col justify-between hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-extrabold text-lg text-white">{court.name}</h4>
                      <p className="text-xs text-slate-400">
                        {court.sport || 'Pádel'} • {court.surface || 'Cristal Sintético'}
                      </p>
                    </div>
                    <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-xs font-bold">
                      Activa
                    </Badge>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-800/80 flex items-center justify-between">
                    <span className="text-xs text-slate-400 font-mono">Modo Juego</span>
                    <span className="text-xs text-emerald-400 font-bold flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                      Disponible
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* PESTAÑA 3: CANTINA & BAR */}
        {activeTab === 'CANTINA' && (
          <div className="bg-slate-900/90 border border-slate-800 rounded-3xl p-8 shadow-2xl backdrop-blur-xl text-center max-w-2xl mx-auto">
            <div className="w-16 h-16 rounded-3xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto mb-4">
              <UtensilsCrossed className="w-8 h-8" />
            </div>

            <span className="text-xs uppercase tracking-widest text-amber-400 font-extrabold">
              Cantina del Club
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white mt-1">
              Bebidas, Snacks y Tercer Tiempo
            </h2>
            <p className="text-sm text-slate-400 mt-2">
              Escaneá el código QR con tu celular para ver la carta completa y pedir directamente a tu mesa o cancha.
            </p>

            {/* Representación QR */}
            <div className="my-6 inline-block bg-white p-5 rounded-3xl shadow-2xl">
              <QrCode className="w-48 h-48 text-slate-950" />
            </div>

            <p className="text-xs text-slate-400">
              O accedé online en:{' '}
              <span className="font-mono text-emerald-400 font-bold">
                cancharclub.com/club/{selectedClub?.slug || 'club'}/pedido
              </span>
            </p>
          </div>
        )}
      </main>

      {/* ─── BARRA INFERIOR / PIE ─── */}
      <footer className="w-full bg-slate-900/90 border-t border-slate-800/80 px-6 py-4 flex items-center justify-between text-xs text-slate-400 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>CancharClub Tótem OS • Modo Kiosco de Recepción</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard"
            className="text-slate-500 hover:text-slate-300 transition-colors text-xs"
          >
            Panel Administrativo
          </Link>
          <span>•</span>
          <span className="font-mono text-slate-500">v2.4.0</span>
        </div>
      </footer>
    </div>
  )
}
