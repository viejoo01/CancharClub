'use client'

import { useState, useEffect } from 'react'
import { 
  Sparkles, 
  TrendingUp, 
  Clock, 
  Zap, 
  Save, 
  Loader2,
  Sliders,
  Lock
} from 'lucide-react'
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
import { 
  getDynamicPricingSettings, 
  saveDynamicPricingSettings, 
  getOccupancyInsights,
  type DynamicPricingConfig,
  type OccupancyInsight
} from '@/actions/dynamic-pricing.actions'
import { useTenantId, useUserRole } from '@/hooks/use-tenant-id'
import { toast } from 'sonner'

interface DynamicPricingModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  tenantId?: string
}

export function DynamicPricingModal({
  open,
  onOpenChange,
  tenantId: propTenantId,
}: DynamicPricingModalProps) {
  const hookTenantId = useTenantId()
  const { isOwner } = useUserRole()
  const tenantId = propTenantId || hookTenantId || ''
  const [config, setConfig] = useState<DynamicPricingConfig>({
    enable_last_minute: true,
    last_minute_discount_pct: 25,
    last_minute_hours_threshold: 3,
    enable_happy_hour: true,
    happy_hour_discount_pct: 20,
    happy_hour_from: '12:00',
    happy_hour_to: '17:00',
    enable_peak_surge: false,
    peak_surge_pct: 15,
  })
  const [insights, setInsights] = useState<OccupancyInsight[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    let isMounted = true
    Promise.all([
      getDynamicPricingSettings(tenantId),
      getOccupancyInsights(tenantId)
    ])
      .then(([savedConfig, insightsData]) => {
        if (isMounted) {
          setConfig(savedConfig)
          setInsights(insightsData)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [open, tenantId])

  const handleSave = async () => {
    if (!isOwner) {
      toast.error('Solo el dueño del club tiene permisos para configurar tarifas dinámicas.')
      return
    }
    setSaving(true)
    try {
      const res = await saveDynamicPricingSettings(tenantId, config)
      if (res.success) {
        toast.success('¡Tarifas dinámicas y reglas inteligentes activadas!')
        onOpenChange(false)
      } else {
        toast.error(res.error || 'Error al guardar')
      }
    } catch {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl bg-slate-950 border-slate-800 text-slate-100 max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <DialogTitle className="text-white text-lg font-black flex items-center gap-2">
                Tarifas Dinámicas y Yield Management
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Ajustá precios automáticamente según ocupación real y lanzá ofertas de último momento para no dejar canchas vacías.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {!isOwner && (
          <div className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs">
            <Lock className="w-4 h-4 shrink-0 text-amber-400" />
            <span>Solo el dueño del club tiene autorización para modificar y activar reglas de tarifas dinámicas.</span>
          </div>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-purple-400" />
            <span className="text-xs">Analizando ocupación horaria del predio...</span>
          </div>
        ) : (
          <div className="space-y-6 py-2">
            {/* Análisis de Ocupación con Recomendaciones Inteligentes */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Sliders className="w-3.5 h-3.5 text-purple-400" />
                  Diagnóstico de Ocupación por Franja
                </span>
                <Badge variant="outline" className="border-purple-500/30 text-purple-300 text-[10px]">
                  IA Analytics
                </Badge>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {insights.map((ins, i) => {
                  const isHigh = ins.occupancyRate >= 80
                  const isLow = ins.occupancyRate <= 35
                  return (
                    <div 
                      key={i} 
                      className={`p-3 rounded-xl border transition-all ${
                        isHigh 
                          ? 'bg-amber-950/20 border-amber-500/30' 
                          : isLow 
                          ? 'bg-blue-950/20 border-blue-500/30' 
                          : 'bg-slate-900/60 border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-200">{ins.timeSlot}</span>
                        <span className={`text-xs font-black ${
                          isHigh ? 'text-amber-400' : isLow ? 'text-blue-400' : 'text-emerald-400'
                        }`}>
                          {ins.occupancyRate}%
                        </span>
                      </div>

                      {/* Barra de progreso */}
                      <div className="w-full bg-slate-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div 
                          className={`h-full rounded-full ${
                            isHigh ? 'bg-amber-400' : isLow ? 'bg-blue-400' : 'bg-emerald-400'
                          }`}
                          style={{ width: `${ins.occupancyRate}%` }}
                        />
                      </div>

                      <p className="text-[11px] text-slate-400 mt-2 leading-tight">
                        {ins.suggestedAction}
                      </p>

                      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                        <span className="text-slate-500">Impacto potencial:</span>
                        <span className="text-emerald-400 font-bold">{ins.estimatedRevenueImpact}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Reglas Configurables */}
            <div className="space-y-4 pt-2 border-t border-slate-800">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Reglas de Ajuste Automático
              </span>

              {/* 1. Ofertas Last-Minute */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center">
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Descuento de Último Momento (Last Minute)</h4>
                      <p className="text-[11px] text-slate-400">Oferta relámpago visible en la web para turnos que queden sin vender</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.enable_last_minute}
                    onChange={(e) => setConfig({ ...config, enable_last_minute: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-emerald-500 focus:ring-emerald-500"
                  />
                </div>

                {config.enable_last_minute && (
                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-800/60 text-xs">
                    <div>
                      <Label className="text-[11px] text-slate-400">Descuento a aplicar (%)</Label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          value={config.last_minute_discount_pct}
                          onChange={(e) => setConfig({ ...config, last_minute_discount_pct: Number(e.target.value) })}
                          className="bg-slate-950 border-slate-800 h-8 text-xs font-mono pr-7"
                        />
                        <span className="absolute right-2.5 top-2 text-slate-500 font-bold">%</span>
                      </div>
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-400">Ventana de tiempo previa (hs)</Label>
                      <div className="relative mt-1">
                        <Input
                          type="number"
                          value={config.last_minute_hours_threshold}
                          onChange={(e) => setConfig({ ...config, last_minute_hours_threshold: Number(e.target.value) })}
                          className="bg-slate-950 border-slate-800 h-8 text-xs font-mono pr-7"
                        />
                        <span className="absolute right-2.5 top-2 text-slate-500 font-bold">hs</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* 2. Happy Hour / Horario Valle */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-500/15 text-blue-400 flex items-center justify-center">
                      <Clock className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Promo Horario Valle / Siesta</h4>
                      <p className="text-[11px] text-slate-400">Descuento automático en los horarios de menor concurrencia</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.enable_happy_hour}
                    onChange={(e) => setConfig({ ...config, enable_happy_hour: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-blue-500 focus:ring-blue-500"
                  />
                </div>

                {config.enable_happy_hour && (
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/60 text-xs">
                    <div>
                      <Label className="text-[11px] text-slate-400">Descuento (%)</Label>
                      <Input
                        type="number"
                        value={config.happy_hour_discount_pct}
                        onChange={(e) => setConfig({ ...config, happy_hour_discount_pct: Number(e.target.value) })}
                        className="bg-slate-950 border-slate-800 h-8 text-xs font-mono mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-400">Desde</Label>
                      <Input
                        type="time"
                        value={config.happy_hour_from}
                        onChange={(e) => setConfig({ ...config, happy_hour_from: e.target.value })}
                        className="bg-slate-950 border-slate-800 h-8 text-xs mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] text-slate-400">Hasta</Label>
                      <Input
                        type="time"
                        value={config.happy_hour_to}
                        onChange={(e) => setConfig({ ...config, happy_hour_to: e.target.value })}
                        className="bg-slate-950 border-slate-800 h-8 text-xs mt-1"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Recargo Hora Pico / Alta Demanda */}
              <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center">
                      <TrendingUp className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-white">Tarifa Dinámica Hora Pico (+%)</h4>
                      <p className="text-[11px] text-slate-400">Aumentar tarifa cuando la ocupación nocturna supere el 85%</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.enable_peak_surge}
                    onChange={(e) => setConfig({ ...config, enable_peak_surge: e.target.checked })}
                    className="w-4 h-4 rounded border-slate-700 bg-slate-950 text-amber-500 focus:ring-amber-500"
                  />
                </div>

                {config.enable_peak_surge && (
                  <div className="pt-2 border-t border-slate-800/60 text-xs">
                    <Label className="text-[11px] text-slate-400">Incremento en Hora Pico (%)</Label>
                    <Input
                      type="number"
                      value={config.peak_surge_pct}
                      onChange={(e) => setConfig({ ...config, peak_surge_pct: Number(e.target.value) })}
                      className="bg-slate-950 border-slate-800 h-8 text-xs font-mono mt-1 max-w-30"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="border-t border-slate-800/80 pt-4">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="border-slate-800 text-slate-400 text-xs"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !isOwner}
            className={`font-bold text-xs gap-1.5 shadow-lg shadow-purple-950/40 ${
              !isOwner
                ? 'bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700'
                : 'bg-purple-600 hover:bg-purple-500 text-white'
            }`}
          >
            {saving ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : !isOwner ? (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Solo Dueño del Club</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>Guardar y Activar Reglas</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
