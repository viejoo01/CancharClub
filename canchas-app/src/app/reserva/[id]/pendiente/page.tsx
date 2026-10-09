'use client'

import { use, Suspense, useState, useEffect } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { 
  Clock, 
  Calendar as CalendarIcon, 
  MapPin, 
  MessageCircle, 
  Home,
  RefreshCw,
  Search
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatARS, buildWhatsAppLink } from '@/lib/utils'
import { getBookingPublicReceipt, type PublicBookingReceipt } from '@/actions/booking.actions'

function formatFriendlyDate(rawDate?: string | null): string {
  if (!rawDate) return ''
  const trimmed = rawDate.trim()
  if (!trimmed) return ''
  if (trimmed.includes(' de ') && !trimmed.toLowerCase().includes('confirmad')) {
    return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
  }
  if (trimmed.toLowerCase().includes('confirmad')) return ''
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

function PendingContent({ bookingId }: { bookingId: string }) {
  const searchParams = useSearchParams()
  const [receipt, setReceipt] = useState<PublicBookingReceipt | null>(null)
  const [rechecking, setRechecking] = useState(false)

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

  const handleManualRecheck = () => {
    if (!bookingId) return
    setRechecking(true)
    getBookingPublicReceipt(bookingId)
      .then(res => {
        if (res.success && res.data) {
          setReceipt(res.data)
        }
      })
      .catch(() => {})
      .finally(() => setRechecking(false))
  }

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
  const deposit = receipt?.depositAmount ?? (Number(searchParams.get('deposit')) || 0)
  const clubSlug = receipt?.clubSlug || searchParams.get('slug') || ''
  const phoneClub = receipt?.clubPhone || searchParams.get('phoneClub') || ''

  const rawAddressParam = searchParams.get('address')
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

  const shortCode = bookingId.slice(-6).toUpperCase()

  const message = `¡Hola ${clubName}! 👋\nAcabo de realizar el pago de la seña por Mercado Pago:\n🏟️ *${courtName}*\n📅 Fecha: ${date}\n🕐 Horario: ${time} hs\n👤 Nombre: ${customerName}\n🔖 Reserva #${shortCode}\n\nEl pago figura pendiente de acreditación en Mercado Pago, les aviso para que estén al tanto.`

  const waUrl = buildWhatsAppLink(phoneClub, message)

  return (
    <div className="w-full max-w-md flex-1 flex flex-col items-center p-5 text-center">
      {/* Icono de Espera */}
      <div className="w-20 h-20 rounded-full bg-amber-500/20 border-2 border-amber-500/40 flex items-center justify-center text-amber-400 mt-4 mb-3 shadow-xl shadow-amber-950/50">
        <Clock className="w-10 h-10 animate-pulse" />
      </div>

      <h1 className="text-2xl font-black text-white tracking-tight">
        Pago en Proceso
      </h1>
      <p className="text-xs text-slate-300 mt-1 max-w-xs leading-relaxed">
        Mercado Pago está acreditando tu transacción. En cuanto se confirme la seña, tu reserva quedará asegurada automáticamente.
      </p>

      {/* Voucher Digital Card */}
      <Card className="w-full mt-5 border-slate-800 bg-slate-900/90 text-left shadow-2xl relative overflow-hidden">
        <div className="h-2 bg-linear-to-r from-amber-500 to-orange-400" />
        
        <CardContent className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Reserva Pendiente de Acreditación
              </span>
              <h3 className="text-base font-extrabold text-white mt-0.5">
                {courtName}
              </h3>
              <p className="text-xs text-slate-400">{clubName}</p>
            </div>
            <Badge variant="outline" className="font-mono text-xs border-amber-500/40 text-amber-300 bg-amber-500/10">
              #{shortCode}
            </Badge>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <CalendarIcon className="w-4 h-4 text-amber-400" />
              <span>Fecha: <strong className="text-white">{date}</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <Clock className="w-4 h-4 text-amber-400" />
              <span>Horario: <strong className="text-white">{time} hs</strong></span>
            </div>
            <div className="flex items-center gap-2 text-slate-300">
              <MapPin className="w-4 h-4 text-amber-400" />
              <span className="truncate">{clubAddress}</span>
            </div>
          </div>

          {/* Desglose */}
          <div className="border-t border-slate-800 pt-3 space-y-1.5 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Jugador:</span>
              <span className="text-slate-200 font-semibold">{customerName}</span>
            </div>
            {deposit > 0 && (
              <div className="flex justify-between text-slate-400">
                <span>Monto seña enviado:</span>
                <span className="text-amber-400 font-bold">{formatARS(deposit)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Botones de Acción */}
      <div className="w-full mt-5 space-y-2.5">
        <Button
          onClick={handleManualRecheck}
          disabled={rechecking}
          variant="outline"
          className="w-full h-11 rounded-xl border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-bold text-xs gap-2"
        >
          <RefreshCw className={`w-4 h-4 ${rechecking ? 'animate-spin' : ''}`} />
          <span>Verificar si ya se acreditó</span>
        </Button>

        {phoneClub && (
          <a
            href={waUrl}
            target="_blank"
            rel="noreferrer"
            className="w-full flex items-center justify-center gap-2 h-11 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-lg shadow-emerald-950/40 transition-colors"
          >
            <MessageCircle className="w-4 h-4 fill-white" />
            <span>Avisar al Club por WhatsApp</span>
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

export default function BookingPendingPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Consultando estado...</div>}>
        <PendingContent bookingId={id} />
      </Suspense>
    </div>
  )
}
