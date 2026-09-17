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
import { Badge } from '@/components/ui/badge'
import { TrendingUp, ArrowRight, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react'
import { formatARS } from '@/lib/utils'
import { applyBulkInflationPriceAdjustment } from '@/actions/club.actions'
import { toast } from 'sonner'

interface PriceRulePreview {
  id: string
  name: string
  price_ars: number
  deposit_pct: number
}

interface InflationAdjustModalProps {
  isOpen: boolean
  onClose: () => void
  currentRules: PriceRulePreview[]
  tenantId?: string
  onSuccess?: (updatedRules: PriceRulePreview[]) => void
}

export function InflationAdjustModal({
  isOpen,
  onClose,
  currentRules,
  tenantId,
  onSuccess,
}: InflationAdjustModalProps) {
  const [percentage, setPercentage] = useState<number>(15)
  const [roundingStep, setRoundingStep] = useState<number>(500)
  const [isApplying, setIsApplying] = useState(false)

  const quickPercentages = [10, 15, 20, 25, 30]

  const calculateNewPrice = (price: number) => {
    const raw = price * (1 + percentage / 100)
    return Math.round(raw / roundingStep) * roundingStep
  }

  const handleApply = async () => {
    if (percentage <= 0) {
      toast.error('Ingresá un porcentaje de aumento válido')
      return
    }

    if (!tenantId) {
      toast.error('No se pudo determinar el club activo')
      return
    }

    setIsApplying(true)
    try {
      const res = await applyBulkInflationPriceAdjustment(
        tenantId,
        percentage,
        roundingStep
      )

      if (res.success) {
        toast.success('¡Precios actualizados con éxito!', {
          description: `Se aplicó un aumento promedio de +${percentage}% a todas las tarifas del club.`
        })

        const updated = currentRules.map(r => ({
          ...r,
          price_ars: calculateNewPrice(r.price_ars)
        }))
        onSuccess?.(updated)
        onClose()
      }
    } catch {
      toast.error('Error al aplicar aumento masivo')
    } finally {
      setIsApplying(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[540px]">
        <DialogHeader>
          <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-1">
            <TrendingUp className="w-4 h-4" />
            Ajuste Masivo por Inflación (3C)
          </div>
          <DialogTitle className="text-xl font-bold text-white">
            Actualización General de Precios
          </DialogTitle>
          <DialogDescription className="text-xs text-slate-400">
            Aumentá todas tus tarifas en un porcentaje determinado con redondeo automático a múltiplos de $500 o $1.000 para evitar cambio chico.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2 text-xs">
          {/* Controles de Porcentaje y Redondeo */}
          <div className="p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-3">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <Label htmlFor="pct" className="text-slate-300 font-semibold text-xs">
                  Porcentaje de aumento (%)
                </Label>
                <div className="flex items-center gap-1.5">
                  {quickPercentages.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPercentage(p)}
                      className={`px-2 py-0.5 rounded-lg text-[11px] font-bold transition-all ${
                        percentage === p
                          ? 'bg-emerald-600 text-white shadow'
                          : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      +{p}%
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <Input
                  id="pct"
                  type="number"
                  min="1"
                  max="200"
                  value={percentage}
                  onChange={(e) => setPercentage(Number(e.target.value))}
                  className="h-10 text-sm font-bold text-emerald-400 bg-slate-900 border-slate-700 pl-8"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 font-bold text-slate-500 text-sm">
                  %
                </span>
              </div>
            </div>

            <div>
              <Label className="text-slate-300 font-semibold text-xs block mb-1.5">
                Redondear precios resultantes a:
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: 'A $100', value: 100 },
                  { label: 'A $500 (Típico)', value: 500 },
                  { label: 'A $1.000', value: 1000 },
                ].map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    onClick={() => setRoundingStep(r.value)}
                    className={`py-1.5 px-2 rounded-xl text-center border text-[11px] font-semibold transition-all ${
                      roundingStep === r.value
                        ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300 font-bold'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Vista Previa de Cambios */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Vista previa de impacto ({currentRules.length} tarifas)</span>
              <span className="text-emerald-400 font-mono">+{percentage}%</span>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {currentRules.map((rule) => {
                const newPrice = calculateNewPrice(rule.price_ars)
                const diff = newPrice - rule.price_ars
                const newDeposit = Math.round((newPrice * rule.deposit_pct) / 100)

                return (
                  <div
                    key={rule.id}
                    className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-semibold text-slate-200">{rule.name}</div>
                      <div className="text-[11px] text-slate-500">Seña ({rule.deposit_pct}%): {formatARS(newDeposit)}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="text-slate-400 line-through font-mono">
                        {formatARS(rule.price_ars)}
                      </span>
                      <ArrowRight className="w-3.5 h-3.5 text-emerald-500" />
                      <span className="font-black text-emerald-400 font-mono text-sm">
                        {formatARS(newPrice)}
                      </span>
                      <Badge className="bg-emerald-500/10 text-emerald-400 text-[10px] px-1.5 py-0">
                        +{formatARS(diff)}
                      </Badge>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onClose}
          >
            Cancelar
          </Button>

          <Button
            onClick={handleApply}
            disabled={isApplying}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 text-xs rounded-xl shadow-lg shadow-emerald-950/40"
          >
            {isApplying ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Aplicar Aumento a Todas las Canchas</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
