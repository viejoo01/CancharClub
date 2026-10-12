'use client'

import { useState, useEffect, useMemo } from 'react'
import { Plus, Clock, Percent, ShieldCheck, Loader2, TrendingUp, Sparkles, Tag, Trash2, Layers, Pencil, Lock } from 'lucide-react'
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
import { createPriceRule, updatePriceRule, getClubPriceRules, deletePriceRule } from '@/actions/club.actions'
import { toast } from 'sonner'
import { useTenantId, useUserRole } from '@/hooks/use-tenant-id'
import { createClient } from '@/lib/supabase/client'

function formatSport(sport?: string | null): string {
  if (!sport) return 'General'
  const s = sport.toUpperCase()
  if (s === 'FUTBOL5' || s === 'FUTBOL_5') return 'Fútbol 5'
  if (s === 'FUTBOL7' || s === 'FUTBOL_7') return 'Fútbol 7'
  if (s === 'FUTBOL11' || s === 'FUTBOL_11') return 'Fútbol 11'
  if (s === 'PADEL') return 'Pádel'
  if (s === 'TENIS') return 'Tenis'
  if (s === 'BASQUET' || s === 'BASKET') return 'Básquet'
  if (s === 'SQUASH') return 'Squash'
  return sport
}

function getSportIcon(sport?: string | null): string {
  if (!sport) return '🏟️'
  const s = sport.toUpperCase()
  if (s.includes('FUTBOL')) return '⚽'
  if (s.includes('PADEL')) return '🎾'
  if (s.includes('TENIS')) return '🎾'
  if (s.includes('BASKET') || s.includes('BASQUET')) return '🏀'
  if (s.includes('SQUASH')) return '🏸'
  return '🏆'
}

interface PriceRuleItem {
  id: string
  name: string
  court_id?: string | null
  court_name?: string
  court_sport?: string | null
  days_of_week: number[]
  time_from: string
  time_to: string
  price_ars: number
  deposit_pct: number
}

interface ClubCourtSimple {
  id: string
  name: string
  sport?: string | null
}

// Cache en memoria a nivel módulo para transiciones instantáneas entre menús (0ms)
const cachedRulesMap = new Map<string, PriceRuleItem[]>()
const cachedCourtsMap = new Map<string, ClubCourtSimple[]>()

