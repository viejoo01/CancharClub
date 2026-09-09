'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { 
  Lock, 
  Clock, 
  ArrowLeft, 
  CreditCard, 
  AlertCircle,
  Loader2,
  Phone
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { formatARS } from '@/lib/utils'
import { initiateOnlineCheckout } from '@/actions/booking.actions'
import { toast } from 'sonner'
import type { SportType } from '@/types/database'

function CheckoutContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const courtId = searchParams.get('courtId') || 'c1'
  const courtName = searchParams.get('courtName') || 'Cancha 1 (Panorámica)'
  const date = searchParams.get('date') || new Date().toISOString().split('T')[0]
  const time = searchParams.get('time') || '19:00'
  const total = Number(searchParams.get('total')) || 14000
  const deposit = Number(searchParams.get('deposit')) || 7000
  const sport = (searchParams.get('sport') || 'PADEL') as SportType

  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  const [isPublicPaused] = useState<boolean>(() => {
    if (typeof document !== 'undefined') {
      const cookies = document.cookie.split('; ')
      const statusCookie = cookies.find(c => c.startsWith('demo_subscription_status='))
      if (statusCookie) {
        const val = statusCookie.split('=')[1]
        return val === 'PARTIALLY_SUSPENDED' || val === 'LOCKED'
      }
    }
    return false
  })

  // Temporizador de 7 minutos para el Redis Lock
  const [secondsLeft, setSecondsLeft] = useState(420)

  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          toast.error('El tiempo de reserva expiró. Por favor seleccioná el turno nuevamente.')
          router.back()
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [router])

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60)
    const rem = secs % 60
    return `${mins.toString().padStart(2, '0')}:${rem.toString().padStart(2, '0')}`
  }

  const handlePay = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error('Completá tu nombre y teléfono de contacto')
      return
    }

    setLoading(true)
    try {
      const startsAt = `${date}T${time}:00`

      // 1. Invocar Server Action para lock + creación de booking y preferencia MP
      const res = await initiateOnlineCheckout(
        {
          tenant_id: '00000000-0000-0000-0000-000000000001',
          court_id: courtId,
          customer_name: customerName,
          customer_phone: customerPhone,
          customer_email: customerEmail || undefined,
          customer_notes: notes || undefined,
          starts_at: startsAt,
          origin: 'ONLINE_PORTAL',
          total_amount_ars: total,
          deposit_amount_ars: deposit,
        },
        'MIN_90'
      )

      if (!res.success) {
        toast.error(res.error || 'Error al iniciar checkout')
        setLoading(false)
        return
      }

      // Si Mercado Pago devolvió init_point, redirigir
      if (res.mp_init_point) {
        toast.success('Redirigiendo a Mercado Pago...')
        window.location.href = res.mp_init_point
      } else {
        // En entorno local o sin token de MP configurado, ir directamente a voucher de confirmación
        toast.success('¡Turno reservado!')
        router.push(`/reserva/${res.booking_id}/confirmado?club=Club+Pádel+Central&court=${encodeURIComponent(courtName)}&date=${date}&time=${time}&name=${encodeURIComponent(customerName)}&phone=${encodeURIComponent(customerPhone)}&total=${total}&deposit=${deposit}`)
      }
    } catch {
      toast.error('Error inesperado al procesar la reserva')
      setLoading(false)
    }
  }

  return (
    <div className="w-full max-w-xl flex-1 flex flex-col pb-12 border-x border-slate-900 bg-slate-950">
      {/* Header */}
      <div className="p-4 border-b border-slate-800 flex items-center justify-between">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver</span>
        </button>
        <span className="text-sm font-bold text-white">Checkout Seguro</span>
        <div className="w-12" />
      </div>

      {/* Timer de bloqueo Redis */}
      <div className="mx-4 mt-4 p-3 rounded-xl bg-amber-950/40 border border-amber-500/30 flex items-center justify-between text-amber-200 text-xs">
        <div className="flex items-center gap-2 font-medium">
          <Clock className="w-4 h-4 text-amber-400 animate-pulse" />
          <span>Turno bloqueado temporalmente:</span>
        </div>
        <span className="font-mono font-black text-sm bg-amber-900/60 px-2 py-0.5 rounded text-amber-300">
          {formatTimer(secondsLeft)}
        </span>
      </div>

      {/* Resumen del Turno */}
      <div className="p-4">
        <Card className="border-slate-800 bg-slate-900/80">
          <CardContent className="p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[11px] font-bold uppercase text-emerald-400">
                  {sport}
                </span>
                <h2 className="text-base font-bold text-white">{courtName}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Fecha: <span className="text-slate-200 font-medium">{date}</span> • Horario: <span className="text-slate-200 font-medium">{time} hs</span>
                </p>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-slate-400">
                <span>Precio total del turno:</span>
                <span className="text-slate-200 font-semibold">{formatARS(total)}</span>
              </div>
              <div className="flex justify-between text-slate-400">
                <span>Saldo a abonar en el club:</span>
                <span className="text-slate-200 font-semibold">{formatARS(total - deposit)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-white pt-1 border-t border-slate-800">
                <span className="text-emerald-400">Seña a pagar ahora (50%):</span>
                <span className="text-emerald-400 text-base">{formatARS(deposit)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Formulario de Datos del Jugador */}
      <form onSubmit={handlePay} className="px-4 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="name">Nombre y Apellido *</Label>
          <Input
            id="name"
            placeholder="Ej. Lucas Alurralde"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="phone">Teléfono Celular (WhatsApp) *</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="Ej. 3814123456"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            required
          />
          <p className="text-[11px] text-slate-500">
            Te enviaremos el comprobante y recordatorio por WhatsApp.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Email (Opcional)</Label>
          <Input
            id="email"
            type="email"
            placeholder="nombre@ejemplo.com"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Comentarios para el Club</Label>
          <Input
            id="notes"
            placeholder="Ej. Alquiler de paletas o pelotas"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Botón de Pago o Aviso de Pausa */}
        <div className="pt-4">
          {isPublicPaused ? (
            <div className="space-y-3">
              <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-xl text-center space-y-2">
                <AlertCircle className="w-6 h-6 text-amber-400 mx-auto" />
                <p className="text-xs text-amber-200 leading-relaxed">
                  Las reservas online están momentáneamente en pausa. Podés reservar este turno comunicándote directamente con el club por WhatsApp.
                </p>
              </div>
              <Button
                asChild
                className="w-full h-13 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold text-base shadow-xl shadow-emerald-950/50 gap-2"
              >
                <a
                  href={`https://wa.me/5493814123456?text=${encodeURIComponent(`Hola! Quisiera reservar el turno de las ${time} hs en ${courtName} para la fecha ${date}.`)}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <Phone className="w-5 h-5" />
                  Reservar este Turno por WhatsApp
                </a>
              </Button>
            </div>
          ) : (
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-13 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-extrabold text-base shadow-xl shadow-emerald-950/50 gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Conectando con Mercado Pago...</span>
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  <span>Pagar Seña con Mercado Pago ({formatARS(deposit)})</span>
                </>
              )}
            </Button>
          )}

          <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500">
            <Lock className="w-3.5 h-3.5 text-emerald-500" />
            <span>Transacción cifrada y protegida por Mercado Pago</span>
          </div>
        </div>
      </form>
    </div>
  )
}

export default function CheckoutPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      <Suspense fallback={<div className="p-8 text-center text-slate-400">Cargando checkout...</div>}>
        <CheckoutContent />
      </Suspense>
    </div>
  )
}
