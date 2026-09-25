'use client'

import React from 'react'
import Link from 'next/link'
import { Lock, Sparkles, ArrowRight, ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTenantPlan, useUserRole } from '@/hooks/use-tenant-id'
import { SAAS_PLANS, SAAS_PLANS_LIST, type SaaSFeatureKey } from '@/config/saas-plans'

interface PlanFeatureGuardProps {
  feature: SaaSFeatureKey
  featureTitle: string
  children: React.ReactNode
}

export function PlanFeatureGuard({
  feature,
  featureTitle,
  children,
}: PlanFeatureGuardProps) {
  const { plan, isFeatureAllowed } = useTenantPlan()
  const { role } = useUserRole()

  // Superadmin siempre tiene acceso completo a todas las funcionalidades
  if (role === 'SUPERADMIN' || isFeatureAllowed(feature)) {
    return <>{children}</>
  }

  // Encontrar el plan mínimo que habilita esta funcionalidad
  const requiredPlan = SAAS_PLANS_LIST.find(p => p.allowedModules.includes(feature)) || SAAS_PLANS.GRANDE_5_PLUS

  return (
    <div className="flex-1 p-4 sm:p-8 flex items-center justify-center min-h-[75vh] animate-fade-in">
      <div className="max-w-md w-full text-center bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md relative overflow-hidden">
        {/* Glow de fondo */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Ícono de Candado con estilo moderno */}
        <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4 text-indigo-400 shadow-inner">
          <Lock className="w-8 h-8" />
        </div>

        {/* Badge del plan requerido */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-500/10 border border-amber-500/30 text-amber-400 mb-3">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Requiere Plan {requiredPlan.name} ({requiredPlan.courtsLabel})</span>
        </div>

        {/* Título */}
        <h2 className="text-xl sm:text-2xl font-black text-white tracking-tight">
          {featureTitle} no disponible
        </h2>

        {/* Descripción clara con el plan actual del club */}
        <p className="text-sm text-slate-400 mt-2.5 leading-relaxed">
          Tu club actualmente tiene activo el <strong className="text-slate-200">{plan.name} ({plan.courtsLabel})</strong>. Esta función está reservada para complejos con <strong className="text-slate-200">{requiredPlan.courtsLabel}</strong>.
        </p>

        {/* Acciones */}
        <div className="mt-6 flex flex-col gap-2.5">
          <Button asChild className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-900/30 transition-all">
            <Link href="/dashboard/plan" className="flex items-center justify-center gap-2">
              <span>Ver y ascender de plan</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </Button>

          <Button asChild variant="outline" className="w-full h-10 border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800/60 rounded-xl">
            <Link href="/dashboard" className="flex items-center justify-center gap-1.5">
              <ArrowLeft className="w-4 h-4" />
              <span>Volver al calendario</span>
            </Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
