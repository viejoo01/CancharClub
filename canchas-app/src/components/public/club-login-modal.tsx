'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  User,
  X,
  Loader2,
  Lock,
  Mail,
  ArrowRight,
  Eye,
  EyeOff
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { loginWithEmail } from '@/actions/auth.actions'
import { toast } from 'sonner'

interface ClubLoginModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onOpenRegister?: () => void
}

export function ClubLoginModal({ open, onOpenChange, onOpenRegister }: ClubLoginModalProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)

    if (!email.trim() || !password.trim()) {
      setErrorMessage('Por favor completá tu email y contraseña.')
      return
    }

    setIsLoading(true)

    // Fallback rápido demostrativo para desarrollo y testing
    if (
      email === 'admin@padelcentral.com' ||
      email === 'demo@cancharclub.com' ||
      password === 'demo123456' ||
      email === 'mostrador@padelcentral.com'
    ) {
      toast.success('¡Bienvenido al Panel de Gestión!')
      window.location.href = '/dashboard'
      return
    }

    if (email === 'superadmin@cancharclub.com.ar' && password === 'superadmin123') {
      toast.success('¡Bienvenido Superadmin!')
      window.location.href = '/superadmin'
      return
    }

    const formData = new FormData()
    formData.append('email', email)
    formData.append('password', password)

    try {
      const res = await loginWithEmail(formData)
      if (res && !res.success) {
        setErrorMessage(res.error || 'Credenciales incorrectas.')
        setIsLoading(false)
      }
    } catch {
      // Redirección manejada por Next.js
    }
  }

  const fillDemoOwner = () => {
    setEmail('admin@padelcentral.com')
    setPassword('demo123456')
    setErrorMessage(null)
  }

  const fillDemoStaff = () => {
    setEmail('mostrador@padelcentral.com')
    setPassword('cajero123')
    setErrorMessage(null)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-7 bg-[#f7f7f8] dark:bg-slate-900 border border-slate-200/90 dark:border-slate-800 rounded-[28px] shadow-2xl transition-all">
        <DialogHeader className="sr-only">
          <DialogTitle>Acceso clubes - Canchar Club</DialogTitle>
          <DialogDescription>
            Panel de gestión del club para administrar turnos, canchas y cobros.
          </DialogDescription>
        </DialogHeader>

        <div className="w-full flex flex-col items-center text-center">
          {/* Ícono de usuario con fondo suave lavanda / violeta (Fiel a la captura) */}
          <div className="w-14 h-14 rounded-2xl bg-[#eeeffe] dark:bg-indigo-950/70 border border-indigo-100/60 dark:border-indigo-900/50 flex items-center justify-center mb-3 shadow-xs">
            <User className="w-7 h-7 text-[#4f46e5] dark:text-indigo-400 stroke-[1.8]" />
          </div>

          {/* Título y Subtítulo idénticos a la referencia */}
          <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
            Canchar Club
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 font-normal">
            Panel de gestión del club
          </p>

          {/* Formulario de Login */}
          <form onSubmit={handleSubmit} className="w-full space-y-4 mt-6 text-left">
            <div className="space-y-1.5">
              <label className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200">
                Email
              </label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@club.com"
                className="w-full h-12 px-4 rounded-xl sm:rounded-2xl border border-stone-200 dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#5046e5] focus:border-transparent transition-all"
                required
              />
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
                className="w-full h-12 px-4 rounded-xl sm:rounded-2xl border border-stone-200 dark:border-slate-800 bg-[#f9fafb] dark:bg-slate-950 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-[#5046e5] focus:border-transparent transition-all"
                required
              />
            </div>

            {/* Mensaje de Error */}
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 text-xs">
                {errorMessage}
              </div>
            )}

            {/* Botón Entrar (Violeta / Indigo según captura) */}
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

          {/* Accesos rápidos Demo */}
          <div className="w-full pt-4 mt-2 border-t border-slate-200/80 dark:border-slate-800 text-left space-y-2">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Accesos Demo de prueba:
            </span>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={fillDemoOwner}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-indigo-500/15 hover:text-indigo-600 dark:hover:text-indigo-400 text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition-colors border border-slate-200 dark:border-slate-700 shadow-xs"
              >
                Dueño del Predio
              </button>
              <button
                type="button"
                onClick={fillDemoStaff}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 hover:bg-emerald-500/15 hover:text-emerald-600 dark:hover:text-emerald-400 text-slate-600 dark:text-slate-300 text-[11px] font-semibold transition-colors border border-slate-200 dark:border-slate-700 shadow-xs"
              >
                Mostrador / Caja
              </button>
            </div>
          </div>

          {/* Enlace para registrar club fiel a la captura */}
          <div className="pt-4 text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center">
            ¿Sos dueño de un club?{' '}
            {onOpenRegister ? (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  onOpenRegister()
                }}
                className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                Sumá tu club →
              </button>
            ) : (
              <Link
                href="/sumar-club"
                onClick={() => onOpenChange(false)}
                className="font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                Sumá tu club →
              </Link>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
