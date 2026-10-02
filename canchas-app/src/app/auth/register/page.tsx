'use client'

import { useState, Suspense } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Trophy, Mail, Lock, Phone, Building2, ArrowRight, Loader2, Sparkles, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { registerClub } from '@/actions/auth.actions'
import { SAAS_PLANS, SAAS_PLANS_LIST, type SaaSPlanId } from '@/config/saas-plans'
import { toast } from 'sonner'

const SPORTS_OPTIONS = [
  { id: 'PADEL', label: 'Pádel', icon: '🎾' },
  { id: 'FUTBOL', label: 'Fútbol', icon: '⚽' },
  { id: 'TENIS', label: 'Tenis', icon: '🎾' },
  { id: 'BASQUET', label: 'Básquet', icon: '🏀' },
]

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
          <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
        </div>
      }
    >
      <RegisterContent />
    </Suspense>
  )
}

function RegisterContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const paramPlan = searchParams.get('plan') as SaaSPlanId | null
  const initialPlan = paramPlan && ['CHICO_1', 'MEDIANO_2', 'CONSOLIDADO_3_4', 'GRANDE_5_PLUS'].includes(paramPlan)
    ? paramPlan
    : 'MEDIANO_2'

  const [selectedPlanId, setSelectedPlanId] = useState<SaaSPlanId>(initialPlan)
  const [selectedSports, setSelectedSports] = useState<string[]>(['FUTBOL', 'PADEL'])
  const [clubName, setClubName] = useState('')
  const [emailPrefix, setEmailPrefix] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)

  const activePlanDef = SAAS_PLANS[selectedPlanId] || SAAS_PLANS.MEDIANO_2

  const toggleSport = (sportId: string) => {
    setSelectedSports(prev =>
      prev.includes(sportId)
        ? (prev.length > 1 ? prev.filter(s => s !== sportId) : prev)
        : [...prev, sportId]
    )
  }

  const handleClubNameChange = (val: string) => {
    setClubName(val)
    const slug = val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '')
    setEmailPrefix(slug)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const cleanPrefix = emailPrefix.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
    
    if (!cleanPrefix) {
      toast.error('Por favor ingresá un usuario para el email de tu club.')
      return
    }

    if (selectedSports.length === 0) {
      toast.error('Por favor seleccioná al menos un deporte para tu complejo.')
      return
    }

    if (password.length < 8) {
      toast.error('La contraseña debe tener al menos 8 caracteres.')
      return
    }

    if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error('La contraseña debe contener al menos una letra y un número.')
      return
    }

    const fullEmail = `${cleanPrefix}@club.com`

    setLoading(true)

    const formData = new FormData()
    formData.append('clubName', clubName)
    formData.append('email', fullEmail)
    formData.append('phone', phone)
    formData.append('password', password)
    formData.append('planId', selectedPlanId)
    formData.append('sports', JSON.stringify(selectedSports))

    try {
      const res = await registerClub(formData)
      if (res && !res.success) {
        toast.error(res.error || 'Error al registrar el club')
        setLoading(false)
      } else {
        router.push('/onboarding/tarjeta')
      }
    } catch {
      // Manejado por redirect
      router.push('/onboarding/tarjeta')
    }
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4 py-8">
      <div className="w-full max-w-lg space-y-5">
        <div className="text-center space-y-2">
          <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 items-center justify-center shadow-xl shadow-emerald-950/50 mb-1">
            <Trophy className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
            Registrar mi Club
          </h1>
          <p className="text-xs text-slate-400">
            Comenzá a gestionar tus canchas y reservas en minutos con 15 días gratis
          </p>
        </div>

        <Card className="border-slate-800 bg-slate-900/80 shadow-2xl">
          <CardHeader className="pb-3 text-center">
            <CardTitle className="text-lg">Crear Cuenta de Club</CardTitle>
            <CardDescription className="text-xs">
              Configurá el acceso y panel exclusivo para tu club deportivo
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {/* Selector de Plan */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-emerald-500/30">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Plan SaaS según canchas:
                </span>
                <span className="text-[11px] font-bold text-emerald-400">
                  15 días 100% gratis
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {SAAS_PLANS_LIST.map((p) => {
                  const isSelected = p.id === selectedPlanId
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedPlanId(p.id)}
                      className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-md'
                          : 'bg-slate-900/60 text-slate-300 border-slate-800 hover:border-emerald-500/50'
                      }`}
                    >
                      <div className="text-xs font-bold truncate">{p.courtsLabel}</div>
                      <div className={`text-[10px] truncate ${isSelected ? 'text-emerald-100' : 'text-slate-400'}`}>
                        {p.priceTurnosLabel.split('(')[0].trim()}
                      </div>
                    </button>
                  )
                })}
              </div>

              <div className="mt-2 pt-2 border-t border-slate-800 flex items-center justify-between text-xs">
                <span className="text-slate-300 font-medium">
                  {activePlanDef.name}:
                </span>
                <span className="font-bold text-emerald-400">
                  {activePlanDef.priceSubtext}
                </span>
              </div>
            </div>

            {/* Selector de Deportes */}
            <div className="space-y-1.5">
              <Label className="text-xs text-slate-300">
                Deportes en tu complejo (seleccioná los que apliquen) *
              </Label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {SPORTS_OPTIONS.map((sport) => {
                  const isSelected = selectedSports.includes(sport.id)
                  return (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => toggleSport(sport.id)}
                      className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600/30 border-emerald-500 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <span>{sport.icon}</span>
                      <span>{sport.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div className="space-y-1.5">
                <Label htmlFor="clubName">Nombre del Club o Complejo *</Label>
                <div className="relative">
                  <Building2 className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <Input
                    id="clubName"
                    placeholder="Ej. Complejo Central Tucumán"
                    value={clubName}
                    onChange={(e) => handleClubNameChange(e.target.value)}
                    className="pl-9 bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="emailPrefix">Email Administrativo *</Label>
                  <span className="text-[10px] text-emerald-400 font-semibold font-mono">
                    @club.com
                  </span>
                </div>
                <div className="flex items-center w-full bg-slate-950 border border-slate-800 rounded-xl overflow-hidden focus-within:border-emerald-500 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all">
                  <div className="pl-3 text-slate-500 flex items-center pointer-events-none">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    id="emailPrefix"
                    type="text"
                    required
                    placeholder="nombreclub"
                    value={emailPrefix}
                    onChange={(e) => {
                      const raw = e.target.value.toLowerCase().split('@')[0]
                      setEmailPrefix(raw.replace(/[^a-z0-9._-]/g, ''))
                    }}
                    className="flex-1 min-w-0 bg-transparent px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none lowercase font-mono"
                  />
                  <div className="px-3.5 py-2.5 text-xs sm:text-sm font-semibold text-emerald-400 bg-slate-900 border-l border-slate-800 select-none whitespace-nowrap flex items-center font-mono">
                    @club.com
                  </div>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1.5">
                  <span>Con este correo ingresarás al sistema:</span>
                  <span className="text-emerald-400 font-mono font-medium">
                    {emailPrefix.trim() ? `${emailPrefix.trim()}@club.com` : 'tuclub@club.com'}
                  </span>
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="phone">Teléfono Celular (WhatsApp de Reservas) *</Label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="Ej. 3814556677"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pl-9 bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">Contraseña *</Label>
                  <span className="text-[11px] text-slate-400">Mínimo 8 caracteres</span>
                </div>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="Mínimo 8 caracteres (letras y números)"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 bg-slate-950 border-slate-800 text-white placeholder-slate-500"
                    minLength={8}
                    required
                  />
                </div>
                {password.length > 0 && (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) && (
                  <p className="text-[11px] text-amber-400">Debe contener al menos 8 caracteres con letras y números.</p>
                )}
              </div>

              <Button
                type="submit"
                disabled={loading}
                className="w-full mt-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 shadow-lg shadow-emerald-950/40 cursor-pointer h-11"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <span>Dar de Alta Club</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="text-center text-xs text-slate-400 pt-2">
              ¿Ya tenés cuenta?{' '}
              <Link href="/auth/login" className="text-emerald-400 font-semibold hover:underline">
                Iniciar sesión
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
