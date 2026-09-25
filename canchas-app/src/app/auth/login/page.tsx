'use client'

import { useState, useEffect, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  User,
  ArrowLeft,
  Loader2,
  ShieldAlert
} from 'lucide-react'
import { ThemeToggle } from '@/components/shared/theme-toggle'
import { loginWithEmail, clearAuthCookies } from '@/actions/auth.actions'
import { createClient } from '@/lib/supabase/client'

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

  // Al cargar la pantalla de login, purgar cualquier sesión o cookie anterior
  // para garantizar aislamiento total y evitar que credenciales inválidas abran otro club.
  useEffect(() => {
    try {
      clearAuthCookies()
      const supabase = createClient()
      supabase.auth.signOut().catch(() => {})
    } catch {}
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    const cleanEmail = emailPrefix.trim().toLowerCase()
    const fullEmail = cleanEmail.includes('@') ? cleanEmail : `${cleanEmail}@club.com`
    const cleanPassword = password.trim()

    if (!cleanEmail || !cleanPassword) {
      setErrorMessage('Por favor completá tu email y contraseña.')
      return
    }

    setIsLoading(true)

    const formData = new FormData()
    formData.append('email', fullEmail)
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
    <div className="min-h-screen bg-[#f7f7f8] dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col items-center justify-between p-4 sm:p-6 transition-colors duration-200">
      {/* Barra superior con botón volver y alternador de tema */}
      <div className="w-full max-w-sm flex items-center justify-between pt-2 pb-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Volver al inicio</span>
        </Link>
        <ThemeToggle />
      </div>

      {/* Tarjeta Central */}
      <main className="w-full max-w-sm my-auto flex flex-col items-center text-center animate-fade-in">
        {/* Ícono de usuario con fondo suave lavanda / violeta */}
        <div className="w-14 h-14 rounded-2xl bg-[#eeeffe] dark:bg-indigo-950/70 border border-indigo-100/60 dark:border-indigo-900/50 flex items-center justify-center mb-3 shadow-xs">
          <User className="w-7 h-7 text-[#4f46e5] dark:text-indigo-400 stroke-[1.8]" />
        </div>

        {/* Título y Subtítulo */}
        <h1 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
          Canchar Club
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-normal">
          Panel de gestión del club
        </p>

        {/* Formulario de Login */}
        <form onSubmit={handleSubmit} className="w-full space-y-4 mt-8 text-left">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                Email de administración
              </label>
              <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold font-mono">
                @club.com
              </span>
            </div>
            <div className="relative flex items-center">
              <input
                type="text"
                autoFocus
                value={emailPrefix}
                onChange={(e) => {
                  const cleaned = e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, '')
                  setEmailPrefix(cleaned)
                }}
                placeholder="tuclub"
                className="w-full h-12 pl-4 pr-28 rounded-xl sm:rounded-2xl border border-stone-200 dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#5046e5] focus:border-transparent transition-all font-mono"
                required
              />
              <div className="absolute right-2 px-2.5 py-1.5 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-xs select-none border border-indigo-500/20 font-mono pointer-events-none">
                @club.com
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                Contraseña
              </label>
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium"
              >
                {showPassword ? 'Ocultar' : 'Ver'}
              </button>
            </div>
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full h-12 px-4 rounded-xl sm:rounded-2xl border border-stone-200 dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#5046e5] focus:border-transparent transition-all"
              required
            />
          </div>

          {/* Mensaje de Error */}
          {displayError && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-rose-500" />
              <span>{displayError}</span>
            </div>
          )}

          {/* Botón Entrar */}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-xl sm:rounded-2xl bg-[#5046e5] hover:bg-[#4338ca] active:scale-[0.99] text-white font-bold text-base shadow-sm transition-all cursor-pointer flex items-center justify-center gap-2 disabled:opacity-60 mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Ingresando...</span>
              </>
            ) : (
              <span>Entrar</span>
            )}
          </button>
        </form>

        {/* Enlace para registrar club */}
        <div className="pt-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center">
          ¿Sos dueño de un club?{' '}
          <Link
            href="/sumar-club"
            className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors"
          >
            Sumá tu club →
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-sm text-center py-2 text-[11px] text-slate-400">
        Canchar Club • Panel de gestión y administración de clubes
      </footer>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f7f7f8] dark:bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    }>
      <LoginForm />
    </Suspense>
  )
}
