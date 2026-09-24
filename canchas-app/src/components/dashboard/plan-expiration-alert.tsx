'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  AlertTriangle, 
  AlertCircle, 
  Clock, 
  CheckCircle2, 
  ArrowRight, 
  X,
  CreditCard,
  ShieldAlert
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface PlanExpirationAlertProps {
  tenantId?: string | null
  dueDate?: string
  daysRemaining?: number
}

export function PlanExpirationAlert({
  tenantId,
  dueDate = '30/09/2026',
  daysRemaining = 999,
}: PlanExpirationAlertProps) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = useState(false)
  const [activeDays, setActiveDays] = useState<number>(daysRemaining)
  const [activeDueDate, setActiveDueDate] = useState<string>(dueDate)

  // Función para evaluar y mostrar la alerta correspondiente
  const evaluateAlert = useCallback((days: number, due: string) => {
    // Si no está entre 0 y 3 días, no corresponde alerta
    if (days < 0 || days > 3) {
      setIsOpen(false)
      return
    }

    // Verificar si ya fue aceptado con "Entendido" para este día específico
    const storageKey = `canchar_plan_exp_ack_${tenantId || 'club'}_d${days}_${due}`
    try {
      const isAcknowledged = localStorage.getItem(storageKey) === 'true'
      if (isAcknowledged) {
        setIsOpen(false)
      } else {
        setActiveDays(days)
        setActiveDueDate(due)
        setIsOpen(true)
      }
    } catch {
      // Fallback si localStorage no está disponible
      setActiveDays(days)
      setActiveDueDate(due)
      setIsOpen(true)
    }
  }, [tenantId])

  // Evaluación inicial y al cambiar de menú / ruta
  useEffect(() => {
    const timer = setTimeout(() => {
      // 1. Revisar si hay un parámetro de prueba en la URL (ej: ?test_alert_days=3)
      if (typeof window !== 'undefined') {
        const params = new URLSearchParams(window.location.search)
        const testParam = params.get('test_alert_days')

        if (testParam === 'clear' || testParam === 'reset') {
          try {
            [0, 1, 2, 3].forEach(d => {
              localStorage.removeItem(`canchar_plan_exp_ack_${tenantId || 'club'}_d${d}_${dueDate}`)
            })
            toast.success('Alertas de vencimiento reiniciadas para pruebas')
          } catch {}
        } else if (testParam !== null && !isNaN(Number(testParam))) {
          const testDays = Number(testParam)
          setActiveDays(testDays)
          setActiveDueDate(dueDate)
          setIsOpen(true)
          return
        }
      }

      // 2. Comportamiento normal con datos reales
      evaluateAlert(daysRemaining, dueDate)
    }, 0)

    return () => clearTimeout(timer)
  }, [pathname, daysRemaining, dueDate, evaluateAlert, tenantId])

  // Escuchar eventos globales para pruebas interactivas desde el panel de "Mi Plan"
  useEffect(() => {
    const handleTestEvent = (e: Event) => {
      const custom = e as CustomEvent<{ days: number; dueDate?: string }>
      if (custom.detail) {
        const days = custom.detail.days
        const due = custom.detail.dueDate || dueDate
        try {
          localStorage.removeItem(`canchar_plan_exp_ack_${tenantId || 'club'}_d${days}_${due}`)
        } catch {}
        setActiveDays(days)
        setActiveDueDate(due)
        setIsOpen(true)
      }
    }

    window.addEventListener('test-plan-expiration-alert', handleTestEvent)
    return () => {
      window.removeEventListener('test-plan-expiration-alert', handleTestEvent)
    }
  }, [tenantId, dueDate])

  // Acción al pulsar "Entendido"
  const handleDismiss = () => {
    const storageKey = `canchar_plan_exp_ack_${tenantId || 'club'}_d${activeDays}_${activeDueDate}`
    try {
      localStorage.setItem(storageKey, 'true')
    } catch {}
    setIsOpen(false)
    toast.info('Aviso entendido', {
      description: `Recordá que tu abono vence el ${activeDueDate}.`,
    })
  }

  if (!isOpen) return null

  // Configuración progresiva según los días restantes (3, 2, 1 o 0)
  const isOneDay = activeDays === 1
  const isTwoDays = activeDays === 2
  const isThreeDays = activeDays === 3
  const isToday = activeDays === 0

  let titleText = `Su plan está a ${activeDays} días de vencerse`
  let badgeText = `Aviso de Vencimiento • ${activeDays} días restantes`
  let badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40'
  let borderClass = 'border-amber-500/40 shadow-amber-950/30'
  let iconBgClass = 'bg-amber-500/20 border-amber-500/40 text-amber-400'
  let buttonClass = 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-amber-950/40'
  let IconComponent = AlertTriangle

  if (isThreeDays) {
    titleText = 'Su plan está a 3 días de vencerse'
    badgeText = 'Aviso Preventivo • 3 días restantes'
    badgeClass = 'bg-amber-500/20 text-amber-300 border-amber-500/40'
    borderClass = 'border-amber-500/40 shadow-amber-950/30'
    iconBgClass = 'bg-amber-500/20 border-amber-500/40 text-amber-400'
    buttonClass = 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold shadow-amber-950/40'
    IconComponent = AlertTriangle
  } else if (isTwoDays) {
    titleText = 'Su plan está a 2 días de vencerse'
    badgeText = 'Atención • 2 días restantes'
    badgeClass = 'bg-orange-500/20 text-orange-300 border-orange-500/40'
    borderClass = 'border-orange-500/50 shadow-orange-950/40'
    iconBgClass = 'bg-orange-500/20 border-orange-500/40 text-orange-400'
    buttonClass = 'bg-orange-500 hover:bg-orange-400 text-slate-950 font-bold shadow-orange-950/40'
    IconComponent = AlertTriangle
  } else if (isOneDay) {
    titleText = 'Su plan está a 1 día de vencerse'
    badgeText = 'Urgente • 1 día restante'
    badgeClass = 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    borderClass = 'border-rose-500/60 shadow-rose-950/50'
    iconBgClass = 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
    buttonClass = 'bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-rose-950/50'
    IconComponent = AlertCircle
  } else if (isToday) {
    titleText = 'Su plan vence hoy'
    badgeText = 'Último Día • Vence Hoy'
    badgeClass = 'bg-red-500/25 text-red-300 border-red-500/50'
    borderClass = 'border-red-500/70 shadow-red-950/60'
    iconBgClass = 'bg-red-500/25 border-red-500/50 text-red-400 animate-bounce'
    buttonClass = 'bg-red-600 hover:bg-red-500 text-white font-bold shadow-red-950/60'
    IconComponent = ShieldAlert
  }

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="plan-alert-title"
      aria-describedby="plan-alert-desc"
    >
      <div className={`relative w-full max-w-md bg-slate-900 border ${borderClass} rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200`}>
        {/* Glow de fondo temático */}
        <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Encabezado con Icono y Badge */}
        <div className="flex items-start justify-between gap-3 relative">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${iconBgClass}`}>
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <Badge className={`${badgeClass} text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5`}>
                {badgeText}
              </Badge>
              <h3 id="plan-alert-title" className="text-lg sm:text-xl font-extrabold text-white mt-1.5 leading-snug tracking-tight">
                {titleText}
              </h3>
            </div>
          </div>
          <button
            onClick={handleDismiss}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            title="Cerrar aviso"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Detalle descriptivo */}
        <div id="plan-alert-desc" className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2 text-xs text-slate-300">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Fecha de vencimiento:
            </span>
            <span className="font-bold text-white font-mono text-sm bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {activeDueDate}
            </span>
          </div>
          <p className="leading-relaxed text-slate-300 pt-1">
            Para garantizar la continuidad de tus reservas online y el acceso sin interrupciones a la plataforma, por favor asegurate de tener al día tu abono mensual o tu medio de pago registrado.
          </p>
        </div>

        {/* Botones de acción */}
        <div className="pt-1 flex flex-col sm:flex-row gap-2.5">
          <Button
            type="button"
            onClick={handleDismiss}
            className={`w-full sm:flex-1 ${buttonClass} rounded-xl text-xs py-5 cursor-pointer shadow-lg flex items-center justify-center gap-2`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Entendido</span>
          </Button>

          <Button
            type="button"
            asChild
            variant="outline"
            className="w-full sm:w-auto border-slate-700 hover:bg-slate-800 text-slate-200 text-xs py-5 rounded-xl cursor-pointer flex items-center justify-center gap-1.5"
            onClick={handleDismiss}
          >
            <Link href="/dashboard/plan">
              <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
              <span>Mi Plan</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
            </Link>
          </Button>
        </div>

        <p className="text-[10px] text-center text-slate-500">
          Este aviso aparecerá en cada menú hasta que pulses en &quot;Entendido&quot;.
        </p>
      </div>
    </div>
  )
}
