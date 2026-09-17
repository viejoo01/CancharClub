'use client'
// src/app/billing/suspended/page.tsx
// ==============================================================================
// PANTALLA DE BLOQUEO TOTAL (LOCKED) — DUNNING SYSTEM
// Interceptada por Middleware cuando subscription_status === 'LOCKED'
// Permite saldar la deuda pendiente al instante con Mercado Pago Checkout Pro
// ==============================================================================

import { useState, useEffect, useTransition, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Lock,
  CreditCard,
  AlertOctagon,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  PhoneCall,
  FileText,
  ShieldCheck,
  ArrowRight
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Logo } from '@/components/shared/Logo'
import { siteConfig } from '@/config/site'
import {
  getTenantDunningDetails,
  createTenantInvoicePreference,
  recordTenantInvoicePayment
} from '@/actions/saas-billing.actions'
import type { TenantSubscriptionStatus } from '@/types/database'

export default function BillingSuspendedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
      </div>
    }>
      <BillingSuspendedContent />
    </Suspense>
  )
}

function BillingSuspendedContent() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState(false)
  const [justReactivated, setJustReactivated] = useState(false)
  const [dunningData, setDunningData] = useState<{
    tenantId: string
    tenantName: string
    tenantSlug: string
    phone: string
    status: TenantSubscriptionStatus
    currentBalance: number
    invoice: {
      id: string
      month: number
      year: number
      amount: number
      status: string
    }
    pricing: {
      courtsCount: number
      highestSlotPriceArs: number
      multiplier: number
      monthlyFeeArs: number
      formulaDescription: string
      nextDueDate: string
    }
  } | null>(null)

  // Cargar datos de la deuda
  useEffect(() => {
    async function load() {
      try {
        const data = await getTenantDunningDetails()
        setDunningData(data)

        // Si ya está activo, redirigir al dashboard
        if (data.status === 'ACTIVE') {
          router.replace('/dashboard')
        }
      } catch (err) {
        console.error('Error cargando estado dunning:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [router])

  // Iniciar pago con Mercado Pago Checkout Pro
  const handlePayMercadoPago = async () => {
    if (!dunningData) return
    setPaying(true)

    try {
      const res = await createTenantInvoicePreference(dunningData.tenantId, dunningData.invoice.id)
      if (res.initPoint) {
        if (res.isSimulated) {
          // Si estamos en modo de prueba/simulado, procesar el pago directamente
          await handleSimulatedPayment()
        } else {
          // Redirigir a la pasarela real de Mercado Pago
          window.location.assign(res.initPoint)
        }
      }
    } catch (err) {
      console.error('Error iniciando pago con MP:', err)
      alert('Hubo un error al iniciar el checkout de Mercado Pago. Intente nuevamente.')
    } finally {
      setPaying(false)
    }
  }

  // Simular pago aprobado para pruebas locales y demostración
  const handleSimulatedPayment = async () => {
    if (!dunningData) return
    setPaying(true)

    startTransition(async () => {
      try {
        await recordTenantInvoicePayment(dunningData.tenantId, dunningData.invoice.id)
        setJustReactivated(true)
        setTimeout(() => {
          router.push('/dashboard')
        }, 2000)
      } catch (err) {
        console.error('Error al reactivar tenant:', err)
      } finally {
        setPaying(false)
      }
    })
  }


  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-red-500 animate-spin" />
          <p className="text-sm text-slate-400 font-mono">Verificando estado de suscripción...</p>
        </div>
      </div>
    )
  }

  if (justReactivated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-900 border border-emerald-500/50 rounded-2xl p-8 text-center shadow-2xl shadow-emerald-950/50 animate-in zoom-in-95 duration-300">
          <div className="w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 mx-auto flex items-center justify-center mb-4">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">¡Pago Acreditado con Éxito!</h2>
          <p className="text-sm text-slate-300 mb-6">
            La suscripción ha sido reactivada. Se han levantado todas las restricciones y el portal de reservas públicas ya se encuentra habilitado.
          </p>
          <div className="p-3 bg-emerald-950/40 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 font-mono mb-6">
            Estado restaurado: <strong className="text-white">ACTIVE (Al día)</strong>
          </div>
          <Button
            asChild
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-5 rounded-xl shadow-lg shadow-emerald-950/40"
          >
            <Link href="/dashboard">
              Ir al Panel de Control
              <ArrowRight className="w-4 h-4 ml-2" />
            </Link>
          </Button>
        </div>
      </div>
    )
  }

  const invoice = dunningData?.invoice
  const pricing = dunningData?.pricing
  const amountToPay = invoice?.amount ?? pricing?.monthlyFeeArs ?? 45000

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Luces de fondo decorativas */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[500px] h-[500px] bg-red-950/20 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-amber-950/15 rounded-full blur-[90px] pointer-events-none" />

      <div className="max-w-2xl w-full relative z-10 space-y-6">
        {/* Cabecera de Alerta con Logo Canchar */}
        <div className="text-center mb-2">
          <Logo iconSize="md" showTagline={true} />
        </div>

        <div className="bg-gradient-to-b from-red-950/40 to-slate-900/90 border border-red-800/60 rounded-2xl p-6 sm:p-8 backdrop-blur-xl shadow-2xl shadow-red-950/40 text-center">
          <div className="w-16 h-16 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 mx-auto flex items-center justify-center mb-4 shadow-inner">
            <Lock className="w-8 h-8" />
          </div>

          <div className="inline-flex items-center gap-2 mb-2">
            <Badge className="bg-red-500/20 text-red-300 border-red-500/40 uppercase tracking-wider text-xs px-2.5 py-1">
              <AlertOctagon className="w-3.5 h-3.5 mr-1" />
              Acceso Administrativo Bloqueado
            </Badge>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight mb-2">
            {dunningData?.tenantName || 'Club Deportivo'}
          </h1>

          <p className="text-sm sm:text-base text-slate-300 max-w-lg mx-auto leading-relaxed">
            Tu suscripción mensual a <strong className="text-white">{siteConfig.name}</strong> se encuentra pendiente de regularización. El acceso al panel administrativo y las reservas públicas han sido pausados temporalmente tras superar el día 15 sin registrar pago.
          </p>

          <div className="mt-4 inline-flex items-center gap-2 text-xs text-amber-300 bg-amber-950/40 border border-amber-800/40 rounded-full px-4 py-1.5">
            <span>Aboná el saldo equivalente a continuación para reactivar el club al instante con Mercado Pago.</span>
          </div>
        </div>

        {/* Detalle de la Factura y Tarifa */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
            <div className="flex items-center gap-2.5">
              <FileText className="w-5 h-5 text-indigo-400" />
              <h2 className="font-semibold text-white text-base">Detalle de Factura Vencida</h2>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Período: {invoice ? `${invoice.month}/${invoice.year}` : 'Mes Corriente'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-center">
              <span className="text-xs text-slate-400 block mb-1">Canchas Activas</span>
              <strong className="text-base text-white">{pricing?.courtsCount || 2} canchas</strong>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-center">
              <span className="text-xs text-slate-400 block mb-1">Tarifa &quot;Valor Turno&quot;</span>
              <strong className="text-base text-indigo-300">
                {pricing?.multiplier || 1.5}x Turnos Máx.
              </strong>
            </div>

            <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 text-center">
              <span className="text-xs text-slate-400 block mb-1">Turno Nocturno Base</span>
              <strong className="text-base text-white">
                ${(pricing?.highestSlotPriceArs || 30000).toLocaleString('es-AR')}
              </strong>
            </div>
          </div>

          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            <div>
              <span className="text-xs text-slate-400 uppercase tracking-wider block">Total a Pagar para Reactivar</span>
              <div className="text-2xl sm:text-3xl font-black text-white">
                ${amountToPay.toLocaleString('es-AR')}{' '}
                <span className="text-xs font-normal text-slate-400">ARS</span>
              </div>
            </div>

            <Button
              onClick={handlePayMercadoPago}
              disabled={paying || isPending}
              className="w-full sm:w-auto bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold px-6 py-6 rounded-xl shadow-lg shadow-sky-950/40 transition-all flex items-center justify-center gap-2"
            >
              {paying ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Conectando a Mercado Pago...
                </>
              ) : (
                <>
                  <CreditCard className="w-5 h-5" />
                  Pagar Ahora con Mercado Pago
                  <ExternalLink className="w-4 h-4 ml-1 opacity-70" />
                </>
              )}
            </Button>
          </div>

          {/* Información de Medios de Pago */}
          <div className="text-xs text-slate-400 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
            <span className="flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              Reactivación 100% inmediata una vez procesado el pago.
            </span>
            <span className="text-slate-500">Acepta Tarjeta de Débito, Crédito y Dinero en Cuenta MP</span>
          </div>
        </div>

        {/* Pago alternativo por Transferencia Bancaria */}
        <div className="bg-slate-900/60 border border-slate-800/60 rounded-2xl p-5 text-xs text-slate-400 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-300">¿Prefieres pagar por Transferencia Bancaria Directa?</span>
            <span className="text-slate-500">Acreditación manual (24h)</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 bg-slate-950/50 p-3 rounded-xl font-mono text-slate-300">
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Alias CBU / CVU</span>
              <span>{siteConfig.billing.aliasCbu}</span>
            </div>
            <div>
              <span className="text-slate-500 block text-[10px] uppercase">Titular de Cuenta</span>
              <span>{siteConfig.billing.accountHolder}</span>
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span>Envía el comprobante a nuestro canal de soporte:</span>
            <a
              href={siteConfig.links.whatsapp}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
            >
              <PhoneCall className="w-3.5 h-3.5" />
              WhatsApp de Cobranzas Canchar
            </a>
          </div>
        </div>


      </div>
    </div>
  )
}
