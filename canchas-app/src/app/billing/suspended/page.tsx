'use client'
// src/app/billing/suspended/page.tsx
// ==============================================================================
// PANTALLA DE BLOQUEO TOTAL (LOCKED) — DUNNING SYSTEM
// Interceptada por Middleware cuando subscription_status === 'LOCKED'
// Permite saldar la deuda pendiente al instante con Mercado Pago Checkout Pro
// ==============================================================================

import { useState, useEffect, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { getTenantDunningDetails } from '@/actions/saas-billing.actions'
import type { TenantSubscriptionStatus } from '@/types/database'
import type { ReactivationFeeDetails } from '@/lib/saas-pricing'
import { PausedClubScreen } from '@/components/dashboard/paused-club-screen'

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
        initialSubState="PAGO_ATRASADO"
        onReactivateSuccess={() => {
          router.push('/dashboard')
        }}
      />
    </div>
  )
}
