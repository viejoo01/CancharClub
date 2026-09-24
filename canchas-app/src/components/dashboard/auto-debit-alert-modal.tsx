'use client'

// src/components/dashboard/auto-debit-alert-modal.tsx
// ==============================================================================
// MODAL DE ALERTAS DE DÉBITO AUTOMÁTICO (FALLIDO Y EXITOSO)
// Formatos exactos exigidos:
// - Fallido: "Intento de pago mensual fallido (DD/MM/AAAA HH:MM)"
// - Exitoso: "Pago mensual realizado (DD/MM/AAAA HH:MM)"
// Botón de cierre: "Entendido"
// ==============================================================================

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { 
  AlertTriangle, 
  CheckCircle2, 
  CreditCard, 
  Clock, 
  ArrowRight, 
  X, 
  ShieldAlert,
  Sparkles,
  Layers
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import type { AutoDebitAlert } from '@/types/database'
import { formatAutoDebitAlertDate } from '@/lib/utils'
import { 
  getAutoDebitAlertsAction, 
  dismissAutoDebitAlertAction 
} from '@/actions/saas-billing.actions'

interface AutoDebitAlertModalProps {
  tenantId?: string | null
}

export function AutoDebitAlertModal({ tenantId }: AutoDebitAlertModalProps) {
  const pathname = usePathname()
  const [alerts, setAlerts] = useState<AutoDebitAlert[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isOpen, setIsOpen] = useState(false)
  const [isDismissing, setIsDismissing] = useState(false)

  // Carga las alertas no descartadas desde la base de datos y filtra por localStorage
  const loadAlerts = useCallback(async () => {
    try {
      const dbAlerts = await getAutoDebitAlertsAction(tenantId || undefined)
      if (!Array.isArray(dbAlerts)) return

      // Filtrar las que ya fueron descartadas en este navegador
      const filtered = dbAlerts.filter(alert => {
        if (alert.dismissed) return false
        try {
          const localAck = localStorage.getItem(`canchar_debit_ack_${alert.id}`)
          if (localAck === 'true') return false
        } catch {}
        return true
      })

      setAlerts(filtered)
      if (filtered.length > 0) {
        setCurrentIndex(0)
        setIsOpen(true)
      } else {
        setIsOpen(false)
      }
    } catch (err) {
      console.error('Error al cargar alertas de débito automático:', err)
    }
  }, [tenantId])

  // Cargar al montar y al cambiar de página
  useEffect(() => {
    void loadAlerts()
  }, [loadAlerts, pathname])

  // Escuchar eventos globales para disparar alertas en tiempo real o pruebas
  useEffect(() => {
    const handleTrigger = (e: Event) => {
      const custom = e as CustomEvent<{
        type: 'FAILED' | 'SUCCESS'
        date?: Date | string
        detail?: string
      }>

      if (custom.detail) {
        const dateObj = custom.detail.date ? new Date(custom.detail.date) : new Date()
        const formattedDate = formatAutoDebitAlertDate(dateObj)
        const isFailed = custom.detail.type === 'FAILED'

        const simulatedAlert: AutoDebitAlert = {
          id: `sim_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          type: custom.detail.type,
          title: isFailed
            ? `Intento de pago mensual fallido (${formattedDate})`
            : `Pago mensual realizado (${formattedDate})`,
          formattedDate,
          createdAt: dateObj.toISOString(),
          dismissed: false,
          dismissedAt: null,
          detail: custom.detail.detail || (isFailed ? 'Simulación de cobro no completado' : 'Simulación de cobro exitoso'),
        }

        setAlerts(prev => [simulatedAlert, ...prev])
        setCurrentIndex(0)
        setIsOpen(true)
      }
    }

    window.addEventListener('trigger-auto-debit-alert', handleTrigger)
    return () => {
      window.removeEventListener('trigger-auto-debit-alert', handleTrigger)
    }
  }, [])

  // Descartar la alerta actual mediante el botón "Entendido"
  const handleDismiss = async () => {
    const currentAlert = alerts[currentIndex]
    if (!currentAlert) {
      setIsOpen(false)
      return
    }

    setIsDismissing(true)

    // 1. Guardar en localStorage de inmediato para evitar que reaparezca
    try {
      localStorage.setItem(`canchar_debit_ack_${currentAlert.id}`, 'true')
    } catch {}

    // 2. Persistir en la base de datos si es una alerta real
    if (!currentAlert.id.startsWith('sim_')) {
      void dismissAutoDebitAlertAction(currentAlert.id, tenantId || undefined)
    }

    // 3. Feedback al usuario
    toast.info('Aviso entendido', {
      description: currentAlert.type === 'FAILED'
        ? 'Recordá verificar tu medio de pago para evitar demoras.'
        : 'Tu abono mensual continúa al día.',
    })

    // 4. Actualizar lista de alertas en memoria
    const remaining = alerts.filter((_, idx) => idx !== currentIndex)
    setAlerts(remaining)
    setIsDismissing(false)

    if (remaining.length > 0) {
      // Si quedan alertas, mostrar la siguiente (ajustando índice si es necesario)
      setCurrentIndex(prev => (prev >= remaining.length ? 0 : prev))
    } else {
      setIsOpen(false)
    }
  }

  if (!isOpen || alerts.length === 0) return null

  const currentAlert = alerts[currentIndex]
  if (!currentAlert) return null

  const isFailed = currentAlert.type === 'FAILED'
  const isMultiple = alerts.length > 1

  // Estilos y badges según el tipo de débito automático
  const borderClass = isFailed
    ? 'border-rose-500/60 shadow-rose-950/60'
    : 'border-emerald-500/60 shadow-emerald-950/60'

  const glowBgClass = isFailed ? 'bg-rose-500/10' : 'bg-emerald-500/10'

  const iconBgClass = isFailed
    ? 'bg-rose-500/20 border-rose-500/40 text-rose-400 animate-pulse'
    : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-400'

  const badgeClass = isFailed
    ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
    : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'

  const badgeText = isFailed
    ? 'Débito Automático • Pago Fallido'
    : 'Débito Automático • Pago Acreditado'

  const buttonClass = isFailed
    ? 'bg-rose-600 hover:bg-rose-500 text-white font-bold shadow-rose-950/50'
    : 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-emerald-950/50'

  const IconComponent = isFailed ? ShieldAlert : CheckCircle2

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="debit-alert-title"
      aria-describedby="debit-alert-desc"
    >
      <div className={`relative w-full max-w-md bg-slate-900 border ${borderClass} rounded-3xl shadow-2xl overflow-hidden p-6 sm:p-7 space-y-5 animate-in zoom-in-95 duration-200`}>
        {/* Glow de fondo */}
        <div className={`absolute top-0 right-0 w-48 h-48 ${glowBgClass} rounded-full blur-3xl pointer-events-none`} />

        {/* Encabezado con Icono, Contador y Botón X */}
        <div className="flex items-start justify-between gap-3 relative">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl border flex items-center justify-center shrink-0 ${iconBgClass}`}>
              <IconComponent className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className={`${badgeClass} text-[10px] uppercase font-bold tracking-wider px-2.5 py-0.5`}>
                  {badgeText}
                </Badge>
                {isMultiple && (
                  <Badge variant="outline" className="border-slate-700 bg-slate-800 text-slate-300 text-[10px] px-2 py-0.5 flex items-center gap-1 font-semibold">
                    <Layers className="w-3 h-3 text-slate-400" />
                    <span>Aviso {currentIndex + 1} de {alerts.length}</span>
                  </Badge>
                )}
              </div>
              <h3
                id="debit-alert-title"
                className="text-lg sm:text-xl font-extrabold text-white mt-1.5 leading-snug tracking-tight"
              >
                {currentAlert.title}
              </h3>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDismiss}
            disabled={isDismissing}
            className="p-1.5 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
            title="Cerrar aviso"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Detalle descriptivo */}
        <div
          id="debit-alert-desc"
          className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 space-y-2.5 text-xs text-slate-300"
        >
          <div className="flex items-center justify-between">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Fecha y hora registrada:
            </span>
            <span className="font-bold text-white font-mono text-xs sm:text-sm bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
              {currentAlert.formattedDate}
            </span>
          </div>

          <p className="leading-relaxed text-slate-300 pt-0.5">
            {isFailed
              ? 'El intento de débito automático de tu abono mensual no pudo completarse. Por favor revisá los fondos o el límite de tu tarjeta vinculada para mantener tu club operativo y con las reservas online activas.'
              : 'El cobro automático de tu abono mensual de CancharClub se procesó de forma exitosa. Tu club se encuentra al día con todas las funciones y reservas habilitadas.'}
          </p>

          {currentAlert.detail && (
            <div className="pt-1 border-t border-slate-800/60 text-[11px] text-slate-400 font-mono">
              <span className="text-slate-500">Detalle:</span> {currentAlert.detail}
            </div>
          )}
        </div>

        {/* Botones de acción */}
        <div className="pt-1 flex flex-col sm:flex-row gap-2.5">
          <Button
            type="button"
            onClick={handleDismiss}
            disabled={isDismissing}
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
            onClick={() => {
              void handleDismiss()
            }}
          >
            <Link href="/dashboard/plan">
              <CreditCard className="w-3.5 h-3.5 text-indigo-400" />
              <span>Ver Mi Plan</span>
              <ArrowRight className="w-3 h-3 text-slate-400" />
            </Link>
          </Button>
        </div>

        {isMultiple && (
          <p className="text-[10px] text-center text-slate-500">
            Tenés {alerts.length} avisos pendientes. Al pulsar &quot;Entendido&quot; pasarás al siguiente.
          </p>
        )}
      </div>
    </div>
  )
}