export default function PreciosPage() {
  const tenantId = useTenantId()
  const { isOwner } = useUserRole()
  const [rules, setRules] = useState<PriceRuleItem[]>(() => (tenantId ? cachedRulesMap.get(tenantId) || [] : []))
  const [availableCourts, setAvailableCourts] = useState<ClubCourtSimple[]>(() => (tenantId ? cachedCourtsMap.get(tenantId) || [] : []))
  const [loadingRules, setLoadingRules] = useState(() => !tenantId || !cachedRulesMap.has(tenantId))

  const reloadRules = async (tId: string, showToastOnError = false) => {
    try {
      const data = await getClubPriceRules(tId)
      interface RawRuleResult {
        id: string
        name: string
        court_id?: string | null
        courts?: { name?: string; sport?: string } | { name?: string; sport?: string }[] | null
        days_of_week?: number[]
        time_from?: string
        time_to?: string
        price_ars: number
      }
      const mapped: PriceRuleItem[] = (data as unknown as RawRuleResult[]).map((r) => {
        let cName = 'Todas las canchas'
        let cSport: string | null = null
        if (Array.isArray(r.courts) && r.courts.length > 0) {
          cName = r.courts[0]?.name || 'Cancha'
          cSport = r.courts[0]?.sport || null
        } else if (r.courts && typeof r.courts === 'object' && 'name' in r.courts) {
          cName = r.courts.name || 'Cancha'
          cSport = r.courts.sport || null
        }
        return {
          id: r.id,
          name: r.name,
          court_id: r.court_id,
          court_name: cName,
          court_sport: cSport,
          days_of_week: r.days_of_week || [1, 2, 3, 4, 5],
          time_from: r.time_from ? r.time_from.substring(0, 5) : '18:00',
          time_to: r.time_to ? r.time_to.substring(0, 5) : '23:00',
          price_ars: r.price_ars,
          deposit_pct: 50,
        }
      })
      cachedRulesMap.set(tId, mapped)
      setRules(mapped)
      return mapped
    } catch {
      if (showToastOnError) toast.error('Error al cargar tarifas')
      return []
    }
  }

  useEffect(() => {
    if (!tenantId) return

    let isMounted = true

    async function init(isInitial = false) {
      const hasCached = tenantId && cachedRulesMap.has(tenantId)
      if (isInitial && !hasCached) {
        setLoadingRules(true)
      }

      // Cargar tarifas y canchas en paralelo
      const supabase = createClient()
      const [, courtsRes] = await Promise.all([
        reloadRules(tenantId!, isInitial && !hasCached),
        supabase
          .from('courts')
          .select('id, name, sport')
          .eq('tenant_id', tenantId!)
          .eq('is_active', true)
          .order('display_order', { ascending: true })
      ])

      if (isMounted) {
        if (courtsRes.data) {
          cachedCourtsMap.set(tenantId!, courtsRes.data)
          setAvailableCourts(courtsRes.data)
        }
        setLoadingRules(false)
      }
    }

    void init(true)

    // Sondeo de respaldo cada 60 segundos (precios no cambian en tiempo real)
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      void init(false)
    }, 60000)

    const handleSync = () => void init(false)
    window.addEventListener('focus', handleSync)
    document.addEventListener('visibilitychange', handleSync)

    return () => {
      isMounted = false
      clearInterval(interval)
      window.removeEventListener('focus', handleSync)
      document.removeEventListener('visibilitychange', handleSync)
    }
  }, [tenantId])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null)
  const [isInflationModalOpen, setIsInflationModalOpen] = useState(false)
  const [isDynamicModalOpen, setIsDynamicModalOpen] = useState(false)
  const [name, setName] = useState('')
  const [selectedCourtId, setSelectedCourtId] = useState<string>('')
  const [timeFrom, setTimeFrom] = useState('18:00')
  const [timeTo, setTimeTo] = useState('23:00')
  const [price, setPrice] = useState('14000')
  const [depositPct, setDepositPct] = useState('50')
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5, 6, 0])
  const [loading, setLoading] = useState(false)
  const [filterSport, setFilterSport] = useState<string>('ALL')

  const availableSports = useMemo(() => {
    const map = new Map<string, { key: string; label: string; icon: string; count: number }>()
    for (const c of availableCourts) {
      if (!c.sport) continue
      const norm = c.sport.replace('_', '').toUpperCase()
      const existing = map.get(norm)
      if (existing) {
        existing.count++
      } else {
        map.set(norm, {
          key: c.sport,
          label: formatSport(c.sport),
          icon: getSportIcon(c.sport),
          count: 1,
        })
      }
    }
    return Array.from(map.values())
  }, [availableCourts])

  const filteredRules = useMemo(() => {
    if (filterSport === 'ALL') return rules
    const normFilter = filterSport.replace('_', '').toUpperCase()
    return rules.filter(r => (r.court_sport || '').replace('_', '').toUpperCase() === normFilter)
  }, [rules, filterSport])

  const handleOpenCreateModal = () => {
    if (!isOwner) {
      toast.error('Solo el dueño del club tiene permisos para crear tarifas.')
      return
    }
    setEditingRuleId(null)
    setName('')
    setSelectedCourtId('')
    setTimeFrom('18:00')
    setTimeTo('23:00')
    setPrice('14000')
    setDepositPct('50')
    setSelectedDays([1, 2, 3, 4, 5, 6, 0])
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (rule: PriceRuleItem) => {
    if (!isOwner) {
      toast.error('Solo el dueño del club tiene permisos para modificar tarifas.')
      return
    }
    setEditingRuleId(rule.id)
    setName(rule.name)
    setSelectedCourtId(rule.court_id || '')
    setTimeFrom(rule.time_from)
    setTimeTo(rule.time_to)
    setPrice(rule.price_ars.toString())
    setDepositPct(rule.deposit_pct.toString())
    setSelectedDays(rule.days_of_week && rule.days_of_week.length > 0 ? rule.days_of_week : [1, 2, 3, 4, 5, 6, 0])
    setIsModalOpen(true)
  }

  const handleSubmitRule = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return

    if (!isOwner) {
      toast.error('Solo el dueño del club tiene permisos para crear o modificar tarifas.')
      return
    }

    if (!tenantId) {
      toast.error('No se pudo identificar el club activo')
      return
    }

    if (timeFrom === timeTo) {
      toast.error('La hora de inicio y de fin no pueden ser iguales.')
      return
    }

    if (timeTo !== '00:00' && timeTo < timeFrom) {
      toast.error('La hora de fin debe ser posterior a la de inicio (ej: de 18:00 a 23:00, o 00:00 para medianoche). Si el turno pasa de medianoche (ej: hasta las 02:00 am), creá dos tarifas separadas: una hasta medianoche y otra desde las 00:00.')
      return
    }

    setLoading(true)
    try {
      if (editingRuleId) {
        const isSport = selectedCourtId.startsWith('sport:')
        const res = await updatePriceRule({
          id: editingRuleId,
          tenant_id: tenantId,
          court_id: isSport ? null : (selectedCourtId || null),
          name: name.trim(),
          days_of_week: selectedDays.length > 0 ? selectedDays : [1, 2, 3, 4, 5, 6, 0],
          time_from: timeFrom,
          time_to: timeTo,
          price_ars: Number(price),
          deposit_pct: Number(depositPct),
        })

        if (!res.success) {
          toast.error(res.error || 'Error al actualizar la regla de tarifa')
          return
        }

        toast.success('¡Tarifa actualizada exitosamente!')
      } else {
        const isSport = selectedCourtId.startsWith('sport:')
        const sportKey = isSport ? selectedCourtId.replace('sport:', '') : null
        const res = await createPriceRule({
          tenant_id: tenantId,
          court_id: isSport ? null : (selectedCourtId || null),
          sport: sportKey,
          name: name.trim(),
          days_of_week: selectedDays.length > 0 ? selectedDays : [1, 2, 3, 4, 5, 6, 0],
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
      }

      await reloadRules(tenantId)
      setIsModalOpen(false)
      setEditingRuleId(null)
      setName('')
      setSelectedCourtId('')
      setSelectedDays([1, 2, 3, 4, 5, 6, 0])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado al procesar tarifa'
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const handleDeleteRule = async (ruleId: string, ruleName: string) => {
    if (!isOwner) {
      toast.error('Solo el dueño del club tiene permisos para eliminar tarifas.')
      return
    }
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
          {isOwner ? (
            <>
              <Button
                variant="outline"
                onClick={() => setIsDynamicModalOpen(true)}
                className="flex-1 sm:flex-none border-purple-500/30 bg-purple-950/20 text-purple-300 hover:bg-purple-900/30 font-bold gap-2 text-xs rounded-xl min-h-10 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span>Dinámicas (IA)</span>
              </Button>

              <Button
                variant="outline"
                onClick={() => setIsInflationModalOpen(true)}
                className="flex-1 sm:flex-none border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/10 font-bold gap-2 text-xs rounded-xl min-h-10 cursor-pointer"
              >
                <TrendingUp className="w-4 h-4 text-emerald-400" />
                <span>Ajuste Inflación (+%)</span>
              </Button>

              <Button
                onClick={handleOpenCreateModal}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-2 shadow-lg shadow-emerald-950/40 rounded-xl min-h-10 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Nueva Tarifa</span>
              </Button>
            </>
          ) : (
            <div className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-amber-400 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              <span>Modificación restringida al Dueño</span>
            </div>
          )}
        </div>
      </div>

      {/* Banner de solo lectura para administradores de turno / personal */}
      {!isOwner && (
        <div className="flex items-center gap-3 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-xs">
          <Lock className="w-4 h-4 shrink-0 text-amber-400" />
          <div className="leading-relaxed">
            <strong className="text-amber-200">Modo Consulta (Solo Lectura):</strong> Las tarifas y reglas de precios de las canchas son administradas exclusivamente por el dueño del club para garantizar la seguridad financiera y evitar discrepancias de caja.
          </div>
        </div>
      )}

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
            onClick={handleOpenCreateModal}
            size="sm"
            className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1.5 rounded-xl text-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Crear Primera Tarifa</span>
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Filtro por Disciplina / Deporte */}
          {availableSports.length > 1 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 custom-scrollbar">
              <span className="text-[11px] font-semibold text-slate-400 mr-1 hidden sm:inline">
                Filtrar por deporte:
              </span>
              <button
                type="button"
                onClick={() => setFilterSport('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                  filterSport === 'ALL'
                    ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                    : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border-slate-800'
                }`}
              >
                🌐 Todas ({rules.length})
              </button>
              {availableSports.map((sp) => {
                const normKey = sp.key.replace('_', '').toUpperCase()
                const count = rules.filter(r => (r.court_sport || '').replace('_', '').toUpperCase() === normKey).length
                const active = filterSport.replace('_', '').toUpperCase() === normKey
                return (
                  <button
                    key={sp.key}
                    type="button"
                    onClick={() => setFilterSport(active ? 'ALL' : sp.key)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border flex items-center gap-1.5 ${
                      active
                        ? 'bg-emerald-600 text-white border-emerald-500 shadow-xs'
                        : 'bg-slate-900/80 text-slate-400 hover:text-white hover:bg-slate-800 border-slate-800'
                    }`}
                  >
                    <span>{sp.icon}</span>
                    <span>{sp.label}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${active ? 'bg-emerald-700 text-white' : 'bg-slate-800 text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filteredRules.map((rule) => {
              const señaMonto = Math.round((rule.price_ars * rule.deposit_pct) / 100)

              return (
                <Card key={rule.id} className="border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-1.5 flex-wrap mb-2">
                        <Badge variant="default" className="bg-slate-800 text-slate-200 border-slate-700 font-semibold">
                          {rule.days_of_week.length === 7
                            ? 'Todos los días (Lun-Dom)'
                            : rule.days_of_week.length === 2 && rule.days_of_week.includes(6) && rule.days_of_week.includes(0)
                            ? 'Fines de semana (Sáb, Dom)'
                            : rule.days_of_week.length === 5 && !rule.days_of_week.includes(6) && !rule.days_of_week.includes(0)
                            ? 'Lun a Vie'
                            : [1, 2, 3, 4, 5, 6, 0].filter(d => rule.days_of_week.includes(d)).map(d => daysMap[d]).join(', ')}
                        </Badge>
                        {rule.court_sport && (
                          <Badge variant="outline" className="text-[10px] bg-emerald-950/40 border-emerald-500/30 text-emerald-300 font-medium gap-1 py-0.5">
                            <span>{getSportIcon(rule.court_sport)}</span>
                            <span>{formatSport(rule.court_sport)}</span>
                          </Badge>
                        )}
                      </div>
                      <span className="text-xl font-extrabold text-emerald-400">
                        {formatARS(rule.price_ars)}
                      </span>
                    </div>
                    <CardTitle className="text-base">{rule.name}</CardTitle>
                    <CardDescription className="flex items-center justify-between gap-1 mt-1 text-xs">
                      <span className="flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>{rule.time_from} a {rule.time_to === '24:00' || rule.time_to === '00:00' ? '00:00' : rule.time_to} hs</span>
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

                    <div className="pt-2 border-t border-slate-800/60 flex items-center justify-between gap-2">
                      {isOwner ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleOpenEditModal(rule)}
                            className="h-7 text-xs text-emerald-400 hover:bg-emerald-500/15 hover:text-emerald-300 border-emerald-500/30 gap-1.5 px-2.5 rounded-lg cursor-pointer font-medium"
                            title="Editar tarifa"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Editar</span>
                          </Button>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleDeleteRule(rule.id, rule.name)}
                            className="h-7 text-xs text-rose-400 hover:bg-rose-500/10 hover:text-rose-300 gap-1 px-2 rounded-lg cursor-pointer"
                            title="Eliminar tarifa"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Eliminar</span>
                          </Button>
                        </>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400 py-0.5">
                          <Lock className="w-3.5 h-3.5 text-amber-400/80" />
                          <span className="text-[11px] text-slate-400">Tarifa fijada por el dueño</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* Modal Crear / Editar Tarifa */}
      <Dialog open={isModalOpen} onOpenChange={(open) => {
        setIsModalOpen(open)
        if (!open) setEditingRuleId(null)
      }}>
        <DialogContent className="sm:max-w-[450px] max-h-[90dvh] overflow-y-auto w-[95vw] sm:w-full">
          <DialogHeader>
            <DialogTitle>{editingRuleId ? 'Editar Regla de Tarifa' : 'Nueva Regla de Tarifa'}</DialogTitle>
            <DialogDescription>
              {editingRuleId
                ? 'Modificá el precio, franja horaria o días de aplicación de esta tarifa.'
                : 'Definí el precio y porcentaje de seña para una franja horaria.'}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmitRule} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="ruleName">Nombre de la Tarifa *</Label>
              <Input
                id="ruleName"
                placeholder=""
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="h-10 text-xs"
              />
            </div>

            {/* Cancha o Disciplina Asignada */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="courtSelect" className="text-xs font-semibold text-slate-200">
                  Cancha o Disciplina Asignada
                </Label>
                {selectedCourtId.startsWith('sport:') && (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/15 border-emerald-500/40 text-emerald-300">
                    Tarifa por Deporte
                  </Badge>
                )}
              </div>

              {/* Botones de selección rápida por Disciplina / Todas */}
              {availableSports.length > 0 && !editingRuleId && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setSelectedCourtId('')}
                    className={`text-[11px] px-2.5 py-1 rounded-lg transition-all cursor-pointer border flex items-center gap-1 ${
                      selectedCourtId === ''
                        ? 'bg-emerald-600 text-white font-bold border-emerald-500 shadow-xs'
                        : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 border-slate-700/60'
                    }`}
                  >
                    <span>🌐</span>
                    <span>Todas</span>
                  </button>

                  {availableSports.map((sp) => {
                    const isSelected = selectedCourtId === `sport:${sp.key}`
                    return (
                      <button
                        key={sp.key}
                        type="button"
                        onClick={() => {
                          setSelectedCourtId(`sport:${sp.key}`)
                          if (!name || name === 'Precio Mañana-Tarde' || name.startsWith('Tarifa ')) {
                            setName(`Tarifa ${sp.label}`)
                          }
                        }}
                        className={`text-[11px] px-2.5 py-1 rounded-lg transition-all cursor-pointer border flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-emerald-600 text-white font-bold border-emerald-500 shadow-xs'
                            : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 border-slate-700/60'
                        }`}
                      >
                        <span>{sp.icon}</span>
                        <span>{sp.label}</span>
                        <span className={`text-[10px] px-1 py-0.1 rounded-full ${isSelected ? 'bg-emerald-700 text-white' : 'bg-slate-900 text-slate-400'}`}>
                          {sp.count}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              {/* Selector desplegable con soporte para Deporte y Canchas individuales */}
              <select
                id="courtSelect"
                value={selectedCourtId}
                onChange={(e) => {
                  const val = e.target.value
                  setSelectedCourtId(val)
                  if (val.startsWith('sport:') && (!name || name === 'Precio Mañana-Tarde' || name.startsWith('Tarifa '))) {
                    const spKey = val.replace('sport:', '').replace('_', '').toUpperCase()
                    const spObj = availableSports.find(s => s.key.replace('_', '').toUpperCase() === spKey)
                    if (spObj) setName(`Tarifa ${spObj.label}`)
                  }
                }}
                className="flex h-10 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">🌐 Todas las canchas del club (Todas las disciplinas)</option>

                {availableSports.length > 0 && !editingRuleId && (
                  <optgroup label="⚡ Por Disciplina / Deporte">
                    {availableSports.map((sp) => (
                      <option key={sp.key} value={`sport:${sp.key}`}>
                        {sp.icon} Todas las canchas de {sp.label} ({sp.count} {sp.count === 1 ? 'cancha' : 'canchas'})
                      </option>
                    ))}
                  </optgroup>
                )}

                <optgroup label="🏟️ Por Cancha Individual">
                  {availableCourts.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.sport ? `(${formatSport(c.sport)})` : ''}
                    </option>
                  ))}
                </optgroup>
              </select>

              {/* Mensaje contextual */}
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800/80 text-[11px] text-slate-300">
                {(() => {
                  if (selectedCourtId === '') {
                    return (
                      <span className="flex items-center gap-1.5 text-slate-400">
                        <span>🌐</span>
                        <span>Aplica a todas las canchas del club ({availableCourts.length} canchas activas).</span>
                      </span>
                    )
                  }
                  if (selectedCourtId.startsWith('sport:')) {
                    const spKey = selectedCourtId.replace('sport:', '').replace('_', '').toUpperCase()
                    const spObj = availableSports.find(s => s.key.replace('_', '').toUpperCase() === spKey)
                    const matchingCourts = availableCourts.filter(c => (c.sport || '').replace('_', '').toUpperCase() === spKey)
                    return (
                      <span className="flex items-center gap-1.5 text-emerald-300 font-medium">
                        <span>{spObj?.icon || '⚡'}</span>
                        <span>
                          Aplica a todas las canchas de <strong>{spObj?.label || 'esta disciplina'}</strong> ({matchingCourts.map(c => c.name).join(', ') || `${spObj?.count} canchas`}).
                        </span>
                      </span>
                    )
                  }
                  const singleCourt = availableCourts.find(c => c.id === selectedCourtId)
                  return (
                    <span className="flex items-center gap-1.5 text-emerald-300 font-medium">
                      <span>🏟️</span>
                      <span>
                        Aplica únicamente a <strong>{singleCourt?.name || 'la cancha seleccionada'}</strong> ({formatSport(singleCourt?.sport)}).
                      </span>
                    </span>
                  )
                })()}
              </div>
            </div>

            {/* Selector interactivo de Días de la Semana */}
            <div className="space-y-2 pt-0.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold text-slate-200">
                  Días de la Semana aplicables *
                </Label>
                {(() => {
                  const isAll = selectedDays.length === 7
                  const isWeekdays = selectedDays.length === 5 && !selectedDays.includes(6) && !selectedDays.includes(0)
                  const isWeekend = selectedDays.length === 2 && selectedDays.includes(6) && selectedDays.includes(0)

                  return (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setSelectedDays([1, 2, 3, 4, 5, 6, 0])}
                        className={`text-[10px] px-2.5 py-1 rounded-md transition-colors cursor-pointer border ${
                          isAll
                            ? 'bg-emerald-600 text-white font-semibold border-emerald-500 shadow-xs'
                            : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 border-slate-700/60'
                        }`}
                      >
                        Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDays([1, 2, 3, 4, 5])}
                        className={`text-[10px] px-2.5 py-1 rounded-md transition-colors cursor-pointer border ${
                          isWeekdays
                            ? 'bg-emerald-600 text-white font-semibold border-emerald-500 shadow-xs'
                            : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 border-slate-700/60'
                        }`}
                      >
                        Lun-Vie
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedDays([6, 0])}
                        className={`text-[10px] px-2.5 py-1 rounded-md transition-colors cursor-pointer border ${
                          isWeekend
                            ? 'bg-emerald-600 text-white font-semibold border-emerald-500 shadow-xs'
                            : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700 border-slate-700/60'
                        }`}
                      >
                        Fines de Sem
                      </button>
                    </div>
                  )
                })()}
              </div>

              <div className="grid grid-cols-7 gap-1 sm:gap-1.5 pt-1">
                {[
                  { id: 1, label: 'Lun' },
                  { id: 2, label: 'Mar' },
                  { id: 3, label: 'Mié' },
                  { id: 4, label: 'Jue' },
                  { id: 5, label: 'Vie' },
                  { id: 6, label: 'Sáb' },
                  { id: 0, label: 'Dom' },
                ].map((day) => {
                  const isSelected = selectedDays.includes(day.id)
                  return (
                    <button
                      key={day.id}
                      type="button"
                      onClick={() => {
                        setSelectedDays(prev =>
                          prev.includes(day.id)
                            ? prev.length > 1 ? prev.filter(d => d !== day.id) : prev
                            : [...prev, day.id]
                        )
                      }}
                      className={`py-2 text-xs font-bold rounded-xl transition-all flex flex-col items-center justify-center border cursor-pointer ${
                        isSelected
                          ? 'bg-emerald-600 text-white border-emerald-500 shadow-sm'
                          : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200'
                      }`}
                    >
                      <span>{day.label}</span>
                    </button>
                  )
                })}
              </div>
              <p className="text-[11px] text-slate-400">
                {selectedDays.length === 7
                  ? '✓ Aplica todos los días (Lunes a Domingo)'
                  : selectedDays.length === 2 && selectedDays.includes(6) && selectedDays.includes(0)
                  ? '✓ Aplica solo los Fines de Semana (Sábados y Domingos)'
                  : selectedDays.length === 5 && !selectedDays.includes(6) && !selectedDays.includes(0)
                  ? '✓ Aplica de Lunes a Viernes'
                  : `✓ Días seleccionados: ${[1, 2, 3, 4, 5, 6, 0].filter(d => selectedDays.includes(d)).map(d => daysMap[d]).join(', ')}`}
              </p>
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
              <p className="text-[11px] text-slate-400 col-span-2">
                * Para turnos nocturnos que finalizan a medianoche, seleccioná <strong>00:00</strong>.
              </p>
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
              <Button type="submit" disabled={loading} className="bg-emerald-600 hover:bg-emerald-500 text-white font-semibold h-10 text-xs cursor-pointer">
                {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : editingRuleId ? 'Guardar Cambios' : 'Guardar Tarifa'}
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
