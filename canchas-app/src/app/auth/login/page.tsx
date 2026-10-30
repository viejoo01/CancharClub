'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  ArrowLeft,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Building2,
  Eye,
  EyeOff,
  ArrowRight
} from 'lucide-react'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { CancharClubIcon } from '@/components/shared/canchar-club-logo'
import { loginWithEmail, clearAuthCookies } from '@/actions/auth.actions'

function LoginForm() {
  const searchParams = useSearchParams()
  const errorParam = searchParams.get('error')
  const initialUrlError = 
    errorParam === 'no_club_assigned' ? 'Esta cuenta no tiene ningún club asignado. Contactá a soporte.' :
    errorParam === 'club_not_found' ? 'El club asociado a esta cuenta no fue encontrado.' :
    errorParam === 'session_required' ? 'Iniciá sesión para ingresar al panel de tu club.' :
    null

  const [emailPrefix, setEmailPrefix] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const displayError = errorMessage || initialUrlError

  // Al cargar la pantalla de login, purgar cualquier sesión o cookie anterior en el servidor
  // para garantizar aislamiento total y evitar que credenciales inválidas abran otro club.
  useEffect(() => {
    try {
      void clearAuthCookies()
    } catch {}
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const cleanEmail = emailPrefix.trim().toLowerCase()
    const cleanPassword = password.trim()

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Por favor completá tu email y contraseña.')
      return
    }

    setIsLoading(true)

    const finalEmail = cleanEmail.includes('@') ? cleanEmail : `${cleanEmail}@club.com`

    const formData = new FormData()
    formData.append('email', finalEmail)
    formData.append('password', cleanPassword)

    try {
      const res = await loginWithEmail(formData)
      if (res && !res.success) {
        setErrorMessage(res.error || 'Credenciales incorrectas.')
        setIsLoading(false)
      }
    } catch (err: unknown) {
      const errorObj = err as { message?: string; digest?: string }
      if (errorObj?.message === 'NEXT_REDIRECT' || errorObj?.digest?.includes('NEXT_REDIRECT')) {
        return
      }
      setErrorMessage('Ocurrió un error al procesar el inicio de sesión.')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 transition-colors duration-200">
      
      {/* Barra superior con botón volver y alternador de tema */}
      <div className="w-full max-w-md flex items-center justify-between pt-2 pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al inicio</span>
        </Link>
        <ThemeToggle />
      </div>

      {/* Tarjeta Central */}
      <main className="w-full max-w-md my-auto p-6 sm:p-8 rounded-[28px] bg-white dark:bg-[#0b101d] border border-slate-200/90 dark:border-slate-800/90 shadow-2xl flex flex-col items-center text-center animate-fade-in transition-all">
        
        {/* Isotipo oficial con halo atlético */}
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mb-3.5 shadow-md shadow-emerald-500/10 hover:scale-105 transition-transform duration-300">
          <CancharClubIcon className="w-12 h-12 drop-shadow-md" />
        </div>

        {/* Título de Marca y Subtítulo */}
        <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center justify-center gap-1">
          <span>Canchar</span>
          <span className="text-emerald-500 font-black">Club</span>
        </h1>

        <div className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 text-xs font-semibold">
          <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span>Panel de Gestión del Club</span>
        </div>

        {/* Formulario de Login */}
        <form onSubmit={handleSubmit} className="w-full space-y-4 mt-6 text-left">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Email o Usuario de acceso
              </label>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                {emailPrefix.includes('@encargado.com') ? '@encargado.com' : '@club.com'}
              </span>
            </div>
            <div className="relative flex items-center">
              <input
                type="text"
                autoFocus
                value={emailPrefix}
                onChange={(e) => {
                  const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9._@-]/g, '')
                  setEmailPrefix(cleaned)
                }}
                placeholder="nombre@club.com"
                className="w-full h-12 pl-4 pr-28 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-950 transition-all font-mono"
                required
              />
              {!emailPrefix.includes('@') && (
                <div className="absolute right-2 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold text-xs select-none border border-emerald-200 dark:border-emerald-500/20 font-mono pointer-events-none">
                  @club.com
                </div>
              )}
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 font-semibold flex items-center gap-1 cursor-pointer transition-colors"
              >
                {showPassword ? (
                  <>
                    <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                    <span>Ocultar</span>
                  </>
                ) : (
                  <>
                    <Eye className="w-3.5 h-3.5 text-slate-400" />
                    <span>Ver</span>
                  </>
                )}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-12 px-4 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-950 transition-all"
              required
            />
          </div>

          {/* Mensaje de Error */}
          {displayError && (
            <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs flex items-start gap-2 font-medium">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{displayError}</span>
            </div>
          )}

          {/* Botón Entrar */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-xl sm:rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.99] text-white font-extrabold text-base shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 mt-3"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Ingresando al panel...</span>
              </>
            ) : (
              <>
                <span>Entrar al Club</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Enlace para registrar club */}
        <div className="pt-5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center flex items-center justify-center gap-1.5">
          <span>¿Sos dueño de un club?</span>
          <Link
            href="/sumar-club"
            className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            Sumá tu club →
          </Link>
        </div>

        {/* Indicador de seguridad */}
        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
          <span>Acceso encriptado y seguro con aislamiento multi-tenant</span>
        </div>
      </main>

      {/* Footer copyright */}
      <footer className="w-full max-w-sm text-center py-4 text-xs text-slate-400 dark:text-slate-500">
        <p>© 2026 CancharClub. Todos los derechos reservados.</p>
      </footer>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-50 dark:bg-[#070b14] flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  )
}
