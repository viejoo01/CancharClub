'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  Building2,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Copy,
  Check,
  Loader2,
  ArrowLeft,
  MessageCircle,
  Ticket
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'
import { lookupPlayerBookings, type PlayerBookingDetail } from '@/actions/booking.actions'

interface PlayerBookingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  initialCode?: string
}

export function PlayerBookingsModal({
  open,
  onOpenChange,
  initialCode = ''
}: PlayerBookingsModalProps) {
  const [activeTab, setActiveTab] = useState<'code' | 'email'>('code')
  const [codeQuery, setCodeQuery] = useState(initialCode)
  const [emailQuery, setEmailQuery] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [bookings, setBookings] = useState<PlayerBookingDetail[] | null>(null)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)

  const handleSearch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    setErrorMessage(null)

    const codeToSearch = activeTab === 'code' ? codeQuery.trim() : undefined
    const emailToSearch = activeTab === 'email' ? emailQuery.trim() : undefined

    if (activeTab === 'code' && !codeToSearch) {
      setErrorMessage('Ingresá el código de tu reserva (ej: PCL-123456).')
      return
    }

    if (activeTab === 'email' && !emailToSearch) {
      setErrorMessage('Ingresá el correo electrónico con el que reservaste.')
      return
    }

    setIsLoading(true)
    try {
      const res = await lookupPlayerBookings({
        code: codeToSearch,
        email: emailToSearch
      })

      if (res.success && res.data && res.data.length > 0) {
        setBookings(res.data)
      } else {
        setBookings(null)
        setErrorMessage(
          res.error || 'No se encontraron reservas con los datos ingresados.'
        )
      }
    } catch {
      setErrorMessage('Ocurrió un error al buscar tu reserva. Probá nuevamente.')
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code)
    setCopiedCode(code)
    setTimeout(() => setCopiedCode(null), 2500)
  }

  const handleResetSearch = () => {
    setBookings(null)
    setErrorMessage(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[28px] shadow-2xl transition-all">
        <DialogHeader className="sr-only">
          <DialogTitle>Mis reservas</DialogTitle>
          <DialogDescription>
            Consulta el estado de tu turno ingresando el código o tu correo electrónico.
          </DialogDescription>
        </DialogHeader>

        {/* ── Encabezado del Modal ────────── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-extrabold text-slate-900 dark:text-white tracking-tight">
              Mis reservas
            </h2>
          </div>
        </div>

        {/* ── Vista 1: Formulario de Búsqueda (Fiel a la captura) ────────── */}
        {!bookings ? (
          <div className="p-6 pt-2 space-y-5">
            {/* Selector de pestañas Segmented Control */}
            <div className="p-1 bg-[#f4f5f6] dark:bg-slate-800/80 rounded-2xl flex items-center gap-1">
              <button
                type="button"
                onClick={() => {
                  setActiveTab('code')
                  setErrorMessage(null)
                }}
                className={`flex-1 py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 ${
                  activeTab === 'code'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Código de reserva
              </button>
              <button
                type="button"
                onClick={() => {
                  setActiveTab('email')
                  setErrorMessage(null)
                }}
                className={`flex-1 py-2 px-3 text-xs sm:text-sm font-semibold rounded-xl transition-all duration-200 ${
                  activeTab === 'email'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Email
              </button>
            </div>

            {/* Subtítulo informativo */}
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 font-normal">
              {activeTab === 'code'
                ? 'Ingresá el código que recibiste al reservar.'
                : 'Ingresá el email con el que registraste tu reserva.'}
            </p>

            {/* Formulario */}
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="space-y-1.5 text-left">
                <label className="text-xs sm:text-sm font-bold text-slate-800 dark:text-slate-200">
                  {activeTab === 'code' ? 'Código de reserva' : 'Email'}
                </label>
                <div className="relative">
                  <input
                    type={activeTab === 'code' ? 'text' : 'email'}
                    autoFocus
                    placeholder={
                      activeTab === 'code' ? 'Ej: PCL-123456' : 'Ej: juan@ejemplo.com'
                    }
                    value={activeTab === 'code' ? codeQuery : emailQuery}
                    onChange={(e) =>
                      activeTab === 'code'
                        ? setCodeQuery(e.target.value)
                        : setEmailQuery(e.target.value)
                    }
                    className="w-full h-12 px-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#68ba9c] focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* Mensaje de Error si no encuentra */}
              {errorMessage && (
                <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{errorMessage}</p>
                </div>
              )}

              {/* Botón Consultar (color menta suave según captura) */}
              <button
                type="submit"
                disabled={isLoading}
                className="w-full h-12 rounded-xl sm:rounded-2xl bg-[#68ba9c] hover:bg-[#5ca88d] active:scale-[0.99] text-white font-bold text-sm sm:text-base flex items-center justify-center gap-2 shadow-sm transition-all disabled:opacity-60 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Consultando...</span>
                  </>
                ) : (
                  <span>Consultar</span>
                )}
              </button>
            </form>

          </div>
        ) : (
          /* ── Vista 2: Detalle y Estado de la Reserva Encontrada ────────── */
          <div className="p-6 pt-2 space-y-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
              <button
                onClick={handleResetSearch}
                className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Buscar otra reserva
              </button>
              <span className="text-xs text-slate-400">
                {bookings.length} {bookings.length === 1 ? 'reserva encontrada' : 'reservas encontradas'}
              </span>
            </div>

            {bookings.map((booking) => {
              const isConfirmed = booking.status === 'CONFIRMED'
              const isPending = booking.status === 'PENDING'
              const isCompleted = booking.status === 'COMPLETED'
              const isCancelled = booking.status === 'CANCELLED'

              return (
                <div
                  key={booking.id}
                  className="p-4 sm:p-5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 space-y-4 text-left shadow-sm"
                >
                  {/* Encabezado de la reserva con estado */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isConfirmed && (
                        <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-0.5 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Reserva Confirmada
                        </Badge>
                      )}
                      {isPending && (
                        <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30 text-xs px-2.5 py-0.5 font-bold flex items-center gap-1">
                          <Clock3 className="w-3.5 h-3.5" />
                          Pendiente de Seña
                        </Badge>
                      )}
                      {isCompleted && (
                        <Badge className="bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/30 text-xs px-2.5 py-0.5 font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Turno Completado
                        </Badge>
                      )}
                      {isCancelled && (
                        <Badge className="bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30 text-xs px-2.5 py-0.5 font-bold flex items-center gap-1">
                          <AlertCircle className="w-3.5 h-3.5" />
                          Reserva Cancelada
                        </Badge>
                      )}
                    </div>

                    {/* Código con botón de copiar */}
                    <button
                      onClick={() => handleCopyCode(booking.code)}
                      title="Copiar código de reserva"
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-mono font-bold text-slate-700 dark:text-slate-300 hover:border-slate-300 transition-colors"
                    >
                      <span>{booking.code}</span>
                      {copiedCode === booking.code ? (
                        <Check className="w-3 h-3 text-emerald-500" />
                      ) : (
                        <Copy className="w-3 h-3 text-slate-400" />
                      )}
                    </button>
                  </div>

                  {/* Datos del Complejo y Cancha */}
                  <div className="space-y-1.5">
                    <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-emerald-500 shrink-0" />
                      {booking.clubName}
                    </h3>
                    <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{booking.clubAddress}, {booking.clubCity}</span>
                    </div>
                  </div>

                  {/* Cancha y Horario */}
                  <div className="grid grid-cols-2 gap-2 p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800/80 text-xs">
                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                        Cancha / Deporte
                      </span>
                      <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                        {booking.courtName}
                      </p>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                        {booking.sport}
                      </span>
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider block">
                        Día y Horario
                      </span>
                      <p className="font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                        {booking.dateFormatted}
                      </p>
                      <span className="text-[11px] text-slate-500 font-medium">
                        {booking.timeFormatted}
                      </span>
                    </div>
                  </div>

                  {/* Desglose de Pago / Estado Económico */}
                  <div className="p-3 rounded-xl bg-emerald-500/5 dark:bg-emerald-950/20 border border-emerald-500/15 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between text-slate-600 dark:text-slate-300">
                      <span>Valor total del turno:</span>
                      <span className="font-bold text-slate-900 dark:text-slate-100">
                        {formatARS(booking.totalAmount)}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-emerald-600 dark:text-emerald-400 font-semibold">
                      <span className="flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Seña pagada:
                      </span>
                      <span>{formatARS(booking.depositAmount)}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1.5 border-t border-emerald-500/20 text-slate-900 dark:text-white font-extrabold text-xs sm:text-sm">
                      <span>Saldo a pagar en el club:</span>
                      <span className="text-emerald-600 dark:text-emerald-400 font-black">
                        {formatARS(booking.balanceRemaining)}
                      </span>
                    </div>
                  </div>

                  {/* Datos del Jugador */}
                  <div className="text-[11px] text-slate-500 flex items-center justify-between px-1">
                    <span>Titular: <strong className="text-slate-700 dark:text-slate-300">{booking.customerName}</strong></span>
                    <span>{booking.customerPhone}</span>
                  </div>

                  {/* Botones de acción */}
                  <div className="flex flex-col sm:flex-row gap-2 pt-1">
                    <Link
                      href={booking.receiptUrl}
                      onClick={() => onOpenChange(false)}
                      className="flex-1 h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-sm transition-all"
                    >
                      <Ticket className="w-3.5 h-3.5" />
                      Ver Comprobante Oficial
                    </Link>

                    {booking.clubPhone && (
                      <a
                        href={`https://wa.me/${booking.clubPhone.replace(/\D/g, '')}?text=${encodeURIComponent(
                          `Hola! Tengo una consulta sobre mi reserva ${booking.code} para ${booking.courtName}.`
                        )}`}
                        target="_blank"
                        rel="noreferrer"
                        className="h-10 px-4 rounded-xl bg-slate-100 dark:bg-slate-900 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-bold text-xs flex items-center justify-center gap-1.5 transition-colors border border-slate-200 dark:border-slate-800"
                      >
                        <MessageCircle className="w-3.5 h-3.5 text-emerald-500" />
                        WhatsApp Club
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
