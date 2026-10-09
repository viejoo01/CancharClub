'use client'

import { use, Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  XCircle, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  MessageCircle, 
  Home,
  Copy,
  Search
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatARS, buildWhatsAppLink } from '@/lib/utils'
import { toast } from 'sonner'
import { getBookingPublicReceipt, type PublicBookingReceipt } from '@/actions/booking.actions'

function ErrorContent({ bookingId }: { bookingId: string }) {
  const searchParams = useSearchParams()
  const [receipt, setReceipt] = useState<PublicBookingReceipt | null>(null)
  const [copiedAlias, setCopiedAlias] = useState(false)

  useEffect(() => {
    if (!bookingId) return
    let isMounted = true
    getBookingPublicReceipt(bookingId)
      .then(res => {
        if (isMounted && res.success && res.data) {
          setReceipt(res.data)
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [bookingId])

  const clubName = receipt?.clubName || searchParams.get('club') || 'Club Deportivo'
  const courtName = receipt?.courtName || searchParams.get('court') || 'Cancha'
  const date = receipt?.dateFormatted || searchParams.get('date') || new Date().toISOString().split('T')[0]
  const time = receipt?.time || searchParams.get('time') || '19:00'
  const customerName = receipt?.customerName || searchParams.get('name') || 'Jugador'
  const deposit = receipt?.depositAmount ?? (Number(searchParams.get('deposit')) || 0)
  const clubSlug = receipt?.clubSlug || searchParams.get('slug') || ''
  const phoneClub = receipt?.clubPhone || searchParams.get('phoneClub') || ''
  const alias = receipt?.bankAlias || searchParams.get('alias') || ''
  const clubAddress = receipt?.clubAddress || 'Dirección registrada del club'

  const shortCode = bookingId.slice(-6).toUpperCase()

  const message = `¡Hola ${clubName}! 👋\nIntenté reservar el turno para:\n🏟️ *${courtName}*\n📅 Fecha: ${date}\n🕐 Horario: ${time} hs\n👤 Nombre: ${customerName}\n🔖 Reserva #${shortCode}\n\nTuve un inconveniente con el pago online en Mercado Pago. ¿Puedo transferirles la seña directamente al Alias del club?`

  const waUrl = buildWhatsAppLink(phoneClub, message)

  const handleCopyAlias = () => {
    if (!alias) return
    navigator.clipboard.writeText(alias)
    setCopiedAlias(true)
    toast.success(`Alias copiado: ${alias}`)
    setTimeout(() => setCopiedAlias(false), 2000)
  }

  return (
    <div className="w-full max-w-md flex-1 flex flex-col items-center p-5 text-center">
      {/* Icono de Error */}
      <div className="w-20 h-20 rounded-full bg-rose-500/20 border-2 border-rose-500/40 flex items-center justify-center text-rose-400 mt-4 mb-3 shadow-xl shadow-rose-950/50">
        <XCircle className="w-10 h-10" />
      </div>

      <h1 className="text-2xl font-black text-white tracking-tight">
        No se pudo completar el pago
      </h1>
      <p className="text-xs text-slate-300 mt-1 max-w-xs leading-relaxed">
        La operación no fue aprobada por tu tarjeta o Mercado Pago. Podés abonar la seña por transferencia directa al club.
      </p>

      {/* Voucher Digital Card */}
      <Card className="w-full mt-5 border-slate-800 bg-slate-900/90 text-left shadow-2xl relative overflow-hidden">
        <div className="h-2 bg-linear-to-r from-rose-500 to-amber-500" />
        
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-rose-400">
                Seña Pendiente
              </span>
              <h3 className="text-base font-extrabold text-white mt-0.5">
                {courtName}
              </h3>
              <p className="text-xs text-slate-400">{clubName}</p>
            </div>
            <Badge variant="outline" className="font-mono text-xs border-rose-500/40 text-rose-300 bg-rose-500/10">
              #{shortCode}
            </Badge>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <CalendarIcon className="w-4 h-4 text-rose-400" />
              <span>Fecha: <strong className="text-white">{date}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-rose-400" />
              <span>Horario: <strong className="text-white">{time} hs</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <MapPin className="w-4 h-4 text-rose-400" />
              <span className="truncate">{clubAddress}</span>
            </div>
          </div>

          {/* Transferencia directa alternativa */}
          {alias && (
            <div className="p-3 rounded-xl bg-slate-950/90 border border-slate-800 space-y-1.5 text-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Pagá por Transferencia Bancaria Directa
              </div>
              <div className="flex items-center justify-between bg-slate-900 px-2.5 py-1.5 rounded-lg border border-slate-800">
                <span className="font-mono font-bold text-emerald-400 text-xs truncate mr-2">{alias}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleCopyAlias}
                  className="h-7 px-2 text-[11px] text-slate-300 hover:text-white shrink-0"
                >
                  <Copy className="w-3.5 h-3.5 mr-1" />
                  {copiedAlias ? 'Copiado' : 'Copiar'}
                </Button>
              </div>
              {deposit > 0 && (
                <div className="text-[11px] text-slate-400">
                  Monto de seña: <strong className="text-emerald-400">{formatARS(deposit)}</strong>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Botones de Acción */}
      <div className="w-full mt-5 space-y-2.5">
        {phoneClub && (
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition-colors"
          >
            <MessageCircle className="w-4 h-4 fill-white" />
            <span>Coordinar Seña por WhatsApp</span>
          </a>
        )}

        <div className="flex gap-2">
          <Button
            asChild
            variant="outline"
            className="flex-1 border-slate-700 bg-slate-900 text-slate-200 gap-1.5 text-xs h-10"
          >
            <Link href="/mis-reservas">
              <Search className="w-3.5 h-3.5" />
              <span>Mis Reservas</span>
            </Link>
          </Button>

          {clubSlug && (
            <Button
              asChild
              variant="outline"
              className="flex-1 border-slate-700 bg-slate-900 text-slate-200 gap-1.5 text-xs h-10"
            >
              <Link href={`/club/${clubSlug}`}>
                <Home className="w-3.5 h-3.5" />
                <span>Volver al Club</span>
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function BookingErrorPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando...</div>}>
        <ErrorContent bookingId={id} />
      </Suspense>
    </div>
  )
}
