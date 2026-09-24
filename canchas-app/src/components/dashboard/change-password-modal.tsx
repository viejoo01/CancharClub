'use client'

import { useState } from 'react'
import {
  KeyRound,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  ShieldCheck,
  Lock,
} from 'lucide-react'
import { changeOwnPassword } from '@/actions/auth.actions'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface ChangePasswordModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  userName?: string
  userRole?: string
}

export function ChangePasswordModal({
  isOpen,
  onOpenChange,
  userName = 'Usuario',
  userRole = 'TENANT_ADMIN',
}: ChangePasswordModalProps) {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [showCurrent, setShowCurrent] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)

  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  if (!isOpen) return null

  const isLengthValid = newPassword.trim().length >= 6
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword

  const isStaff = userRole === 'TENANT_STAFF'
  const roleLabel = isStaff ? 'Encargado' : 'Dueño del Club'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (!isLengthValid) {
      setErrorMsg('La nueva contraseña debe tener al menos 6 caracteres.')
      return
    }

    if (!passwordsMatch) {
      setErrorMsg('Las contraseñas no coinciden. Por favor verificalas.')
      return
    }

    setLoading(true)
    try {
      const res = await changeOwnPassword({
        currentPassword: currentPassword.trim() || undefined,
        newPassword: newPassword.trim(),
      })

      if (res.success) {
        toast.success('¡Contraseña actualizada con éxito!', {
          description: 'Tu nueva clave quedó guardada para tus próximos inicios de sesión.',
        })
        setCurrentPassword('')
        setNewPassword('')
        setConfirmPassword('')
        onOpenChange(false)
      } else {
        setErrorMsg(res.error || 'No se pudo actualizar la contraseña.')
        toast.error(res.error || 'Error al actualizar contraseña')
      }
    } catch {
      setErrorMsg('Ocurrió un error inesperado al conectar con el servidor.')
      toast.error('Error al actualizar contraseña')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setErrorMsg(null)
    setCurrentPassword('')
    setNewPassword('')
    setConfirmPassword('')
    onOpenChange(false)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="change-password-title"
      >
        {/* Cabecera */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 id="change-password-title" className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>Cambiar Contraseña</span>
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-400 font-medium truncate max-w-44">
                  {userName}
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                  {roleLabel}
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
            aria-label="Cerrar modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-2.5 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Contraseña Actual */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                <span>Contraseña Actual</span>
              </label>
              <span className="text-[11px] text-slate-500">(Opcional si es primer cambio)</span>
            </div>
            <div className="relative">
              <input
                type={showCurrent ? 'text' : 'password'}
                placeholder="Ingresá tu contraseña actual"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500 focus:ring-1 focus:ring-amber-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                aria-label={showCurrent ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Nueva Contraseña */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>Nueva Contraseña</span>
            </label>
            <div className="relative">
              <input
                type={showNew ? 'text' : 'password'}
                placeholder="Mínimo 6 caracteres"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                aria-label={showNew ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirmar Nueva Contraseña */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5 text-teal-400" />
              <span>Confirmar Nueva Contraseña</span>
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="Repetí la nueva contraseña"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                required
                className="w-full px-3.5 py-2.5 pr-10 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowConfirm(!showConfirm)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                aria-label={showConfirm ? 'Ocultar contraseña' : 'Ver contraseña'}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Indicadores de Requisitos */}
          <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1.5 text-xs">
            <div className="flex items-center gap-2">
              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                isLengthValid ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500'
              }`}>
                ✓
              </div>
              <span className={isLengthValid ? 'text-emerald-400' : 'text-slate-400'}>
                Al menos 6 caracteres
              </span>
            </div>

            <div className="flex items-center gap-2">
              <div className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                passwordsMatch ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800 text-slate-500'
              }`}>
                ✓
              </div>
              <span className={passwordsMatch ? 'text-emerald-400' : 'text-slate-400'}>
                Ambas contraseñas coinciden
              </span>
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
            <Button
              type="button"
              variant="outline"
              onClick={handleClose}
              disabled={loading}
              className="border-slate-700 hover:bg-slate-800 text-slate-300 cursor-pointer"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={loading || !isLengthValid || !passwordsMatch}
              className="bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-semibold cursor-pointer shadow-md shadow-emerald-950/40"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Actualizando...
                </>
              ) : (
                'Guardar Nueva Contraseña'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
