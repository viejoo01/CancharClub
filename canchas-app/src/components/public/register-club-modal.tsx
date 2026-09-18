'use client'

import { useState } from 'react'
import {
  Building2,
  Loader2,
  ArrowRight
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { registerClub } from '@/actions/auth.actions'
import { toast } from 'sonner'

interface RegisterClubModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SPORTS_OPTIONS = [
  { id: 'PADEL', label: 'Pádel', icon: '🎾' },
  { id: 'FUTBOL', label: 'Fútbol', icon: '⚽' },
  { id: 'TENIS', label: 'Tenis', icon: '🎾' },
  { id: 'BASQUET', label: 'Básquet', icon: '🏀' },
]

export function RegisterClubModal({ open, onOpenChange }: RegisterClubModalProps) {
  const [clubName, setClubName] = useState('')
  const [city, setCity] = useState('San Miguel de Tucumán')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [selectedSports, setSelectedSports] = useState<string[]>(['PADEL'])
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const toggleSport = (sportId: string) => {
    setSelectedSports(prev =>
      prev.includes(sportId)
        ? prev.length > 1 ? prev.filter(s => s !== sportId) : prev
        : [...prev, sportId]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!clubName.trim() || !email.trim() || !password.trim()) {
      setErrorMessage('Por favor completá todos los campos requeridos.')
      return
    }

    setIsLoading(true)


    const formData = new FormData()
    formData.append('clubName', clubName)
    formData.append('city', city)
    formData.append('email', email)
    formData.append('phone', phone)
    formData.append('password', password)
    formData.append('sports', JSON.stringify(selectedSports))

    try {
      const res = await registerClub(formData)
      if (res && !res.success) {
        setErrorMessage(res.error || 'Ocurrió un error al registrar el club.')
        setIsLoading(false)
      } else {
        toast.success('¡Club registrado exitosamente!')
        window.location.href = '/dashboard'
      }
    } catch {
      // Redirección de Next.js
      window.location.href = '/dashboard'
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg w-[95vw] sm:w-full p-5 sm:p-7 bg-[#f7f7f8] dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-[28px] shadow-2xl transition-all max-h-[90dvh] overflow-y-auto">
        <DialogHeader className="sr-only">
          <DialogTitle>Sumá tu club - Canchar Club</DialogTitle>
          <DialogDescription>
            Digitalizá tu complejo deportivo, turnos fijos, cobros online y reservas.
          </DialogDescription>
        </DialogHeader>

        <div className="w-full flex flex-col items-center text-center">
          {/* Ícono de Club con fondo verde menta / esmeralda suave */}
          <div className="w-14 h-14 rounded-2xl bg-emerald-100/70 dark:bg-emerald-950/70 border border-emerald-200/60 dark:border-emerald-900/50 flex items-center justify-center mb-3 shadow-xs">
            <Building2 className="w-7 h-7 text-emerald-600 dark:text-emerald-400 stroke-[1.8]" />
          </div>

          {/* Título y Subtítulo */}
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Sumá tu club
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-normal max-w-xs">
            Comenzá a gestionar tus canchas, turnos y cobros con Canchar Club
          </p>

          {/* Formulario de Registro */}
          <form onSubmit={handleSubmit} className="w-full space-y-3.5 mt-6 text-left">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Nombre del Club o Complejo
              </label>
              <input
                type="text"
                autoFocus
                value={clubName}
                onChange={(e) => setClubName(e.target.value)}
                placeholder="Ej: Club Pádel San Martín"
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Ciudad / Localidad
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ej: Yerba Buena, Tucumán"
                  className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  Teléfono de WhatsApp
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Ej: +54 9 381 456-7890"
                  className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Email de administración
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@tupredio.com"
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                Contraseña
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full h-11 px-3.5 rounded-xl border border-stone-200 dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Selector de Deportes disponibles */}
            <div className="space-y-1.5 pt-1">
              <label className="text-xs font-semibold text-slate-800 dark:text-slate-200 block">
                Deportes en tu complejo:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SPORTS_OPTIONS.map(sport => {
                  const isSelected = selectedSports.includes(sport.id)
                  return (
                    <button
                      key={sport.id}
                      type="button"
                      onClick={() => toggleSport(sport.id)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 border ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                          : 'bg-white dark:bg-slate-950 text-slate-600 dark:text-slate-300 border-stone-200 dark:border-slate-800 hover:border-slate-300'
                      }`}
                    >
                      <span>{sport.icon}</span>
                      <span>{sport.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Error si existe */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                {errorMessage}
              </div>
            )}

            {/* Botón Sumar Club */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-12 rounded-xl sm:rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-bold text-base shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 mt-3"
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
          </form>

        </div>
      </DialogContent>
    </Dialog>
  )
}
