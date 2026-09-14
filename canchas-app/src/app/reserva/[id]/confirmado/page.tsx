'use client'

import { use, Suspense, useState } from 'react'
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

function ConfirmationContent({ bookingId }: { bookingId: string }) {
  const searchParams = useSearchParams()

  const clubName = searchParams.get('club') || 'Club Pádel Central Tucumán'
  const courtName = searchParams.get('court') || 'Cancha 1 (Panorámica)'
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
  const time = searchParams.get('time') || '19:00'
  const customerName = searchParams.get('name') || 'Jugador'
  const total = Number(searchParams.get('total')) || 14000
  const deposit = Number(searchParams.get('deposit')) || 7000
  const clubSlug = searchParams.get('slug') || 'padel-central'
  const phoneClub = searchParams.get('phoneClub') || '5493814123456'
  const method = searchParams.get('method') || 'TRANSFER'
  const alias = searchParams.get('alias') || 'padelcentral.mp'

  const [copiedAlias, setCopiedAlias] = useState(false)
  const shortCode = bookingId.slice(-6).toUpperCase()

  const isTransfer = method === 'TRANSFER'

  const message = isTransfer
    ? `¡Hola ${clubName}! 👋\nAcabo de reservar por la app:\n🏟️ *${courtName}*\n📅 Fecha: ${date}\n🕐 Horario: ${time} hs\n👤 Nombre: ${customerName}\n🔖 Reserva #${shortCode}\n💳 Monto seña: ${formatARS(deposit)}\n\nAdjunto el comprobante de la transferencia bancaria.`
    : `¡Hola ${clubName}! 👋\nAcabo de reservar por la app:\n🏟️ *${courtName}*\n📅 Fecha: ${date}\n🕐 Horario: ${time} hs\n👤 Nombre: ${customerName}\n🔖 Reserva #${shortCode}\n💳 Seña abonada por Mercado Pago: ${formatARS(deposit)}\n\n¡Nos vemos en la cancha!`

  const waUrl = buildWhatsAppLink(phoneClub, message)

  const handleShare = () => {
    if (navigator.share) {
      navigator.share({
        title: `Reserva en ${clubName}`,
        text: `Tengo reserva en ${courtName} para el ${date} a las ${time} hs.`,
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
              <CalendarIcon className="w-4 h-4 text-emerald-400" />
              <span>Fecha: <strong className="text-white">{date}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-emerald-400" />
              <span>Horario: <strong className="text-white">{time} hs</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span className="truncate">Yerba Buena, Tucumán</span>
            </div>
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
