'use client'
// src/app/billing/suspended/page.tsx
// ==============================================================================
// PANTALLA DE BLOQUEO TOTAL (LOCKED) — DUNNING SYSTEM
// Interceptada por Middleware cuando subscription_status === 'LOCKED'
// Permite saldar la deuda pendiente al instante con Mercado Pago Checkout Pro
// ==============================================================================

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { getTenantDunningDetails, recordReactivationPaymentAction } from '@/actions/saas-billing.actions'
import type { TenantSubscriptionStatus } from '@/types/database'
import type { ReactivationFeeDetails } from '@/lib/saas-pricing'
import { PausedClubScreen } from '@/components/dashboard/paused-club-screen'
import { toast } from 'sonner'

export default function BillingSuspendedPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    }>
      <BillingSuspendedContent />
    </Suspense>
  )
}

function BillingSuspendedContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [loading, setLoading] = useState(true)
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
    reactivation?: ReactivationFeeDetails
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

  // Manejo de pago simulado en entornos de desarrollo / pruebas
  useEffect(() => {
    const isPaySimulated = searchParams.get('pay_simulated') === 'true'
    const targetTenantId = searchParams.get('tenant_id')
    const simulatedAmount = Number(searchParams.get('amount')) || 0
    const simulatedDays = Number(searchParams.get('days')) || 0

    if (isPaySimulated && targetTenantId && simulatedAmount > 0) {
      toast.info('Acreditando pago simulado de abono mensual...')
      const surcharge = Math.max(0, simulatedDays > 0 ? Math.round(simulatedAmount - (simulatedAmount / (1 + simulatedDays * 0.03))) : 0)
      recordReactivationPaymentAction({
        tenantId: targetTenantId,
        totalPaid: simulatedAmount,
        daysOverdue: simulatedDays,
        surchargeAmount: surcharge,
        paymentMethod: 'SIMULADO',
        notes: `Pago simulado de abono mensual acreditado (+${simulatedDays * 3}% mora: $${simulatedAmount.toLocaleString('es-AR')})`,
      }).then((res) => {
        if (res.success) {
          toast.success('¡Abono mensual acreditado con éxito!')
          router.replace('/dashboard?billing_success=true')
        }
      }).catch((err) => {
        console.error('Error aplicando pago simulado:', err)
      })
    }
  }, [searchParams, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="w-8 h-8 text-amber-500 animate-spin" />
          <p className="text-sm text-slate-400 font-mono">Verificando estado de suscripción...</p>
        </div>
      </div>
    )
  }

  const pricing = dunningData?.pricing

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      <PausedClubScreen
        tenantId={dunningData?.tenantId}
        tenantName={dunningData?.tenantName || 'Club Deportivo'}
        subscriptionStatus={dunningData?.status}
        baseMonthlyFeeArs={pricing?.monthlyFeeArs || 45000}
        dueDate={pricing?.nextDueDate}
        onReactivateSuccess={() => {
          router.push('/dashboard')
        }}
      />
    </div>
  )
}
