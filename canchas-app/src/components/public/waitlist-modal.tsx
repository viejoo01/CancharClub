'use client'

import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Clock, BellRing, CheckCircle2, Loader2, Zap } from 'lucide-react'
import { addToWaitlist } from '@/actions/waitlist.actions'
import { toast } from 'sonner'

interface WaitlistModalProps {
  isOpen: boolean
  onClose: () => void
  tenantId: string
  courtId?: string
  courtName: string
  timeSlot: string
  date: string
}

export function WaitlistModal({
  isOpen,
  onClose,
  tenantId,
  courtId,
  courtName,
  timeSlot,
  date,
}: WaitlistModalProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [loading, setLoading] = useState(false)
  const [isSuccess, setIsSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customerName || !customerPhone) {
      toast.error('Completá tu nombre y teléfono de WhatsApp')
      return
    }

    setLoading(true)
    try {
      const res = await addToWaitlist({
        tenant_id: tenantId,
        court_id: courtId,
        date,
        time_slot: timeSlot,
        customer_name: customerName,
        customer_phone: customerPhone,
      })

      if (res.success) {
        setIsSuccess(true)
        toast.success('¡Te anotaste en la lista de espera con éxito!')
      } else {
        toast.error(res.error || 'Error al anotarse')
      }
    } catch {
      toast.error('Error al procesar la solicitud')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    setIsSuccess(false)
    setCustomerName('')
    setCustomerPhone('')
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px] bg-slate-900 border-slate-800 text-slate-100 p-5">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center">
              <BellRing className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold text-white">
                Lista de Espera Automática
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Avisame si se libera este horario para reservarlo primero.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!isSuccess ? (
          <form onSubmit={handleSubmit} className="space-y-4 py-2">
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-1.5">
              <div className="flex justify-between text-slate-300">
                <span>Horario deseado:</span>
                <span className="font-bold text-emerald-400 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {timeSlot} hs ({date})
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Cancha:</span>
                <span className="font-semibold text-white">{courtName}</span>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-amber-950/30 border border-amber-500/30 text-[11px] text-amber-200/90 leading-relaxed flex items-start gap-2">
              <Zap className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
              <span>
                Si el turno actual se cancela, el sistema te enviará un WhatsApp automático con <strong>10 minutos de prioridad exclusiva</strong> para señarlo antes de volver a publicarlo.
              </span>
            </div>

            <div className="space-y-3">
              <div>
                <Label htmlFor="wlName" className="text-xs text-slate-300">Tu Nombre Completo</Label>
                <Input
                  id="wlName"
                  placeholder="Ej: Rodrigo De Paul"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs mt-1"
                  required
                />
              </div>

              <div>
                <Label htmlFor="wlPhone" className="text-xs text-slate-300">Teléfono Celular (WhatsApp)</Label>
                <Input
                  id="wlPhone"
                  placeholder="Ej: 3815554433"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-xs mt-1 font-mono"
                  required
                />
                <span className="text-[10px] text-slate-500">Recibirás la notificación de turno liberado a este número.</span>
              </div>
            </div>

            <DialogFooter className="pt-2 flex items-center justify-between">
              <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={loading}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs gap-1.5"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BellRing className="w-3.5 h-3.5" />}
                <span>Anotarme en Espera</span>
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="py-4 text-center space-y-3">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <div className="text-sm font-bold text-white">¡Anotado en Lista de Espera!</div>
            <p className="text-xs text-slate-300 max-w-xs mx-auto">
              Guardamos tus datos para las <strong>{timeSlot} hs</strong>. Si el turno se libera, te avisaremos al instante por WhatsApp.
            </p>
            <Button
              type="button"
              onClick={handleClose}
              className="w-full bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs mt-2"
            >
              Cerrar
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
