'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
  CheckCircle2, 
  Circle, 
  Copy, 
  Check, 
  ExternalLink, 
  Sparkles, 
  Building2, 
  CreditCard, 
  Clock, 
  Share2, 
  ChevronRight, 
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

interface OnboardingChecklistProps {
  tenantSlug: string
  tenantName: string
  courtsCount: number
  hasBankConfigured: boolean
  className?: string
}

export function OnboardingChecklist({
  tenantSlug,
  tenantName,
  courtsCount,
  hasBankConfigured,
  className = '',
}: OnboardingChecklistProps) {
  const [copied, setCopied] = useState(false)
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window !== 'undefined') {
      try {
        return localStorage.getItem(`canchar_checklist_dismissed_${tenantSlug}`) === 'true'
      } catch {}
    }
    return false
  })

  const publicUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/club/${tenantSlug}` 
    : `https://cancharclub.com.ar/club/${tenantSlug}`

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl)
      setCopied(true)
      toast.success('¡Link copiado al portapapeles!', {
        description: 'Compartilo con tus jugadores por WhatsApp o ponelo en el perfil de Instagram.',
      })
      setTimeout(() => setCopied(false), 2500)
    } catch {
      toast.error('No se pudo copiar el link automáticamente.')
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    try {
      localStorage.setItem(`canchar_checklist_dismissed_${tenantSlug}`, 'true')
    } catch {}
  }

  const handleRestore = () => {
    setDismissed(false)
    try {
      localStorage.removeItem(`canchar_checklist_dismissed_${tenantSlug}`)
    } catch {}
  }

  const hasCourts = courtsCount > 0
  const stepsCompleted = (hasCourts ? 1 : 0) + (hasBankConfigured ? 1 : 0) + 1 // Horarios default 8 a 00 siempre activos
  const totalSteps = 3
  const isFullyConfigured = stepsCompleted === totalSteps

  // Si está minimizado / cerrado
  if (dismissed) {
    return (
      <div className={`mb-4 flex flex-wrap items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs shadow-md ${className}`}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-slate-300 font-medium">
            Link público de tu club: <strong className="text-white font-mono">{tenantSlug}</strong>
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleCopyLink}
            className="h-8 px-2.5 text-xs text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl gap-1.5"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </Button>
          <a
            href={`/club/${tenantSlug}`}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline px-2"
          >
            <span>Ver portal</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button
            type="button"
            onClick={handleRestore}
            className="text-[11px] text-slate-500 hover:text-slate-300 ml-1 underline cursor-pointer"
          >
            Ver checklist
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={`mb-6 relative overflow-hidden rounded-3xl bg-linear-to-b from-slate-900 via-slate-900/95 to-slate-950 border border-slate-800 p-5 sm:p-6 shadow-2xl transition-all ${className}`}>
      {/* Luz ambiental sutil */}
      <div className="absolute top-0 right-0 w-96 h-40 bg-emerald-500/10 blur-3xl pointer-events-none" />

      {/* Encabezado del Checklist */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Primeros Pasos de tu Club</span>
            </span>
            <Badge className="bg-slate-800 text-slate-300 border-slate-700 text-xs font-semibold">
              {stepsCompleted} de {totalSteps} completados
            </Badge>
          </div>

          <h3 className="text-base sm:text-lg font-black text-white tracking-tight pt-1">
            {isFullyConfigured 
              ? `¡Todo Listo! Tu Club "${tenantName}" ya puede recibir reservas`
              : `Configuración Inicial para Publicar "${tenantName}"`}
          </h3>

          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            {isFullyConfigured
              ? 'Tus canchas, horarios y cobros están activos. Compartí tu link con jugadores para que comiencen a reservar turnos las 24 horas.'
              : 'Completá estos pasos esenciales para que los turnos online se cobren directamente en tu cuenta y se sincronicen en tiempo real.'}
          </p>
        </div>

        <button
          type="button"
          onClick={handleDismiss}
          className="text-slate-500 hover:text-slate-300 p-1 rounded-lg hover:bg-slate-800/60 transition-colors cursor-pointer"
          title="Minimizar checklist"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Grid de Pasos */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
        
        {/* Paso 1: Canchas */}
        <div className={`p-4 rounded-2xl border transition-all ${
          hasCourts 
            ? 'bg-emerald-950/20 border-emerald-500/30' 
            : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                hasCourts ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-400'
              }`}>
                <Building2 className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-white">1. Canchas y Deportes</span>
            </div>
            {hasCourts ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-slate-600 shrink-0" />
            )}
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            {hasCourts 
              ? `${courtsCount} cancha${courtsCount > 1 ? 's' : ''} cargada${courtsCount > 1 ? 's' : ''} con precio base estándar.` 
              : 'Creá al menos una cancha para recibir reservas.'}
          </p>
          <Link href="/dashboard/canchas">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:underline">
              <span>{hasCourts ? 'Administrar canchas' : 'Agregar canchas'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>

        {/* Paso 2: Cobros y Transferencias */}
        <div className={`p-4 rounded-2xl border transition-all ${
          hasBankConfigured 
            ? 'bg-emerald-950/20 border-emerald-500/30' 
            : 'bg-amber-950/20 border-amber-500/30 ring-1 ring-amber-500/20'
        }`}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${
                hasBankConfigured ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'
              }`}>
                <CreditCard className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-white">2. Datos de Cobro (Alias/CBU)</span>
            </div>
            {hasBankConfigured ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Badge className="bg-amber-500/20 text-amber-300 border-amber-500/40 text-[9px] px-1.5 py-0">
                Falta Cargar
              </Badge>
            )}
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            {hasBankConfigured 
              ? 'Cuenta bancaria o Mercado Pago configurado para recibir señas.' 
              : 'Cargá tu Alias o CBU para que los jugadores te transfieran señas.'}
          </p>
          <Link href="/dashboard/cobros">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-amber-400 hover:underline">
              <span>{hasBankConfigured ? 'Ver datos de cobro' : 'Configurar Cobros Ahora'}</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>

        {/* Paso 3: Horarios de Atención */}
        <div className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
                <Clock className="w-4 h-4" />
              </div>
              <span className="text-xs font-bold text-white">3. Horarios del Complejo</span>
            </div>
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          </div>
          <p className="text-[11px] text-slate-400 mb-3">
            Horario estándar activo: 08:00 a 00:00 hs de lunes a domingo.
          </p>
          <Link href="/dashboard/horarios">
            <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400 hover:underline">
              <span>Ajustar horarios</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </span>
          </Link>
        </div>

      </div>

      {/* Barra de Publicación y Compartir Link */}
      <div className="p-4 rounded-2xl bg-linear-to-r from-emerald-950/40 via-slate-900 to-indigo-950/40 border border-emerald-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <Share2 className="w-5 h-5" />
          </div>
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">Tu Link Público para Jugadores:</span>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-[10px] px-2 py-0">
                Público y Activo
              </Badge>
            </div>
            <p className="text-xs text-emerald-300 font-mono truncate max-w-md">
              {publicUrl}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
          <Button
            size="sm"
            onClick={handleCopyLink}
            className="h-10 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5 shadow-md shadow-emerald-950/40 cursor-pointer"
          >
            {copied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
            <span>{copied ? '¡Copiado!' : 'Copiar Link'}</span>
          </Button>

          <Button
            size="sm"
            variant="outline"
            asChild
            className="h-10 px-3.5 rounded-xl border-slate-700 bg-slate-900/60 hover:bg-slate-800 text-slate-200 text-xs font-semibold gap-1.5 cursor-pointer"
          >
            <a href={`/club/${tenantSlug}`} target="_blank" rel="noreferrer">
              <span>Probar Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </Button>
        </div>
      </div>
    </div>
  )
}
