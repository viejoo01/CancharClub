'use client'

import { useState, useEffect } from 'react'
import { 
  MessageSquare, 
  Bot, 
  Send, 
  CheckCircle2, 
  Clock, 
  Users, 
  Smartphone, 
  ShieldCheck, 
  Loader2, 
  RefreshCw,
  Key,
  AlertTriangle
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { formatARS } from '@/lib/utils'
import { useTenantId } from '@/hooks/use-tenant-id'
import { 
  getWhatsAppBotConfig, 
  saveWhatsAppBotConfig, 
  getWhatsAppMessageLogs, 
  testWhatsAppBotMessage, 
  getTodayTurnosForReminders,
  sendTurnoReminderWhatsApp,
  type WhatsAppBotConfig, 
  type AutomatedMessageLog 
} from '@/actions/whatsapp-bot.actions'

// Cache en memoria a nivel módulo para renderizado instantáneo (0ms)
const cachedWhatsAppConfig = new Map<string, WhatsAppBotConfig>()
const cachedWhatsAppLogs = new Map<string, AutomatedMessageLog[]>()

const getDefaultConfig = (tId: string): WhatsAppBotConfig => ({
  tenant_id: tId,
  is_enabled: true,
  auto_confirm_bookings: true,
  auto_reminder_2h: true,
  auto_waitlist_alert: true,
  provider: 'SIMULATED',
  custom_greeting: '¡Hola! Te escribimos de CancharClub en nombre de tu club.',
})

export default function WhatsAppBotPage() {
  const tenantId = useTenantId()
  const [config, setConfig] = useState<WhatsAppBotConfig>(() => {
    if (tenantId && cachedWhatsAppConfig.has(tenantId)) {
      return cachedWhatsAppConfig.get(tenantId)!
    }
    return getDefaultConfig(tenantId || '')
  })
  const [logs, setLogs] = useState<AutomatedMessageLog[]>(() => {
    return tenantId && cachedWhatsAppLogs.has(tenantId) ? cachedWhatsAppLogs.get(tenantId)! : []
  })
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testPhone, setTestPhone] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [phoneNumberId, setPhoneNumberId] = useState('')
  const [savingCreds, setSavingCreds] = useState(false)

  // Turnos de hoy para recordatorios 2 horas antes
  const [todayTurnos, setTodayTurnos] = useState<Array<{
    id: string
    customerName: string
    customerPhone: string
    courtName: string
    timeStr: string
    balanceArs: number
    alreadyReminded: boolean
  }>>([])
  const [loadingTurnos, setLoadingTurnos] = useState(false)
  const [dispatchingTurnoId, setDispatchingTurnoId] = useState<string | null>(null)

  useEffect(() => {
    if (!tenantId) return
    let isMounted = true

    Promise.all([
      getWhatsAppBotConfig(tenantId),
      getWhatsAppMessageLogs(tenantId),
      getTodayTurnosForReminders(tenantId)
    ])
      .then(([cfg, logList, turnos]) => {
        if (isMounted) {
          cachedWhatsAppConfig.set(tenantId, cfg)
          cachedWhatsAppLogs.set(tenantId, logList)
          setConfig(cfg)
          setLogs(logList)
          setApiKey(cfg.api_key || '')
          setPhoneNumberId(cfg.phone_number_id || '')
          setTodayTurnos(turnos)
        }
      })
      .catch(() => {})

    return () => {
      isMounted = false
    }
  }, [tenantId])

  const handleSendReminder = async (turnoId: string) => {
    setDispatchingTurnoId(turnoId)
    try {
      const res = await sendTurnoReminderWhatsApp(turnoId)
      if (res.success) {
        if (res.isSimulated && res.waUrl) {
          toast.success('¡Recordatorio preparado! Abriendo WhatsApp...')
          window.open(res.waUrl, '_blank')
        } else {
          toast.success('¡Recordatorio enviado por WhatsApp con éxito!')
        }
        setTodayTurnos(prev =>
          prev.map(t => (t.id === turnoId ? { ...t, alreadyReminded: true } : t))
        )
        if (tenantId) {
          const updatedLogs = await getWhatsAppMessageLogs(tenantId)
          cachedWhatsAppLogs.set(tenantId, updatedLogs)
          setLogs(updatedLogs)
        }
      } else {
        toast.error(res.error || 'No se pudo despachar el recordatorio')
      }
    } catch {
      toast.error('Error al despachar recordatorio')
    } finally {
      setDispatchingTurnoId(null)
    }
  }

  const handleSaveCredentials = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenantId) return
    setSavingCreds(true)
    try {
      const res = await saveWhatsAppBotConfig(tenantId, {
        api_key: apiKey.trim(),
        phone_number_id: phoneNumberId.trim(),
      })
      if (res.success) {
        setConfig(res.config)
        cachedWhatsAppConfig.set(tenantId, res.config)
        if (res.config.provider === 'META_CLOUD') {
          toast.success('¡Credenciales de WhatsApp Meta Cloud API activas!')
        } else {
          toast.success('Configuración guardada')
        }
      } else {
        toast.error(res.error || 'Error al guardar credenciales')
      }
    } catch {
      toast.error('Error al guardar credenciales')
    } finally {
      setSavingCreds(false)
    }
  }

  const handleToggle = async (key: keyof WhatsAppBotConfig) => {
    if (!config || !tenantId) return
    const updated = { ...config, [key]: !config[key] }
    cachedWhatsAppConfig.set(tenantId, updated)
    setConfig(updated)
    setSaving(true)
    try {
      const res = await saveWhatsAppBotConfig(tenantId, { [key]: updated[key] })
      if (res.success) {
        toast.success('Configuración actualizada')
      } else {
        toast.error(res.error || 'Error al guardar')
      }
    } catch {
      toast.error('Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  const handleTestSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!testPhone.trim()) {
      toast.error('Ingresá un número de teléfono con código de área')
      return
    }
    if (!tenantId) return

    setTesting(true)
    try {
      const res = await testWhatsAppBotMessage(tenantId, testPhone)
      if (res.success) {
        if (res.isSimulated && res.waUrl) {
          toast.success('¡Mensaje de prueba generado con éxito!')
          window.open(res.waUrl, '_blank')
        } else {
          toast.success('¡WhatsApp enviado correctamente!')
        }
        // Recargar logs
        const updatedLogs = await getWhatsAppMessageLogs(tenantId)
        cachedWhatsAppLogs.set(tenantId, updatedLogs)
        setLogs(updatedLogs)
      } else {
        toast.error(res.error || 'No se pudo enviar el mensaje')
      }
    } catch {
      toast.error('Error al enviar prueba')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-12">
      {/* ─── CABECERA ─── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-black text-white tracking-tight flex items-center gap-2">
              <Bot className="w-7 h-7 text-emerald-400" />
              Automatización de WhatsApp Bot
            </h1>
            {config?.provider === 'META_CLOUD' ? (
              <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-semibold gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                CONECTADO (META CLOUD API)
              </Badge>
            ) : (
              <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30 text-xs font-semibold gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                MODO SIMULADO (SIN TOKEN API)
              </Badge>
            )}
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Notificaciones automáticas desatendidas: confirmá turnos, avisá 2 horas antes y cubrí cancelaciones al instante.
          </p>
        </div>
      </div>

      {/* ─── AVISO DE ESTADO ─── */}
      {config?.provider === 'SIMULATED' && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <strong className="block text-white">Bot en Modo Simulado / Enlace Directo</strong>
            <p className="text-slate-300 leading-relaxed">
              El sistema procesa y genera las confirmaciones y enlaces de WhatsApp, pero para que los mensajes se envíen <strong>de forma 100% automática y silenciosa desde el servidor al celular del jugador</strong> (sin requerir que abras WhatsApp Web), necesitás ingresar tu <strong>Token de Meta Cloud API</strong> y tu <strong>Phone Number ID</strong> abajo.
            </p>
          </div>
        </div>
      )}

      {/* ─── ESTADO Y AUTOMATIZACIONES ACTIVAS ─── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Confirmación Inmediata */}
        <Card className="bg-slate-900/90 border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                <CheckCircle2 className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => handleToggle('auto_confirm_bookings')}
                disabled={saving}
                className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out ${
                  config?.auto_confirm_bookings ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    config?.auto_confirm_bookings ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <CardTitle className="text-base text-white mt-2">Confirmación Inmediata</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Apenas el jugador reserva online o abona la seña, el bot despacha el comprobante con fecha, cancha, saldo restante y dirección.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Badge variant="outline" className={`text-[11px] ${config?.auto_confirm_bookings ? 'text-emerald-400 border-emerald-500/30' : 'text-slate-400 border-slate-700'}`}>
              {config?.auto_confirm_bookings ? 'Activo (Despacho automático)' : 'Pausado'}
            </Badge>
          </CardContent>
        </Card>

        {/* Card 2: Recordatorio 2h Antes */}
        <Card className="bg-slate-900/90 border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-teal-500/10 rounded-full blur-2xl pointer-events-none" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
                <Clock className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => handleToggle('auto_reminder_2h')}
                disabled={saving}
                className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out ${
                  config?.auto_reminder_2h ? 'bg-teal-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    config?.auto_reminder_2h ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <CardTitle className="text-base text-white mt-2">Recordatorio 2 Horas Antes</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Reduce el ausentismo (no-show) enviando un aviso con recordatorio de horario exacto y puntualidad.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Badge variant="outline" className={`text-[11px] ${config?.auto_reminder_2h ? 'text-teal-400 border-teal-500/30' : 'text-slate-400 border-slate-700'}`}>
              {config?.auto_reminder_2h ? 'Activo (Cron automático)' : 'Pausado'}
            </Badge>
          </CardContent>
        </Card>

        {/* Card 3: Alerta Lista de Espera */}
        <Card className="bg-slate-900/90 border-slate-800 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                <Users className="w-5 h-5" />
              </div>
              <button
                type="button"
                onClick={() => handleToggle('auto_waitlist_alert')}
                disabled={saving}
                className={`w-12 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors duration-200 ease-in-out ${
                  config?.auto_waitlist_alert ? 'bg-amber-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ease-in-out ${
                    config?.auto_waitlist_alert ? 'translate-x-6' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
            <CardTitle className="text-base text-white mt-2">Alerta Lista de Espera</CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Si alguien cancela un turno, el bot le avisa al primero de la lista con prioridad exclusiva de 10 minutos.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Badge variant="outline" className={`text-[11px] ${config?.auto_waitlist_alert ? 'text-amber-400 border-amber-500/30' : 'text-slate-400 border-slate-700'}`}>
              {config?.auto_waitlist_alert ? 'Activo (Prioridad 10 min)' : 'Pausado'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* ─── CONFIGURACIÓN DE CREDENCIALES Y PRUEBA ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Card: Credenciales de WhatsApp Meta Cloud API */}
        <Card className="bg-slate-900 border-slate-800 shadow-lg">
          <CardHeader>
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-emerald-400" />
              Conexión WhatsApp Cloud API (Meta)
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Conectá tu cuenta de Meta Developers para envíos 100% desatendidos a los celulares de los clientes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveCredentials} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-300">Phone Number ID (Meta Cloud)</Label>
                <Input
                  type="text"
                  placeholder="Ej: 104589234857291"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white font-mono text-sm"
                />
                <p className="text-[11px] text-slate-500">
                  Identificador del número de teléfono asignado en tu panel de Meta Developers / WhatsApp Cloud.
                </p>
              </div>

              <div className="space-y-2">
                <Label className="text-xs text-slate-300">API Access Token (Meta / WhatsApp)</Label>
                <Input
                  type="password"
                  placeholder="EAABw..."
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white font-mono text-sm"
                />
                <p className="text-[11px] text-slate-500">
                  Token permanente de System User de Meta Cloud API con permisos de <code className="text-emerald-400">whatsapp_business_messaging</code>.
                </p>
              </div>

              <Button
                type="submit"
                disabled={savingCreds}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 text-sm h-10 cursor-pointer shadow-lg shadow-emerald-950/30"
              >
                {savingCreds ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                <span>Guardar Credenciales del Bot</span>
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Formulario de Test de Mensajería */}
        <Card className="bg-slate-900 border-slate-800 shadow-lg">
          <CardHeader>
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Smartphone className="w-5 h-5 text-emerald-400" />
              Test de Conexión del Bot
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Ingresá tu número celular para recibir un mensaje de prueba y verificar el formato.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleTestSend} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-slate-300">Número de WhatsApp (con cód. de área)</Label>
                <Input
                  type="tel"
                  placeholder="Ej: 11 2345 6789 o 381 555 1234"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  className="bg-slate-950 border-slate-800 text-white font-mono text-sm"
                  required
                />
                <p className="text-[11px] text-slate-500">
                  No hace falta poner el 15 ni el +549, el sistema normaliza el número automáticamente.
                </p>
              </div>

              <Button
                type="submit"
                disabled={testing}
                className="w-full bg-slate-800 hover:bg-slate-700 text-white font-bold gap-2 text-sm h-10 cursor-pointer shadow-lg"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Enviar WhatsApp de Prueba</span>
              </Button>
            </form>

            <div className="mt-6 p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Modo Híbrido Automático</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Si las credenciales de Meta están cargadas, el despacho es 100% silencioso y directo a los celulares. Si aún no tenés API de Meta, el sistema genera el enlace wa.me para que no se pierda ninguna confirmación.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── RECORDATORIOS PREVENTIVOS DE TURNOS DE HOY ─── */}
      <Card className="bg-slate-900 border-slate-800 shadow-xl overflow-hidden">
        <div className="h-1 bg-gradient-to-r from-teal-500 to-emerald-400" />
        <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 gap-2">
          <div>
            <CardTitle className="text-base text-white flex items-center gap-2">
              <Clock className="w-5 h-5 text-teal-400" />
              Recordatorios de Turnos de Hoy (2 Horas Antes)
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Despacho manual o programado con link de Google Maps, estado de seña y división de pago.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              if (tenantId) {
                setLoadingTurnos(true)
                try {
                  const turnos = await getTodayTurnosForReminders(tenantId)
                  setTodayTurnos(turnos)
                  toast.success('Turnos del día actualizados')
                } finally {
                  setLoadingTurnos(false)
                }
              }
            }}
            disabled={loadingTurnos}
            className="border-slate-800 text-slate-300 hover:text-white h-8 text-xs gap-1.5 self-start sm:self-auto"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTurnos ? 'animate-spin text-teal-400' : ''}`} />
            <span>Actualizar Turnos</span>
          </Button>
        </CardHeader>
        <CardContent>
          {todayTurnos.length === 0 ? (
            <div className="py-8 text-center text-slate-500 space-y-1">
              <Clock className="w-8 h-8 mx-auto text-slate-700" />
              <p className="text-xs">No hay turnos activos programados para la fecha.</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800/80">
              {todayTurnos.map((turno) => (
                <div key={turno.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex flex-col items-center justify-center font-mono font-bold text-teal-400 shrink-0">
                      <span className="text-[11px] leading-none">{turno.timeStr}</span>
                      <span className="text-[9px] text-teal-500/70">hs</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-white text-xs">{turno.customerName}</span>
                        <span className="text-[10px] text-slate-400 font-mono">({turno.customerPhone || 'Sin tel'})</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                        <span className="text-emerald-400 font-medium">{turno.courtName}</span>
                        <span>•</span>
                        <span>Resta en mostrador: <strong className="text-slate-300">{turno.balanceArs > 0 ? formatARS(turno.balanceArs) : '$0'}</strong></span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    {turno.alreadyReminded ? (
                      <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] px-2 py-0.5 gap-1">
                        <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                        <span>Recordatorio Enviado</span>
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-800 text-slate-400 border-slate-700 text-[10px] px-2 py-0.5">
                        Pendiente
                      </Badge>
                    )}

                    <Button
                      size="sm"
                      onClick={() => handleSendReminder(turno.id)}
                      disabled={dispatchingTurnoId === turno.id}
                      className="h-8 px-3 text-xs font-bold rounded-xl bg-teal-600 hover:bg-teal-500 text-white gap-1.5 shadow-sm cursor-pointer"
                    >
                      {dispatchingTurnoId === turno.id ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Enviando...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>Enviar Recordatorio</span>
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* ─── HISTORIAL DE MENSAJES ENVIADOS ─── */}
      <div className="grid grid-cols-1 gap-6">
        <Card className="bg-slate-900 border-slate-800 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle className="text-base text-white flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
                Historial de Notificaciones Despachadas
              </CardTitle>
              <CardDescription className="text-xs text-slate-400">
                Últimos mensajes enviados automáticamente por el bot de tu club.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                if (tenantId) {
                  const updatedLogs = await getWhatsAppMessageLogs(tenantId)
                  setLogs(updatedLogs)
                  toast.success('Historial actualizado')
                }
              }}
              className="border-slate-800 text-slate-300 hover:text-white h-8 text-xs gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Actualizar</span>
            </Button>
          </CardHeader>
          <CardContent>
            {logs.length === 0 ? (
              <div className="py-12 text-center text-slate-500 space-y-2">
                <Bot className="w-10 h-10 mx-auto text-slate-700" />
                <p className="text-sm">No hay mensajes registrados aún en este club.</p>
                <p className="text-xs text-slate-600">Apenas se confirme una reserva o envíes un test, aparecerán aquí.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-800 max-h-95 overflow-y-auto pr-1">
                {logs.map((log) => (
                  <div key={log.id} className="py-3 flex items-start justify-between gap-3 text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white">{log.recipient_name}</span>
                        <span className="font-mono text-slate-400">{log.recipient_phone}</span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] uppercase font-bold ${
                            log.message_type === 'CONFIRMATION'
                              ? 'text-emerald-400 border-emerald-500/30 bg-emerald-950/20'
                              : log.message_type === 'WAITLIST_ALERT'
                              ? 'text-amber-400 border-amber-500/30 bg-amber-950/20'
                              : 'text-teal-400 border-teal-500/30 bg-teal-950/20'
                          }`}
                        >
                          {log.message_type}
                        </Badge>
                      </div>
                      <p className="text-slate-400 line-clamp-2 text-[11px] font-mono whitespace-pre-line">
                        {log.content}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <Badge className={`text-[10px] font-semibold ${
                        log.status === 'SENT' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-slate-800 text-slate-400'
                      }`}>
                        {log.status === 'SENT' ? 'ENVIADO' : 'DESPACHADO'}
                      </Badge>
                      <p className="text-[10px] text-slate-500 mt-1">
                        {new Date(log.sent_at).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
