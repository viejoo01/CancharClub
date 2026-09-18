'use client'

import { useState, useEffect } from 'react'
import { Plus, Clock, Percent, ShieldCheck, Loader2, TrendingUp, Sparkles, Tag, Trash2, Layers } from 'lucide-react'
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
import { createPriceRule, getClubPriceRules, deletePriceRule } from '@/actions/club.actions'
import { toast } from 'sonner'
import { useTenantId } from '@/hooks/use-tenant-id'
import { createClient } from '@/lib/supabase/client'

interface PriceRuleItem {
  id: string
  name: string
  court_id?: string | null
  court_name?: string
  days_of_week: number[]
  time_from: string
  time_to: string
  price_ars: number
  deposit_pct: number
}

interface ClubCourtSimple {
  id: string
  name: string
}

export default function PreciosPage() {
  const tenantId = useTenantId()
  const [rules, setRules] = useState<PriceRuleItem[]>([])
  const [availableCourts, setAvailableCourts] = useState<ClubCourtSimple[]>([])
  const [loadingRules, setLoadingRules] = useState(true)

  const reloadRules = async (tId: string) => {
    try {
      const data = await getClubPriceRules(tId)
      interface RawRuleResult {
        id: string
        name: string
        court_id?: string | null
        courts?: { name?: string } | { name?: string }[] | null
        days_of_week?: number[]
        time_from?: string
        time_to?: string
        price_ars: number
      }
      const mapped: PriceRuleItem[] = (data as unknown as RawRuleResult[]).map((r) => {
        let cName = 'Todas las canchas'
        if (Array.isArray(r.courts) && r.courts.length > 0) {
          cName = r.courts[0]?.name || 'Cancha'
        } else if (r.courts && typeof r.courts === 'object' && 'name' in r.courts) {
          cName = r.courts.name || 'Cancha'
        }
        return {
          id: r.id,
          name: r.name,
          court_id: r.court_id,
          court_name: cName,
          days_of_week: r.days_of_week || [1, 2, 3, 4, 5],
          time_from: r.time_from ? r.time_from.substring(0, 5) : '18:00',
          time_to: r.time_to ? r.time_to.substring(0, 5) : '23:00',
          price_ars: r.price_ars,
          deposit_pct: 50,
        }
      })
      setRules(mapped)
    } catch {
      toast.error('Error al cargar tarifas')
    }
  }

  useEffect(() => {
    if (!tenantId) return

    let isMounted = true

    async function init() {
      setLoadingRules(true)
      await reloadRules(tenantId!)

      // Cargar canchas disponibles para asignación
      const supabase = createClient()
      const { data } = await supabase
        .from('courts')
        .select('id, name')
        .eq('tenant_id', tenantId!)
        .eq('is_active', true)
        .order('display_order', { ascending: true })

      if (isMounted && data) {
        setAvailableCourts(data)
      }
      if (isMounted) {
        setLoadingRules(false)
      }
    }

    init()

    return () => {
      isMounted = false
    }
  }, [tenantId])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isInflationModalOpen, setIsInflationModalOpen] = useState(false)
  const [isDynamicModalOpen, setIsDynamicModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [selectedCourtId, setSelectedCourtId] = useState<string>('')
  const [timeFrom, setTimeFrom] = useState('18:00')
  const [timeTo, setTimeTo] = useState('23:00')
  const [price, setPrice] = useState('14000')
  const [depositPct, setDepositPct] = useState('50')
  const [loading, setLoading] = useState(false)

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    if (!tenantId) {
      toast.error('No se pudo identificar el club activo')
      return
    }

    setLoading(true)
    try {
      const res = await createPriceRule({
        tenant_id: tenantId,
        court_id: selectedCourtId || null,
        name: name.trim(),
        days_of_week: [1, 2, 3, 4, 5],
        time_from: timeFrom,
        time_to: timeTo,
        price_ars: Number(price),
        deposit_pct: Number(depositPct),
      })

      if (!res.success) {
        toast.error(res.error || 'Error al guardar la regla de tarifa')
        return
      }

      toast.success('¡Regla de tarifa guardada exitosamente!')
      await reloadRules(tenantId)
      setIsModalOpen(false)
      setName('')
      setSelectedCourtId('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al crear tarifa'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRule = async (ruleId: string, ruleName: string) => {
    if (!tenantId) return
    if (!confirm(`¿Estás seguro de eliminar la tarifa "${ruleName}"?`)) return

    try {
      const res = await deletePriceRule(ruleId, tenantId)
      if (!res.success) {
        toast.error(res.error || 'Error al eliminar regla de precio')
      } else {
        setRules(prev => prev.filter(r => r.id !== ruleId))
        toast.success(`Tarifa "${ruleName}" eliminada correctamente`)
      }
    } catch {
      toast.error('Error de conexión al eliminar regla')
    }
  }

  const daysMap: Record<number, string> = {
    0: 'Dom', 1: 'Lun', 2: 'Mar', 3: 'Mié', 4: 'Jue', 5: 'Vie', 6: 'Sáb'
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight text-white">
            Tarifas y Reglas de Seña
          </h2>
          <p className="text-xs text-slate-400">
            Establecé precios diferenciados por horario, días y porcentaje de seña exigido para reservar online.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            onClick={() => setIsDynamicModalOpen(true)}
            className="flex-1 sm:flex-none border-purple-500/30 bg-purple-950/20 text-purple-300 hover:bg-purple-900/30 font-bold gap-2 text-xs rounded-xl min-h-10"
          >
            <Sparkles className="w-4 h-4 text-purple-400" />
            <span>Dinámicas (IA)</span>
          </Button>

          <Button
            variant="outline"
            onClick={() => setIsInflationModalOpen(true)}
            className="flex-1 sm:flex-none border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-bold gap-2 text-xs rounded-xl min-h-10"
          >
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <span>Ajuste Inflación (+%)</span>
          </Button>

          <Button
            onClick={() => setIsModalOpen(true)}
            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2 shadow-lg shadow-emerald-950/40 rounded-xl min-h-10"
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
                  <CardDescription className="flex items-center justify-between gap-1 mt-1 text-xs">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span>{rule.time_from} a {rule.time_to} hs</span>
                    </span>
                    <span className="flex items-center gap-1 text-slate-400 font-medium">
                      <Layers className="w-3 h-3 text-emerald-400" />
                      <span>{rule.court_name}</span>
                    </span>
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

                  <div className="pt-2 border-t border-slate-800/60 flex justify-end">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => handleDeleteRule(rule.id, rule.name)}
                      className="h-7 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 gap-1 px-2"
                      title="Eliminar tarifa"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Modal Nueva Tarifa */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="sm:max-w-[450px] max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full">
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
                className="h-10 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="courtSelect">Cancha Asignada</Label>
              <select
                id="courtSelect"
                value={selectedCourtId}
                onChange={(e) => setSelectedCourtId(e.target.value)}
                className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Todas las canchas del club</option>
                {availableCourts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
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
                  className="h-10 text-xs"
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
                  className="h-10 text-xs"
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
                  className="h-10 text-xs"
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
                  className="h-10 text-xs"
                />
              </div>
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row gap-2 pt-3">
              <Button type="button" variant="ghost" onClick={() => setIsModalOpen(false)} className="h-10 text-xs">
                Cancelar
              </Button>
              <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-10 text-xs">
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
