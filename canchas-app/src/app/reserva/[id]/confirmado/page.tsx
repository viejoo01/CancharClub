'use client'

import { use, Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  CheckCircle2, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  MessageCircle, 
  Share2, 
  Home,
  Copy,
  Check,
  Download
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatARS, buildWhatsAppLink } from '@/lib/utils'
import { buildGoogleCalendarLink, downloadIcs } from '@/lib/calendar'
import { toast } from 'sonner'
import { getBookingPublicReceipt, type PublicBookingReceipt } from '@/actions/booking.actions'

function formatFriendlyDate(rawDate?: string | null): string {
  if (!rawDate) return ''
  const trimmed = rawDate.trim()
  if (!trimmed) return ''
  // Si ya viene formateado legiblemente (ej: "Jueves, 8 de octubre de 2026")
  if (trimmed.includes(' de ') && !trimmed.toLowerCase().includes('confirmad')) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  }
  // Si dice "Fecha confirmada", descartar para buscar la fecha real
  if (trimmed.toLowerCase().includes('confirmad')) {
    return ''
  }
  // Si es formato YYYY-MM-DD
  const parts = trimmed.split('-')
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10)
    const m = parseInt(parts[1], 10) - 1
    const d = parseInt(parts[2], 10)
    const dateObj = new Date(y, m, d, 12, 0, 0)
    if (!isNaN(dateObj.getTime())) {
      const f = dateObj.toLocaleDateString('es-AR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
      if (f) return f.charAt(0).toUpperCase() + f.slice(1)
    }
  }
  // Intentar parsear ISO directo
  try {
    const d = new Date(trimmed)
    if (!isNaN(d.getTime())) {
      const f = d.toLocaleDateString('es-AR', {
        timeZone: 'America/Argentina/Buenos_Aires',
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      })
      if (f) return f.charAt(0).toUpperCase() + f.slice(1)
    }
  } catch {}

  return trimmed
}

