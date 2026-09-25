'use client'

import { useState } from 'react'
import {
  KeyRound,
  Eye,
  EyeOff,
  Dices,
  Copy,
  Check,
  MessageCircle,
  Loader2,
  X,
  ShieldCheck,
  UserCheck,
} from 'lucide-react'
import { updateStaffPassword, type StaffMember } from '@/actions/staff.actions'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

interface ResetStaffPasswordModalProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  member: StaffMember | null
  tenantId: string
  onSuccess?: () => void
}

export function ResetStaffPasswordModal({
  isOpen,
  onOpenChange,
  member,
  tenantId,
  onSuccess,
}: ResetStaffPasswordModalProps) {
  const [newPassword, setNewPassword] = useState('')
  const [showPassword, setShowPassword] = useState(true)
  const [loading, setLoading] = useState(false)
  const [copied, setCopied] = useState(false)
  const [savedPassword, setSavedPassword] = useState<string | null>(null)

  if (!isOpen || !member) return null

  const handleGenerate = () => {
    const randomCode = `Club${Math.floor(100000 + Math.random() * 900000)}`
    setNewPassword(randomCode)
    setShowPassword(true)
  }

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    toast.success('Copiado al portapapeles')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const clean = newPassword.trim()
    if (clean.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres.')
      return
    }

    setLoading(true)
    try {
      const res = await updateStaffPassword({
        tenantId,
        staffProfileId: member.id,
        newPassword: clean,
      })

      if (res.success) {
        setSavedPassword(clean)
        toast.success(`Contraseña de ${member.full_name} actualizada`)
        onSuccess?.()
      } else {
        toast.error(res.error || 'Error al actualizar contraseña')
      }
    } catch {
      toast.error('Ocurrió un error inesperado al actualizar la contraseña')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (loading) return
    setNewPassword('')
    setSavedPassword(null)
    onOpenChange(false)
  }

  const isAdmin = member.role === 'TENANT_ADMIN'
  const waMessage = savedPassword
    ? `¡Hola ${member.full_name}! Tu contraseña para acceder al sistema de CancharClub ha sido actualizada a: *${savedPassword}*\n\nPodés ingresar directamente en: https://cancharclub.com.ar/dashboard`
    : ''

  const waUrl = member.phone && savedPassword
    ? `https://wa.me/${member.phone.replace(/\D/g, '')}?text=${encodeURIComponent(waMessage)}`
    : ''

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Cabecera */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                Contraseña de Colaborador
              </h2>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-xs text-slate-300 font-medium truncate max-w-44">
                  {member.full_name}
                </span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border flex items-center gap-1 ${
                  isAdmin 
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                    : 'bg-sky-500/15 text-sky-400 border-sky-500/30'
                }`}>
                  {isAdmin ? <ShieldCheck className="w-3 h-3" /> : <UserCheck className="w-3 h-3" />}
                  <span>{isAdmin ? 'Administrador' : 'Encargado'}</span>
                </span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            disabled={loading}
            className="w-8 h-8 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Contenido / Pantalla de éxito */}
        {savedPassword ? (
          <div className="p-5 space-y-4">
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                <Check className="w-5 h-5" />
              </div>
              <p className="text-sm font-bold text-white">
                ¡Contraseña asignada con éxito!
              </p>
              <p className="text-xs text-slate-300">
                La nueva clave de acceso de <strong>{member.full_name}</strong> es:
              </p>
              <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between font-mono text-base font-bold text-emerald-400">
                <span>{savedPassword}</span>
                <button
                  type="button"
                  onClick={() => handleCopy(savedPassword)}
                  className="p-1.5 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer"
                  title="Copiar contraseña"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Acciones para compartir */}
            <div className="space-y-2">
              {waUrl ? (
                <a
                  href={waUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors cursor-pointer shadow-md shadow-emerald-950/40"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Enviar datos de acceso por WhatsApp</span>
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() => handleCopy(`Hola ${member.full_name}, tu nueva clave de CancharClub es: ${savedPassword}`)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition-colors cursor-pointer border border-slate-700"
                >
                  <Copy className="w-4 h-4" />
                  <span>Copiar mensaje para enviar</span>
                </button>
              )}

              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                className="w-full border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cerrar
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-5 space-y-4">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider">
                Nueva Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Mínimo 6 caracteres"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 pr-10 bg-slate-800/80 border border-slate-700 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-hidden focus:border-amber-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Botón para generar aleatoria */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={handleGenerate}
                className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 font-medium transition-colors cursor-pointer py-1"
              >
                <Dices className="w-4 h-4" />
                <span>Generar clave segura aleatoria</span>
              </button>
            </div>

            <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-800">
              <Button
                type="button"
                variant="outline"
                onClick={handleClose}
                disabled={loading}
                className="border-slate-700 text-slate-300 hover:bg-slate-800 cursor-pointer"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading || newPassword.trim().length < 6}
                className="bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold cursor-pointer shadow-md shadow-amber-950/40"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Guardando...
                  </>
                ) : (
                  'Guardar Contraseña'
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
