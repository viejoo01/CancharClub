'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2,
  Loader2,
  ArrowRight,
  Sparkles,
  Check,
  MapPin,
  Phone,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  Mail,
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { registerClub } from '@/actions/auth.actions'
import { SAAS_PLANS, SAAS_PLANS_LIST, type SaaSPlanId } from '@/config/saas-plans'
import { toast } from 'sonner'

interface RegisterClubModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedPlanId?: SaaSPlanId
  billingFrequency?: 'MONTHLY' | 'ANNUAL'
}

interface SportOption {
  id: string
  label: string
}

const SPORTS_OPTIONS: SportOption[] = [
  { id: 'PADEL', label: 'Pádel' },
  { id: 'FUTBOL', label: 'Fútbol' },
  { id: 'TENIS', label: 'Tenis' },
  { id: 'BASQUET', label: 'Básquet' },
]

const PLAN_PRICE_CHIPS: Record<SaaSPlanId, { monthly: string; annual: string }> = {
  CHICO_1: { monthly: '$35k / m', annual: '$28k / m' },
  MEDIANO_2: { monthly: '$52k / m', annual: '$44k / m' },
  CONSOLIDADO_3_4: { monthly: '$69k / m', annual: '$55k / m' },
  GRANDE_5_PLUS: { monthly: '$89k+ / m', annual: '$100k / m' },
}