function ConfirmationContent({ bookingId }: { bookingId: string }) {
  const searchParams = useSearchParams()
  const [receipt, setReceipt] = useState<PublicBookingReceipt | null>(null)

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
  
  const rawDateParam = searchParams.get('date')
  const dateFromReceipt = formatFriendlyDate(receipt?.dateFormatted)
  const dateFromParam = formatFriendlyDate(rawDateParam)
  const todayFallback = formatFriendlyDate(new Date().toISOString().split('T')[0])
  const date = dateFromReceipt || dateFromParam || todayFallback

  const rawTimeParam = searchParams.get('time')
  const time = (receipt?.time && receipt.time !== '19:00')
    ? receipt.time
    : (rawTimeParam || receipt?.time || '19:00')

  const customerName = receipt?.customerName || searchParams.get('name') || 'Jugador'
  const total = receipt?.totalAmount ?? (Number(searchParams.get('total')) || 14000)
  const deposit = receipt?.depositAmount ?? (Number(searchParams.get('deposit')) || 7000)
  const clubSlug = receipt?.clubSlug || searchParams.get('slug') || ''
  const phoneClub = receipt?.clubPhone || searchParams.get('phoneClub') || ''
  const method = receipt?.paymentMethod || searchParams.get('method') || 'TRANSFER'
  const alias = receipt?.bankAlias || searchParams.get('alias') || ''

  const rawAddressParam = searchParams.get('address')
  const rawMapsParam = searchParams.get('maps') || searchParams.get('mapsUrl')

  let clubAddress = ''
  if (receipt?.clubAddress && !receipt.clubAddress.includes('Dirección registrada')) {
    clubAddress = receipt.clubAddress
  } else if (rawAddressParam && !rawAddressParam.includes('Dirección registrada')) {
    clubAddress = rawAddressParam
  } else if (clubName && clubName !== 'Club Deportivo') {
    clubAddress = `${clubName}, San Miguel de Tucumán`
  } else {
    clubAddress = 'San Miguel de Tucumán'
  }

  const googleMapsUrl = receipt?.googleMapsUrl || rawMapsParam || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(clubAddress)}`

  const [copiedAlias, setCopiedAlias] = useState(false)
  const shortCode = bookingId.slice(-6).toUpperCase()

  const isTransfer = method === 'TRANSFER'

  const message = isTransfer
    ? `¡Hola ${clubName}! 👋\nAcabo de reservar por la app:\n🏟️ *${courtName}*\n📅 Fecha: ${date}\n🕐 Horario: ${time} hs\n👤 Nombre: ${customerName}\n🔖 Reserva #${shortCode}\n💳 Monto seña: ${formatARS(deposit)}\n\nAdjunto el comprobante de la transferencia bancaria.`
    : `¡Hola ${clubName}! 👋\nAcabo de reservar por la app:\n🏟️ *${courtName}*\n📅 Fecha: ${date}\n🕐 Horario: ${time} hs\n👤 Nombre: ${customerName}\n🔖 Reserva #${shortCode}\n💳 Seña abonada por Mercado Pago: ${formatARS(deposit)}\n\n¡Nos vemos en la cancha!`

  const waUrl = buildWhatsAppLink(phoneClub, message)

  const teamMessage = `⚽ *¡Hay partido en CancharClub!* 🎾\n\n` +
    `🏟️ *Club:* ${clubName}\n` +
    `📍 *Cancha:* ${courtName}\n` +
    `📅 *Fecha:* ${date}\n` +
    `🕐 *Horario:* ${time} hs\n` +
    `🗺️ *Dirección:* ${clubAddress}\n` +
    (googleMapsUrl ? `📍 *Cómo llegar (Google Maps):* ${googleMapsUrl}\n` : '') +
    `\n👉 *Comprobante y detalles:* ${typeof window !== 'undefined' ? window.location.href : ''}\n\n` +
    `¡Avisen quién va y quién falta!`
  const teamWaUrl = `https://wa.me/?text=${encodeURIComponent(teamMessage)}`

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Reserva en ${clubName}`,
        text: `Tengo reserva en ${courtName} para el ${date} a las ${time} hs en ${clubAddress}.`,
        url: window.location.href,
      }).catch(() => {})
    } else {
      navigator.clipboard.writeText(window.location.href)
      toast.success('¡Enlace de comprobante copiado al portapapeles!')
    }
  }

  const handleCopyAlias = () => {
    navigator.clipboard.writeText(alias)
    setCopiedAlias(true)
    toast.success(`Alias copiado: ${alias}`)
    setTimeout(() => setCopiedAlias(false), 2000)
  }

  return (
    <div className="w-full max-w-md flex-1 flex flex-col items-center p-5 text-center">
      {/* Icono de Éxito */}
      <div className="w-20 h-20 rounded-full bg-emerald-500/20 border-2 border-emerald-500/40 flex items-center justify-center text-emerald-400 mt-4 mb-3 shadow-xl shadow-emerald-950/50">
        <CheckCircle2 className="w-10 h-10" />
      </div>

      <h1 className="text-2xl font-black text-white tracking-tight">
        {isTransfer ? '¡Turno Reservado!' : '¡Turno Confirmado!'}
      </h1>
      <p className="text-xs text-slate-400 mt-1 max-w-xs">
        {isTransfer 
          ? 'Tu turno quedó bloqueado. Recordá enviar el comprobante de transferencia al club.'
          : 'Tu reserva ha sido registrada y tu seña acreditada con éxito.'}
      </p>

      {/* Voucher Digital Card */}
      <Card className="w-full mt-5 border-slate-800 bg-slate-900/90 text-left shadow-2xl relative overflow-hidden">
        <div className="h-2 bg-gradient-to-r from-emerald-500 to-teal-400" />
        
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                Voucher de Reserva
              </span>
              <h3 className="text-base font-extrabold text-white mt-0.5">
                {courtName}
              </h3>
              <p className="text-xs text-slate-400">{clubName}</p>
            </div>
            <Badge variant="default" className="font-mono text-xs">
              #{shortCode}
            </Badge>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <CalendarIcon className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Fecha: <strong className="text-white">{date}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Horario: <strong className="text-white">{time} hs</strong></span>
            </div>
            <a 
              href={googleMapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-slate-300 hover:text-emerald-400 transition-colors group"
              title="Abrir en Google Maps"
            >
              <MapPin className="w-4 h-4 text-emerald-400 shrink-0 group-hover:scale-110 transition-transform" />
              <span className="truncate underline decoration-dotted decoration-slate-600 group-hover:decoration-emerald-400">{clubAddress}</span>
            </a>
          </div>

          {/* Desglose de Saldos */}
          <div className="border-t border-slate-800 pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Titular de la reserva:</span>
              <span className="text-slate-200 font-semibold">{customerName}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Seña requerida ({isTransfer ? 'Transferencia' : 'MP'}):</span>
              <span className="text-emerald-400 font-bold">{formatARS(deposit)}</span>
            </div>
            <div className="flex justify-between text-slate-400">
              <span>Resta pagar en mostrador:</span>
              <span className="text-amber-400 font-bold">{formatARS(total - deposit)}</span>
            </div>
          </div>

          {/* Recordatorio de Alias para Transferencia */}
          {isTransfer && alias && (
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between text-xs">
              <div>
                <span className="text-[10px] text-slate-400 block">Alias para la seña:</span>
                <span className="font-mono font-bold text-emerald-400">{alias}</span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={handleCopyAlias}
                className="h-7 px-2 text-[11px] rounded-lg border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/50 gap-1"
              >
                {copiedAlias ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedAlias ? 'Copiado' : 'Copiar'}</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Sincronización con Calendario */}
      <div className="w-full mt-4 p-3.5 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-2.5 text-left">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-slate-200 flex items-center gap-1.5">
            <CalendarIcon className="w-3.5 h-3.5 text-emerald-400" />
            Agendar en tu Calendario
          </span>
          <span className="text-[10px] text-slate-400">Recordatorio 1h antes</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <a
            href={buildGoogleCalendarLink({
              title: `Turno ${courtName} - ${clubName}`,
              description: `Reserva #${shortCode}\nCancha: ${courtName}\nClub: ${clubName}\nJugador: ${customerName}`,
              location: clubName,
              date,
              startTime: time,
            })}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 h-9 text-xs font-semibold rounded-xl bg-slate-950 hover:bg-slate-800 text-slate-200 border border-slate-700/80 transition-colors"
          >
            <span>Google Calendar</span>
          </a>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              downloadIcs({
                title: `Turno ${courtName} - ${clubName}`,
                description: `Reserva #${shortCode}\nCancha: ${courtName}\nClub: ${clubName}\nJugador: ${customerName}`,
                location: clubName,
                date,
                startTime: time,
              }, `reserva-${shortCode}.ics`)
              toast.success('Archivo .ics descargado')
            }}
            className="h-9 text-xs font-semibold border-slate-700/80 bg-slate-950 hover:bg-slate-800 text-slate-200 gap-1.5 rounded-xl"
          >
            <Download className="w-3 h-3 text-slate-400" />
            <span>Apple / Outlook</span>
          </Button>
        </div>
      </div>

      {/* Botones de Acción */}
      <div className="w-full space-y-2.5 mt-4">
        <a
          href={waUrl}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-2 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/40 transition-colors"
        >
          <MessageCircle className="w-4 h-4" />
          <span>{isTransfer ? 'Enviar Comprobante por WhatsApp' : 'Avisar al Club por WhatsApp'}</span>
        </a>

        <a
          href={teamWaUrl}
          target="_blank"
          rel="noreferrer"
          className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-indigo-600/30 hover:bg-indigo-600/50 border border-indigo-500/50 text-indigo-200 font-bold text-xs transition-colors shadow-sm"
        >
          <Share2 className="w-4 h-4 text-indigo-400" />
          <span>Armar Partido con el Equipo (WhatsApp)</span>
        </a>

        <div className="flex gap-2">
          <Button
            onClick={handleShare}
            variant="outline"
            className="flex-1 border-slate-700 bg-slate-900 text-slate-200 gap-1.5 text-xs h-10"
          >
            <Share2 className="w-3.5 h-3.5" />
            <span>Compartir</span>
          </Button>

          <Button
            asChild
            variant="outline"
            className="flex-1 border-slate-700 bg-slate-900 text-slate-200 gap-1.5 text-xs h-10"
          >
            <Link href={`/club/${clubSlug}`}>
              <Home className="w-3.5 h-3.5" />
              <span>Ver Club</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}

export default function BookingConfirmedPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando voucher...</div>}>
        <ConfirmationContent bookingId={id} />
      </Suspense>
    </div>
  )
}
