'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  Trophy,
  Building2,
  CheckCircle2,
  Sparkles,
  Smartphone,
  ShieldCheck,
  Calendar,
  Layers,
  ArrowRight,
  Loader2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CancharClubIcon } from '@/components/shared/canchar-club-logo'
import { createClient } from '@/lib/supabase/client'

function AppDispatcherContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const forcedRole = searchParams.get('role') as 'player' | 'club' | null
  const isSwitching = searchParams.get('switch') === 'true' || searchParams.get('switch') === '1'

  const [isLoading, setIsLoading] = useState(true)
  const [selectedRole, setSelectedRole] = useState<'player' | 'club'>('player')
  const [rememberChoice, setRememberChoice] = useState(true)

  useEffect(() => {
    let isMounted = true

    async function evaluateNavigation() {
      // Si el usuario solicitó explícitamente cambiar de rol, no redirigir automáticamente
      if (isSwitching) {
        if (isMounted) setIsLoading(false)
        return
      }

      // 1. Si vino con query param forzado (?role=player o ?role=club), aplicar y redirigir
      if (forcedRole === 'player') {
        localStorage.setItem('canchar_user_role', 'player')
        document.cookie = 'canchar_user_role=player; path=/; max-age=31536000; SameSite=Lax'
        router.replace('/')
        return
      }

      if (forcedRole === 'club') {
        localStorage.setItem('canchar_user_role', 'club')
        document.cookie = 'canchar_user_role=club; path=/; max-age=31536000; SameSite=Lax'
        router.replace('/dashboard')
        return
      }

      // 2. Verificar si hay un rol previo guardado en este dispositivo
      const savedRole = localStorage.getItem('canchar_user_role')

      // 3. Verificar si el usuario ya tiene sesión de club activa en Supabase
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()

        if (session?.user) {
          // Si tiene sesión activa de club y no eligió explícitamente ser jugador, va a su dashboard
          if (savedRole !== 'player') {
            router.replace('/dashboard')
            return
          }
        }
      } catch {
        // Fallback silencioso si falla el cliente Supabase
      }

      // 4. Si tiene rol guardado de Jugador
      if (savedRole === 'player') {
        router.replace('/')
        return
      }

      // 5. Si tiene rol guardado de Club
      if (savedRole === 'club') {
        router.replace('/dashboard')
        return
      }

      // Si no hay rol configurado, mostrar el selector interactivo
      if (isMounted) {
        setIsLoading(false)
      }
    }

    evaluateNavigation()

    return () => {
      isMounted = false
    }
  }, [forcedRole, isSwitching, router])

  const handleApplyRole = (role: 'player' | 'club') => {
    if (rememberChoice) {
      localStorage.setItem('canchar_user_role', role)
      document.cookie = `canchar_user_role=${role}; path=/; max-age=31536000; SameSite=Lax`
    } else {
      localStorage.removeItem('canchar_user_role')
      document.cookie = `canchar_user_role=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT`
    }

    if (role === 'player') {
      router.replace('/')
    } else {
      router.replace('/dashboard')
    }
  }

  if (isLoading) {
    return (
      <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
        <div className="flex flex-col items-center space-y-4 text-center animate-in fade-in duration-300">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-2xl shadow-emerald-950/60 animate-pulse">
            <CancharClubIcon className="w-10 h-10 text-white" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-white">CancharClub</h2>
            <p className="text-xs text-slate-400 mt-1 flex items-center justify-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-400" />
              <span>Iniciando aplicación...</span>
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 md:p-8">
      {/* Background Glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 max-w-xl mx-auto w-full pt-4 pb-2 text-center">
        <div className="inline-flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-900/90 border border-emerald-500/30 text-emerald-400 text-xs font-semibold mb-4 shadow-lg shadow-emerald-950/40">
          <Smartphone className="w-3.5 h-3.5" />
          <span>Acceso Directo Personalizado</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
          ¿Cómo vas a usar <span className="text-emerald-400">CancharClub</span>?
        </h1>
        <p className="text-xs sm:text-sm text-slate-400 mt-2 max-w-md mx-auto">
          Seleccioná tu perfil para abrir directamente la pantalla que necesitás cada vez que uses la app.
        </p>
      </header>

      {/* Selector Cards */}
      <div className="relative z-10 max-w-xl mx-auto w-full my-6 space-y-4">
        {/* Card: Soy Jugador */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedRole('player')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedRole('player') }}
          className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden text-left ${
            selectedRole === 'player'
              ? 'bg-gradient-to-br from-emerald-950/40 via-slate-900 to-slate-900 border-emerald-500/80 shadow-xl shadow-emerald-950/40 ring-1 ring-emerald-500/50'
              : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform ${
                selectedRole === 'player'
                  ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-lg shadow-emerald-950/50 scale-105'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                <Trophy className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">Soy Jugador / Deportista</h3>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 text-[10px] font-semibold">
                    Reservas
                  </Badge>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Buscar canchas de pádel, fútbol y tenis en mi zona, reservar turnos online, ver el fixture de torneos y seguir mis reservas.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Calendar className="w-3 h-3" />
                    Turnos online
                  </span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <Sparkles className="w-3 h-3" />
                    Sin cuenta obligatoria
                  </span>
                </div>
              </div>
            </div>

            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
              selectedRole === 'player'
                ? 'bg-emerald-500 border-emerald-400 text-white'
                : 'border-slate-700 bg-slate-800'
            }`}>
              {selectedRole === 'player' && <CheckCircle2 className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Card: Soy Club / Dueño */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setSelectedRole('club')}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedRole('club') }}
          className={`p-5 rounded-2xl border transition-all cursor-pointer relative overflow-hidden text-left ${
            selectedRole === 'club'
              ? 'bg-gradient-to-br from-teal-950/40 via-slate-900 to-slate-900 border-teal-500/80 shadow-xl shadow-teal-950/40 ring-1 ring-teal-500/50'
              : 'bg-slate-900/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900'
          }`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 transition-transform ${
                selectedRole === 'club'
                  ? 'bg-gradient-to-tr from-teal-600 to-sky-500 text-white shadow-lg shadow-teal-950/50 scale-105'
                  : 'bg-slate-800 text-slate-400'
              }`}>
                <Building2 className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-white">Soy Club / Administrador</h3>
                  <Badge className="bg-sky-500/20 text-sky-300 border-sky-500/30 text-[10px] font-semibold">
                    Gestión
                  </Badge>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Administrar la grilla de turnos de mi club, cobro de señas por Mercado Pago, arqueos de caja diaria, cantina y clientes.
                </p>
                <div className="flex flex-wrap items-center gap-3 pt-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 text-teal-400">
                    <Layers className="w-3 h-3" />
                    Grilla en vivo
                  </span>
                  <span className="flex items-center gap-1 text-teal-400">
                    <ShieldCheck className="w-3 h-3" />
                    Panel de control
                  </span>
                </div>
              </div>
            </div>

            <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 border transition-all ${
              selectedRole === 'club'
                ? 'bg-teal-500 border-teal-400 text-white'
                : 'border-slate-700 bg-slate-800'
            }`}>
              {selectedRole === 'club' && <CheckCircle2 className="w-4 h-4" />}
            </div>
          </div>
        </div>

        {/* Checkbox: Recordar mi elección */}
        <label className="flex items-center gap-2.5 px-2 py-1 text-xs text-slate-400 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={rememberChoice}
            onChange={(e) => setRememberChoice(e.target.checked)}
            className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-emerald-600 focus:ring-emerald-500 focus:ring-offset-slate-950"
          />
          <span>Recordar mi elección en este dispositivo</span>
        </label>
      </div>

      {/* Footer & Actions */}
      <footer className="relative z-10 max-w-xl mx-auto w-full pt-2 pb-4 space-y-3">
        <Button
          onClick={() => handleApplyRole(selectedRole)}
          className="w-full h-12 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm rounded-xl shadow-xl shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-[0.99]"
        >
          <span>
            {selectedRole === 'player' ? 'Ingresar como Jugador' : 'Ingresar a mi Club'}
          </span>
          <ArrowRight className="w-4 h-4" />
        </Button>

        <p className="text-center text-[11px] text-slate-400">
          Podés cambiar de perfil cuando quieras visitando{' '}
          <Link href="/app?switch=1" className="text-emerald-400 hover:underline font-medium">
            esta pantalla
          </Link>
          .
        </p>
      </footer>
    </main>
  )
}

export default function AppDispatcherPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 text-white">
          <div className="w-16 h-16 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-center animate-pulse">
            <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
          </div>
        </main>
      }
    >
      <AppDispatcherContent />
    </Suspense>
  )
}
