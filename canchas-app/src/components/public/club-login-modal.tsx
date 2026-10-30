'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Building2,
  ArrowRight
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { CancharClubIcon } from '@/components/shared/canchar-club-logo'
import { loginWithEmail } from '@/actions/auth.actions'

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

    const cleanEmail = email.trim().toLowerCase()
    const finalEmail = cleanEmail.includes('@') ? cleanEmail : `${cleanEmail}@club.com`

    const formData = new FormData()
    formData.append('email', finalEmail)
    formData.append('password', password.trim())

    try {
      const res = await loginWithEmail(formData)
      if (res && !res.success) {
        setErrorMessage(res.error || 'Credenciales incorrectas.')
        setIsLoading(false)
      }
    } catch {
      // Redirección gestionada por el servidor
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[92dvh] overflow-y-auto w-[95vw] sm:w-full p-6 sm:p-8 bg-white dark:bg-[#0b101d] border border-slate-200/90 dark:border-slate-800/90 rounded-[28px] shadow-2xl transition-all">
        <DialogHeader className="sr-only">
          <DialogTitle>Acceso Clubes - CancharClub</DialogTitle>
          <DialogDescription>
            Panel de gestión del club para administrar turnos, canchas y cobros.
          </DialogDescription>
        </DialogHeader>

        <div className="w-full flex flex-col items-center text-center">
          
          {/* Badge e Isotipo oficial CancharClub con halo atlético */}
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 dark:bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center mb-3.5 shadow-md shadow-emerald-500/10 group-hover:scale-105 transition-transform duration-300">
            <CancharClubIcon className="w-12 h-12 drop-shadow-md" />
          </div>

          {/* Título de Marca Oficial y Subtítulo */}
          <h2 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center justify-center gap-1">
            <span>Canchar</span>
            <span className="text-emerald-500 font-black">Club</span>
          </h2>

          <div className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-slate-600 dark:text-slate-300 text-xs font-semibold">
            <Building2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>Panel de Gestión y Administración</span>
          </div>

          {/* Formulario de Login */}
          <form onSubmit={handleSubmit} className="w-full space-y-4 mt-6 text-left">
            
            {/* Campo: Usuario / Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                Email o Usuario de acceso
              </label>
              <div className="relative flex items-center">
                <input
                  type="text"
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value.toLowerCase().replace(/[^a-z0-9._@-]/g, ''))}
                  placeholder="nombre@club.com"
                  className="w-full h-12 pl-4 pr-28 rounded-xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/80 text-slate-900 dark:text-white placeholder:text-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 focus:bg-white dark:focus:bg-slate-950 transition-all font-mono"
                  required
                />
                {!email.includes('@') && (
                  <div className="absolute right-2 px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold text-xs select-none border border-emerald-200 dark:border-emerald-500/20 font-mono pointer-events-none">
                    @club.com
                  </div>
                )}
              </div>
            </div>

            {/* Campo: Contraseña */}
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
            {errorMessage && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-rose-700 dark:text-rose-400 text-xs font-medium">
                {errorMessage}
              </div>
            )}

            {/* Botón Entrar (Verde Esmeralda CancharClub con sombra deportiva) */}
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

          {/* Enlace para registrar / sumar club */}
          <div className="pt-5 text-xs sm:text-sm text-slate-500 dark:text-slate-400 text-center flex items-center justify-center gap-1.5">
            <span>¿Sos dueño de un club?</span>
            {onOpenRegister ? (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false)
                  onOpenRegister()
                }}
                className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                Sumá tu club →
              </button>
            ) : (
              <Link
                href="/sumar-club"
                onClick={() => onOpenChange(false)}
                className="font-bold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1 cursor-pointer transition-colors"
              >
                Sumá tu club →
              </Link>
            )}
          </div>

          {/* Indicador de seguridad */}
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 w-full flex items-center justify-center gap-1.5 text-[11px] text-slate-400 dark:text-slate-500">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-500" />
            <span>Acceso encriptado y seguro con aislamiento multi-tenant</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
