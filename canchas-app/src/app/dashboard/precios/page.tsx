'use client'

import { useState, useEffect } from 'react'
import { Plus, Clock, Percent, ShieldCheck, Loader2, TrendingUp, Sparkles, Tag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { InflationAdjustModal } from '@/components/dashboard/inflation-adjust-modal'
import { DynamicPricingModal } from '@/components/dashboard/dynamic-pricing-modal'
import { formatARS } from '@/lib/utils'
import { createPriceRule } from '@/actions/club.actions'
import { toast } from 'sonner'
import { useTenantId } from '@/hooks/use-tenant-id'
import { createClient } from '@/lib/supabase/client'

export default function PreciosPage() {
  const tenantId = useTenantId()
  const [rules, setRules] = useState<{
    id: string; name: string; days_of_week: number[]; time_from: string; time_to: string; price_ars: number; deposit_pct: number;
  }[]>([])
  const [loadingRules, setLoadingRules] = useState(true)

  useEffect(() => {
    if (!tenantId) return
    const supabase = createClient()
    supabase
      .from('price_rules')
      .select('id, name, days_of_week, time_from, time_to, price_ars, deposit_pct')
      .eq('tenant_id', tenantId)
      .then(({ data }) => {
        if (data) {
          setRules(data)
        }
        setLoadingRules(false)
      })
  }, [tenantId])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isInflationModalOpen, setIsInflationModalOpen] = useState(false)
  const [isDynamicModalOpen, setIsDynamicModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [timeFrom, setTimeFrom] = useState('18:00')
  const [timeTo, setTimeTo] = useState('00:00')
  const [price, setPrice] = useState('14000')
  const [depositPct, setDepositPct] = useState('50')
  const [loading, setLoading] = useState(false)

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    setLoading(true)
    const newRule = {
      id: `rule-${Date.now()}`,
      name,
      days_of_week: [1, 2, 3, 4, 5],
      time_from: timeFrom,
      time_to: timeTo,
      price_ars: Number(price),
      deposit_pct: Number(depositPct),
    }

    setRules(prev => [...prev, newRule])

    try {
      await createPriceRule({
        tenant_id: tenantId!,
        ...newRule,
      })
      toast.success('Regla de precio guardada')
    } catch {
      toast.info('Regla agregada')
    } finally {
      setLoading(false)
      setIsModalOpen(false)
      setName('')
    }
  }

  const daysMap: Record<number, string> = {
    0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb'
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Tarifas y Reglas de Seña
          </h2>
          <p className="text-xs text-slate-400">
            Establecé precios diferenciados por horario, días y porcentaje de seña exigido para reservar online.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={() => setIsDynamicModalOpen(true)}
            className="border-purple-500/30 bg-purple-950/20 text-purple-300 hover:bg-purple-900/30 font-bold gap-2 text-xs rounded-xl"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Tarifas Dinámicas (IA)</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsInflationModalOpen(true)}
            className="border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-bold gap-2 text-xs rounded-xl"
          >
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Ajuste por Inflación (+%)</span>
          </Button>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2 shadow-lg shadow-emerald-950/40 rounded-xl"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Tarifa</span>
          </Button>
        </div>
      </div>

      {/* Grid de Tarifas */}
      {loadingRules ? (
        <div className="flex items-center justify-center py-16 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin mr-2 text-emerald-400" />
          <span>Cargando tarifas y reglas de precio...</span>
        </div>
      ) : rules.length === 0 ? (
        <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800 p-8 space-y-3">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-400">
            <Tag className="w-6 h-6" />
          </div>
          <h3 className="text-sm font-bold text-white">No hay tarifas configuradas</h3>
          <p className="text-xs text-slate-400 max-w-sm mx-auto">
            Configurá las tarifas por día y horario para que los jugadores puedan reservar en tu club con los precios correctos.
          </p>
          <Button
            onClick={() => setIsModalOpen(true)}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 rounded-xl text-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Primera Tarifa</span>
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rules.map((rule) => {
            const señaMonto = Math.round((rule.price_ars * rule.deposit_pct) / 100)

            return (
              <Card key={rule.id} className="border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <Badge variant="default" className="mb-2">
                      {rule.days_of_week.map(d => daysMap[d]).join(', ')}
                    </Badge>
                    <span className="text-xl font-extrabold text-emerald-400">
                      {formatARS(rule.price_ars)}
                    </span>
                  </div>
                  <CardTitle className="text-base">{rule.name}</CardTitle>
                  <CardDescription className="flex items-center gap-1 mt-1 text-xs">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    <span>{rule.time_from} a {rule.time_to} hs</span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="border-t border-slate-800/80 pt-3 text-xs space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-emerald-400" /> Seña exigida online:
                    </span>
                    <span className="font-bold text-slate-100">
                      {rule.deposit_pct}% ({formatARS(señaMonto)})
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-teal-400" /> Saldo a liquidar en club:
                    </span>
                    <span className="font-medium text-slate-300">
                      {formatARS(rule.price_ars - señaMonto)}
                    </span>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Nueva Tarifa */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>Nueva Regla de Tarifa</DialogTitle>
            <DialogDescription>
              Definí el precio y porcentaje de seña para una franja horaria.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateRule} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ruleName">Nombre de la Tarifa *</Label>
              <Input
                id="ruleName"
                placeholder="Ej. Noche Fin de Semana"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="timeFrom">Desde (Hora)</Label>
                <Input
                  id="timeFrom"
                  type="time"
                  value={timeFrom}
                  onChange={(e) => setTimeFrom(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="timeTo">Hasta (Hora)</Label>
                <Input
                  id="timeTo"
                  type="time"
                  value={timeTo}
                  onChange={(e) => setTimeTo(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="price">Precio Total ($ ARS)</Label>
                <Input
                  id="price"
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="deposit">Seña Exigida (%)</Label>
                <Input
                  id="deposit"
                  type="number"
                  min="0"
                  max="100"
                  value={depositPct}
                  onChange={(e) => setDepositPct(e.target.value)}
                  required
                />
              </div>
            </div>

            <DialogFooter className="pt-3">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : 'Guardar Tarifa'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Modal Ajuste Masivo por Inflación (3C) */}
      <InflationAdjustModal
        isOpen={isInflationModalOpen}
        onClose={() => setIsInflationModalOpen(false)}
        currentRules={rules}
        tenantId={tenantId ?? undefined}
        onSuccess={(updated) => {
          setRules(updated.map((u, idx) => ({
            ...rules[idx],
            price_ars: u.price_ars,
          })))
        }}
      />

      {/* Modal Tarifas Dinámicas y Yield Management (Mejora 14) */}
      <DynamicPricingModal
        open={isDynamicModalOpen}
        onOpenChange={setIsDynamicModalOpen}
        tenantId={tenantId ?? undefined}
      />
    </div>
  )
}