export function RegisterClubModal({
  open,
  onOpenChange,
  selectedPlanId = 'MEDIANO_2',
  billingFrequency = 'MONTHLY',
}: RegisterClubModalProps) {
  const router = useRouter()
  const [selectedPlanOverride, setSelectedPlanOverride] = useState<SaaSPlanId | null>(null)
  const [prevSelectedPlanId, setPrevSelectedPlanId] = useState<SaaSPlanId>(selectedPlanId)
  const [prevBillingFrequency, setPrevBillingFrequency] = useState<'MONTHLY' | 'ANNUAL'>(billingFrequency)
  const [internalBillingFrequency, setInternalBillingFrequency] = useState<'MONTHLY' | 'ANNUAL'>(billingFrequency)

  if (selectedPlanId !== prevSelectedPlanId) {
    setPrevSelectedPlanId(selectedPlanId)
    setSelectedPlanOverride(null)
  }

  if (billingFrequency !== prevBillingFrequency) {
    setPrevBillingFrequency(billingFrequency)
    setInternalBillingFrequency(billingFrequency)
  }

  const currentPlanId = selectedPlanOverride || selectedPlanId
  const [clubName, setClubName] = useState('')
  const [city, setCity] = useState('San Miguel de Tucumán')
  const [emailPrefix, setEmailPrefix] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [selectedSports, setSelectedSports] = useState<string[]>(['PADEL'])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleClubNameChange = (val: string) => {
    setClubName(val)
    const slug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
    setEmailPrefix(slug)
  }

  const activePlanDef = SAAS_PLANS[currentPlanId] || SAAS_PLANS.MEDIANO_2

  const toggleSport = (sportId: string) => {
    setSelectedSports(prev =>
      prev.includes(sportId)
        ? prev.filter(s => s !== sportId)
        : [...prev, sportId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const cleanPrefix = emailPrefix.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
    if (!clubName.trim() || !cleanPrefix || !password.trim()) {
      setErrorMessage('Por favor completá todos los campos requeridos.')
      return
    }

    const fullEmail = `${cleanPrefix}@club.com`

    if (selectedSports.length === 0) {
      setErrorMessage('Por favor seleccioná al menos un deporte para tu complejo.')
      return
    }

    setIsLoading(true)

    const formData = new FormData()
    formData.append('clubName', clubName)
    formData.append('city', city)
    formData.append('email', fullEmail)
    formData.append('phone', phone)
    formData.append('password', password)
    formData.append('sports', JSON.stringify(selectedSports))
    formData.append('planId', currentPlanId)

    try {
      const res = await registerClub(formData)
      if (res && !res.success) {
        setErrorMessage(res.error || 'Ocurrió un error al registrar el club.')
        setIsLoading(false)
      } else {
        toast.success('¡Club registrado exitosamente!')
        router.push('/onboarding/tarjeta')
      }
    } catch {
      // Redirección de Next.js
      router.push('/onboarding/tarjeta')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl w-[95vw] sm:w-full p-5 sm:p-7 bg-slate-950 text-slate-100 border border-slate-800/90 rounded-[28px] shadow-2xl transition-all max-h-[92dvh] overflow-y-auto custom-scrollbar">
        <DialogHeader className="sr-only">
          <DialogTitle>Sumá tu club - Canchar Club</DialogTitle>
          <DialogDescription>
            Digitalizá tu complejo deportivo, turnos fijos, cobros online y reservas.
          </DialogDescription>
        </DialogHeader>

        <div className="w-full flex flex-col items-center text-center">
          {/* Badge superior de prueba gratis */}
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-semibold mb-2 shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>15 días de prueba 100% gratis</span>
          </div>

          {/* Título y Subtítulo */}
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Sumá tu club
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1 font-normal max-w-sm">
            Comenzá a gestionar tus canchas, turnos y cobros con Canchar Club.
          </p>

          {/* Card Selector de Plan SaaS */}
          <div className="w-full mt-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md text-left">
            {/* Header de plan con switch de frecuencia */}
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                ¿Cuántas canchas tenés?
              </span>

              {/* Switch Mensual / Anual */}
              <div className="inline-flex items-center bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-[10px]">
                <button
                  type="button"
                  onClick={() => setInternalBillingFrequency('MONTHLY')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer ${
                    internalBillingFrequency === 'MONTHLY'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Mensual
                </button>
                <button
                  type="button"
                  onClick={() => setInternalBillingFrequency('ANNUAL')}
                  className={`px-2.5 py-1 rounded-lg font-bold transition-all cursor-pointer flex items-center gap-1 ${
                    internalBillingFrequency === 'ANNUAL'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <span>Anual</span>
                  <span className="text-[9px] px-1 py-0.2 rounded bg-emerald-400/20 text-emerald-300 font-black">
                    -20%
                  </span>
                </button>
              </div>
            </div>

            {/* Grilla de 4 tarjetas de plan */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {SAAS_PLANS_LIST.map((p) => {
                const isSelected = p.id === currentPlanId
                const priceBadge = internalBillingFrequency === 'ANNUAL'
                  ? PLAN_PRICE_CHIPS[p.id].annual
                  : PLAN_PRICE_CHIPS[p.id].monthly

                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPlanOverride(p.id)}
                    className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer relative flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-500/15 border-emerald-500 text-white shadow-sm ring-1 ring-emerald-500/50'
                        : 'bg-slate-950/70 text-slate-300 border-slate-800 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-1">
                        <span className="text-xs font-black tracking-tight">{p.courtsLabel}</span>
                        {isSelected && (
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                        )}
                      </div>
                      <div className={`text-[11px] font-bold mt-1 ${isSelected ? 'text-emerald-300' : 'text-slate-400'}`}>
                        {priceBadge}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>

            {/* Subtexto explicativo del plan */}
            <div className="mt-3 pt-2.5 border-t border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between text-xs gap-1">
              <div className="flex items-center gap-1.5 font-bold text-white text-[11px] sm:text-xs">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>{activePlanDef.name}</span>
                <span className="text-slate-400 font-normal">({activePlanDef.courtsLabel})</span>
              </div>
              <span className="text-emerald-400 font-semibold text-[11px]">
                {internalBillingFrequency === 'ANNUAL' ? activePlanDef.annualSubtext : activePlanDef.priceSubtext}
              </span>
            </div>
          </div>

          {/* Formulario de Registro */}
          <form onSubmit={handleSubmit} className="w-full space-y-3.5 mt-4 text-left">
            {/* Nombre del Club */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span>Nombre del Club o Complejo</span>
                <span className="text-rose-400">*</span>
              </label>
              <div className="relative flex items-center">
                <Building2 className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                <input
                  type="text"
                  autoFocus
                  value={clubName}
                  onChange={(e) => handleClubNameChange(e.target.value)}
                  placeholder="Ej: Club Pádel San Martín"
                  className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-800 bg-slate-950/70 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                  required
                />
              </div>
            </div>

            {/* Ciudad y Teléfono WhatsApp */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Ciudad / Localidad
                </label>
                <div className="relative flex items-center">
                  <MapPin className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Ej: Yerba Buena, Tucumán"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-800 bg-slate-950/70 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-300">
                  Teléfono de WhatsApp
                </label>
                <div className="relative flex items-center">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="Ej: +54 9 381 456-7890"
                    className="w-full h-11 pl-10 pr-3.5 rounded-xl border border-slate-800 bg-slate-950/70 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                  />
                </div>
              </div>
            </div>

            {/* Email Administrativo */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <span>Usuario de Acceso</span>
                  <span className="text-rose-400">*</span>
                </label>
                <span className="text-[10px] text-slate-400">
                  Panel administrativo
                </span>
              </div>
              <div className="relative flex items-center w-full h-11 rounded-xl border border-slate-800 bg-slate-950/70 overflow-hidden focus-within:border-emerald-500/80 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all">
                <div className="pl-3.5 pr-2 flex items-center pointer-events-none">
                  <Mail className="w-4 h-4 text-slate-500" />
                </div>
                <input
                  type="text"
                  value={emailPrefix}
                  onChange={(e) => {
                    const raw = e.target.value.toLowerCase().split('@')[0]
                    setEmailPrefix(raw.replace(/[^a-z0-9._-]/g, ''))
                  }}
                  placeholder="nombreclub"
                  className="flex-1 min-w-0 bg-transparent py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none font-mono lowercase"
                  required
                />
                <div className="px-3.5 h-full flex items-center text-xs font-bold text-emerald-400 bg-emerald-500/10 border-l border-slate-800 font-mono select-none">
                  @club.com
                </div>
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                <span>Ingresarás con:</span>
                <span className="text-emerald-400 font-mono font-semibold">
                  {emailPrefix.trim() ? `${emailPrefix.trim()}@club.com` : 'tuclub@club.com'}
                </span>
              </p>
            </div>

            {/* Contraseña con Show/Hide toggle */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <span>Contraseña</span>
                <span className="text-rose-400">*</span>
              </label>
              <div className="relative flex items-center">
                <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 pointer-events-none" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="w-full h-11 pl-10 pr-10 rounded-xl border border-slate-800 bg-slate-950/70 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-emerald-500/80 focus:ring-1 focus:ring-emerald-500/30 transition-all"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 p-1 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Selector de Deportes disponibles */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-300 block">
                Deportes en tu complejo:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SPORTS_OPTIONS.map((sport) => {
                  const isSelected = selectedSports.includes(sport.id)
                  return (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => toggleSport(sport.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-slate-950 text-slate-300 border-slate-800 hover:border-slate-700 hover:text-white'
                      }`}
                    >
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-white shrink-0" />
                      ) : (
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0" />
                      )}
                      <span>{sport.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Error si existe */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                {errorMessage}
              </div>
            )}

            {/* Botón Sumar Club */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl bg-linear-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 active:scale-[0.99] text-white font-extrabold text-sm sm:text-base shadow-lg shadow-emerald-950/40 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 mt-4"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Creando tu club...</span>
                </>
              ) : (
                <>
                  <span>Sumar mi club</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Micro-anclajes de confianza */}
            <div className="flex items-center justify-center gap-3 text-[11px] text-slate-400 pt-1 select-none flex-wrap">
              <span className="inline-flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>15 días de prueba gratis</span>
              </span>
              <span>•</span>
              <span>Sin costos de alta</span>
              <span>•</span>
              <span>Cancelás cuando quieras</span>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
