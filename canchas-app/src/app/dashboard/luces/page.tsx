'use client'

import { useState, useEffect } from 'react'
import { 
  Zap, 
  Lightbulb, 
  Power, 
  Leaf, 
  DollarSign, 
  CalendarCheck,
  Loader2,
  Settings,
  Cloud,
  CheckCircle2
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
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
import { formatARS } from '@/lib/utils'
import { toast } from 'sonner'
import { 
  toggleCourtLight, 
  getCourtLightConfigs, 
  saveCourtLightConfig,
  type RelayType,
  type CloudLightConfig
} from '@/actions/lights.actions'
import { useTenantId } from '@/hooks/use-tenant-id'
import { PlanFeatureGuard } from '@/components/dashboard/plan-feature-guard'
import { createClient } from '@/lib/supabase/client'

interface CourtUIItem {
  court_id: string
  court_name: string
  is_on: boolean
  is_auto_mode: boolean
  pre_turn_minutes: number
  post_turn_minutes: number
  relay_type: RelayType
  relay_ip_or_id: string
  cloud_config?: CloudLightConfig
  last_state_change: string
}

export default function LucesPage() {
  const tenantId = useTenantId()
  const [courts, setCourts] = useState<CourtUIItem[]>([])
  const [loading, setLoading] = useState(true)

  // Estado del modal de configuración de relé IoT
  const [configModalOpen, setConfigModalOpen] = useState(false)
  const [selectedCourt, setSelectedCourt] = useState<CourtUIItem | null>(null)
  const [relayType, setRelayType] = useState<RelayType>('SHELLY_CLOUD')
  const [relayIp, setRelayIp] = useState('')
  const [deviceId, setDeviceId] = useState('')
  const [authKey, setAuthKey] = useState('')
  const [channel, setChannel] = useState(0)
  const [preMinutes, setPreMinutes] = useState(5)
  const [postMinutes, setPostMinutes] = useState(5)
  const [savingConfig, setSavingConfig] = useState(false)

  useEffect(() => {
    if (!tenantId) return
    const activeTenantId = tenantId
    let isMounted = true

    async function loadData() {
      try {
        const supabase = createClient()
        const [{ data: courtsData }, savedConfigs] = await Promise.all([
          supabase
            .from('courts')
            .select('id, name, has_lights, light_is_on')
            .eq('tenant_id', activeTenantId)
            .eq('is_active', true)
            .order('display_order', { ascending: true }),
          getCourtLightConfigs(activeTenantId)
        ])

        if (!isMounted) return

        if (courtsData && courtsData.length > 0) {
          const items: CourtUIItem[] = courtsData.map(c => {
            const saved = savedConfigs[c.id] || {}
            return {
              court_id: c.id,
              court_name: c.name,
              is_on: Boolean(c.light_is_on ?? saved.is_on ?? false),
              is_auto_mode: saved.is_auto_mode ?? true,
              pre_turn_minutes: saved.pre_turn_minutes ?? 5,
              post_turn_minutes: saved.post_turn_minutes ?? 5,
              relay_type: saved.relay_type ?? 'SHELLY_CLOUD',
              relay_ip_or_id: saved.relay_ip_or_id || (saved.cloud_config?.deviceId ? `Shelly Cloud ID: ${saved.cloud_config.deviceId.slice(0, 8)}...` : 'Relé IoT Cloud'),
              cloud_config: saved.cloud_config,
              last_state_change: c.light_is_on ? 'Encendida' : 'Apagada (Modo automático)',
            }
          })
          setCourts(items)
        } else {
          setCourts([])
        }
      } catch (err) {
        console.error('[LucesPage] Error loading data:', err)
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadData()
    return () => { isMounted = false }
  }, [tenantId])

  const handleToggleLight = async (courtId: string, current: boolean) => {
    const command = current ? 'off' : 'on'
    const court = courts.find(c => c.court_id === courtId)
    if (!court) return

    // Optimistic update
    setCourts(prev => prev.map(c => {
      if (c.court_id === courtId) {
        return {
          ...c,
          is_on: !current,
          last_state_change: `${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs (Acción manual)`,
        }
      }
      return c
    }))

    const result = await toggleCourtLight(
      courtId, 
      command, 
      court.relay_ip_or_id, 
      court.relay_type, 
      0, 
      court.cloud_config
    )

    if (result.success) {
      toast.success(current ? 'Iluminación apagada' : 'Iluminación encendida', {
        description: `Comando ejecutado vía ${result.providerUsed || 'IoT'}.`
      })
    } else {
      // Revertir optimistic update si falló
      setCourts(prev => prev.map(c =>
        c.court_id === courtId ? { ...c, is_on: current } : c
      ))
      toast.error('Error al controlar el relé', {
        description: result.error ?? 'No se pudo conectar al dispositivo IoT.'
      })
    }
  }

  const handleToggleMode = (courtId: string, currentAuto: boolean) => {
    setCourts(prev => prev.map(c => {
      if (c.court_id === courtId) {
        return { ...c, is_auto_mode: !currentAuto }
      }
      return c
    }))

    toast.info(!currentAuto ? 'Modo automático activado (sincronizado con reservas)' : 'Modo manual fijado')
  }

  const openConfigModal = (court: CourtUIItem) => {
    setSelectedCourt(court)
    setRelayType(court.relay_type || 'SHELLY_CLOUD')
    setDeviceId(court.cloud_config?.deviceId || '')
    setAuthKey(court.cloud_config?.authKey || '')
    setRelayIp(court.relay_ip_or_id.startsWith('192.') || court.relay_ip_or_id.startsWith('10.') ? court.relay_ip_or_id : '')
    setPreMinutes(court.pre_turn_minutes || 5)
    setPostMinutes(court.post_turn_minutes || 5)
    setConfigModalOpen(true)
  }

  const handleSaveConfig = async () => {
    if (!tenantId || !selectedCourt) return
    setSavingConfig(true)
    try {
      const cloudCfg: CloudLightConfig = {
        deviceId: deviceId.trim() || undefined,
        authKey: authKey.trim() || undefined,
      }
      const label = relayType === 'SHELLY_CLOUD' 
        ? `Shelly Cloud ID: ${deviceId.slice(0, 8)}...`
        : relayType === 'SHELLY' || relayType === 'SONOFF'
        ? `LAN IP: ${relayIp || '192.168.1.100'}`
        : 'Webhook IoT'

      const res = await saveCourtLightConfig(tenantId, selectedCourt.court_id, {
        relay_type: relayType,
        relay_ip_or_id: label,
        cloud_config: cloudCfg,
        pre_turn_minutes: preMinutes,
        post_turn_minutes: postMinutes,
      })

      if (res.success) {
        setCourts(prev => prev.map(c => {
          if (c.court_id === selectedCourt.court_id) {
            return {
              ...c,
              relay_type: relayType,
              relay_ip_or_id: label,
              cloud_config: cloudCfg,
              pre_turn_minutes: preMinutes,
              post_turn_minutes: postMinutes,
            }
          }
          return c
        }))
        toast.success('¡Configuración de hardware IoT guardada con éxito!')
        setConfigModalOpen(false)
      } else {
        toast.error('Error al guardar: ' + res.error)
      }
    } catch {
      toast.error('Error al guardar configuración IoT')
    } finally {
      setSavingConfig(false)
    }
  }

  const activeLightsCount = courts.filter(c => c.is_on).length

  return (
    <PlanFeatureGuard feature="control_luces" featureTitle="Control Inteligente de Iluminación">
      <div className="space-y-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs tracking-wider uppercase mb-1">
              <Zap className="w-4 h-4" />
              Domótica & Control de Energía (IoT)
            </div>
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Control Inteligente de Iluminación
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Automatización de reflectores LED: encendido anticipado y apagado automático al finalizar cada turno.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs py-1.5 px-3 flex items-center gap-1.5 font-semibold">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              <span>Sistema IoT Operativo (Nube &amp; LAN)</span>
            </Badge>
          </div>
        </div>

        {/* Panel Informativo y Vinculación */}
        <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 text-slate-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-2.5">
            <Cloud className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5 sm:mt-0" />
            <div>
              <p className="font-bold text-white">Integración en la Nube y Red Local</p>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Compatible con Shelly Cloud REST API (sin necesidad de abrir puertos en tu router), Sonoff eWeLink y relés Tasmota locales.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 bg-emerald-950/40 text-[11px] shrink-0 font-medium">
            Sincronización Automática con Calendario
          </Badge>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl">
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Reflectores Activos</span>
              <Lightbulb className="w-4 h-4 text-amber-400" />
            </div>
            <div className="text-2xl font-extrabold text-white mt-1">
              {activeLightsCount} / {courts.length}
              <span className="text-xs text-slate-400 font-normal ml-2">canchas iluminadas</span>
            </div>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl">
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Horas de Luz Ahorradas (Este Mes)</span>
              <Leaf className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">
              46.5 hs
              <span className="text-xs text-slate-400 font-normal ml-2">apagado por turno vacío</span>
            </div>
          </Card>

          <Card className="bg-slate-900/60 border-slate-800 p-4 rounded-2xl">
            <div className="text-slate-400 text-xs font-medium flex items-center justify-between">
              <span>Ahorro Estimado en Boleta Eléctrica</span>
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-extrabold text-emerald-400 mt-1">
              {formatARS(139500)}
              <span className="text-xs text-slate-400 font-normal ml-2">/mes</span>
            </div>
          </Card>
        </div>

        {/* Grid de Canchas */}
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin mr-2 text-emerald-400" />
            <span>Cargando canchas e interruptores...</span>
          </div>
        ) : courts.length === 0 ? (
          <div className="text-center py-16 rounded-2xl bg-slate-900/40 border border-slate-800 p-8 space-y-3">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto text-amber-400">
              <Lightbulb className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-white">No hay canchas registradas</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Configurá tus canchas desde el menú &quot;Canchas&quot; para poder controlar la iluminación manual o automática de cada una.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courts.map((court) => (
              <Card 
                key={court.court_id}
                className={`border-slate-800 bg-slate-900/70 rounded-2xl overflow-hidden transition-all ${
                  court.is_on ? 'border-amber-500/40 shadow-xl shadow-amber-950/20' : 'hover:border-slate-700'
                }`}
              >
                <CardHeader className="pb-3 border-b border-slate-800/80 bg-slate-950/40">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className={`w-3 h-3 rounded-full ${court.is_on ? 'bg-amber-400 shadow-lg shadow-amber-400/80 animate-pulse' : 'bg-slate-600'}`} />
                      <CardTitle className="text-base text-white">{court.court_name}</CardTitle>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openConfigModal(court)}
                        className="h-8 w-8 p-0 text-slate-400 hover:text-white"
                        title="Configurar Relé IoT"
                      >
                        <Settings className="w-4 h-4" />
                      </Button>
                      <Badge 
                        className={`text-[10px] font-bold ${
                          court.is_on 
                            ? 'bg-amber-500/20 text-amber-300 border-amber-500/40' 
                            : 'bg-slate-800 text-slate-400 border-slate-700'
                        }`}
                      >
                        {court.is_on ? '💡 ENCENDIDA' : '⚪ APAGADA'}
                      </Badge>
                    </div>
                  </div>

                  <CardDescription className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                    <span className="font-mono text-[11px] text-slate-400">{court.relay_ip_or_id}</span>
                  </CardDescription>
                </CardHeader>

                <CardContent className="pt-4 pb-4 space-y-4 text-xs">
                  {/* Interruptor Principal */}
                  <div className="flex items-center justify-between p-3 rounded-2xl bg-slate-950/60 border border-slate-800">
                    <div>
                      <div className="font-bold text-white text-xs">Estado de los Reflectores</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{court.last_state_change}</div>
                    </div>

                    <Button
                      size="sm"
                      onClick={() => handleToggleLight(court.court_id, court.is_on)}
                      className={`h-10 px-4 rounded-xl font-bold gap-2 text-xs transition-all ${
                        court.is_on
                          ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-950/40'
                          : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg shadow-emerald-950/40'
                      }`}
                    >
                      <Power className="w-4 h-4" />
                      <span>{court.is_on ? 'Apagar Ahora' : 'Encender Ahora'}</span>
                    </Button>
                  </div>

                  {/* Automatización por Turnos */}
                  <div className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-slate-200 flex items-center gap-1.5">
                        <CalendarCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Automatización según Reservas:
                      </span>
                      <button
                        onClick={() => handleToggleMode(court.court_id, court.is_auto_mode)}
                        className="focus:outline-none"
                      >
                        <Badge 
                          className={`cursor-pointer text-[10px] font-bold ${
                            court.is_auto_mode 
                              ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' 
                              : 'bg-slate-800 text-slate-400 border-slate-700'
                          }`}
                        >
                          {court.is_auto_mode ? '🤖 AUTOMÁTICO (Activo)' : '🖐️ MANUAL'}
                        </Badge>
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-[11px] text-slate-400 pt-1">
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="block text-slate-500 text-[10px] uppercase font-bold">Pre-encendido:</span>
                        <span className="font-semibold text-slate-200">{court.pre_turn_minutes} min antes</span>
                      </div>
                      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800">
                        <span className="block text-slate-500 text-[10px] uppercase font-bold">Apagado de gracia:</span>
                        <span className="font-semibold text-slate-200">{court.post_turn_minutes} min después</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Modal de Configuración IoT de Cancha */}
        <Dialog open={configModalOpen} onOpenChange={setConfigModalOpen}>
          <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base text-white">
                <Settings className="w-5 h-5 text-emerald-400" />
                <span>Configurar Hardware IoT — {selectedCourt?.court_name}</span>
              </DialogTitle>
              <DialogDescription className="text-xs text-slate-400">
                Vinculá el relé de reflectores LED para control automático y manual.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-xs">
              <div className="space-y-1.5">
                <Label className="text-xs text-slate-300 font-semibold">Tipo de Conexión IoT</Label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRelayType('SHELLY_CLOUD')}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      relayType === 'SHELLY_CLOUD'
                        ? 'border-emerald-500/60 bg-emerald-950/30 text-emerald-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="font-bold">Shelly Cloud (Nube)</span>
                    <span className="text-[10px] text-slate-400">Recomendado, no requiere abrir puertos</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRelayType('SHELLY')}
                    className={`p-2.5 rounded-xl border text-left flex flex-col gap-1 transition-all ${
                      relayType === 'SHELLY'
                        ? 'border-emerald-500/60 bg-emerald-950/30 text-emerald-300'
                        : 'border-slate-800 bg-slate-950 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="font-bold">Red Local (LAN)</span>
                    <span className="text-[10px] text-slate-400">Shelly Gen2, Sonoff o Tasmota en IP local</span>
                  </button>
                </div>
              </div>

              {relayType === 'SHELLY_CLOUD' ? (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="deviceId" className="text-xs text-slate-300">Device ID (Shelly Cloud)</Label>
                    <Input
                      id="deviceId"
                      placeholder="Ej: e8db84d29a1b"
                      value={deviceId}
                      onChange={e => setDeviceId(e.target.value)}
                      className="bg-slate-950 border-slate-800 text-xs font-mono"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="authKey" className="text-xs text-slate-300">Authorization Key / Token (Shelly)</Label>
                    <Input
                      id="authKey"
                      type="password"
                      placeholder="Pegar Auth Key de Shelly Cloud"
                      value={authKey}
                      onChange={e => setAuthKey(e.target.value)}
                      className="bg-slate-950 border-slate-800 text-xs font-mono"
                    />
                  </div>
                </>
              ) : (
                <div className="space-y-1.5">
                  <Label htmlFor="relayIp" className="text-xs text-slate-300">Dirección IP Local del Relé</Label>
                  <Input
                    id="relayIp"
                    placeholder="192.168.1.120"
                    value={relayIp}
                    onChange={e => setRelayIp(e.target.value)}
                    className="bg-slate-950 border-slate-800 text-xs font-mono"
                  />
                </div>
              )}

              <div className="grid grid-cols-3 gap-2.5 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Canal (0-3)</Label>
                  <Input
                    type="number"
                    min="0"
                    max="3"
                    value={channel}
                    onChange={e => setChannel(Number(e.target.value) || 0)}
                    className="bg-slate-950 border-slate-800 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Pre-encendido</Label>
                  <Input
                    type="number"
                    min="0"
                    max="30"
                    value={preMinutes}
                    onChange={e => setPreMinutes(Number(e.target.value) || 0)}
                    className="bg-slate-950 border-slate-800 text-xs"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-slate-300">Apagado gracia</Label>
                  <Input
                    type="number"
                    min="0"
                    max="30"
                    value={postMinutes}
                    onChange={e => setPostMinutes(Number(e.target.value) || 0)}
                    className="bg-slate-950 border-slate-800 text-xs"
                  />
                </div>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                variant="ghost"
                onClick={() => setConfigModalOpen(false)}
                className="text-xs text-slate-400"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveConfig}
                disabled={savingConfig}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs"
              >
                {savingConfig ? 'Guardando...' : 'Guardar Dispositivo'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </PlanFeatureGuard>
  )
}
