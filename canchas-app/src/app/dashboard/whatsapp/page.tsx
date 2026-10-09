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
  RefreshCw
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { useTenantId } from '@/hooks/use-tenant-id'
import { 
  getWhatsAppBotConfig, 
  saveWhatsAppBotConfig, 
  getWhatsAppMessageLogs, 
  testWhatsAppBotMessage, 
  type WhatsAppBotConfig, 
  type AutomatedMessageLog 
} from '@/actions/whatsapp-bot.actions'

export default function WhatsAppBotPage() {
  const tenantId = useTenantId()
  const [config, setConfig] = useState<WhatsAppBotConfig | null>(null)
  const [logs, setLogs] = useState<AutomatedMessageLog[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testPhone, setTestPhone] = useState('')

  useEffect(() => {
    if (!tenantId) return
    let isMounted = true

    Promise.all([
      getWhatsAppBotConfig(tenantId),
      getWhatsAppMessageLogs(tenantId)
    ])
      .then(([cfg, logList]) => {
        if (isMounted) {
          setConfig(cfg)
          setLogs(logList)
          setLoading(false)
        }
      })
      .catch(() => {
        if (isMounted) setLoading(false)
      })

    return () => {
      isMounted = false
    }
  }, [tenantId])

  const handleToggle = async (key: keyof WhatsAppBotConfig) => {
    if (!config || !tenantId) return
    const updated = { ...config, [key]: !config[key] }
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

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-400" />
        <p className="text-sm text-slate-400">Cargando automatizaciones de WhatsApp...</p>
      </div>
    )
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
            <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30 text-xs font-semibold gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              100% OPERATIVO
            </Badge>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Notificaciones automáticas desatendidas: confirmá turnos, avisá 2 horas antes y cubrí cancelaciones al instante.
          </p>
        </div>
      </div>

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
              Apenas el jugador abona la seña o el club aprueba el turno, el bot le envía el comprobante con fecha, cancha, saldo restante y ubicación.
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
              Reduce la tasa de inasistencia (no-show) enviando un aviso con recordatorio de horario exacto y recordatorio de puntualidad.
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
              Si alguien cancela un turno pico, el bot le avisa al primero de la lista con prioridad exclusiva de 10 minutos para tomar el turno.
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-0">
            <Badge variant="outline" className={`text-[11px] ${config?.auto_waitlist_alert ? 'text-amber-400 border-amber-500/30' : 'text-slate-400 border-slate-700'}`}>
              {config?.auto_waitlist_alert ? 'Activo (Prioridad 10 min)' : 'Pausado'}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* ─── PRUEBA EN VIVO Y MONITOREO ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Formulario de Test de Mensajería */}
        <Card className="bg-slate-900 border-slate-800 lg:col-span-1 shadow-lg">
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
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold gap-2 text-sm h-10 cursor-pointer shadow-lg shadow-emerald-950/30"
              >
                {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Enviar WhatsApp de Prueba</span>
              </Button>
            </form>

            <div className="mt-6 p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs text-slate-400">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Modo de Operación Híbrido</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                El bot opera mediante integración directa en la nube de Meta y fallback inteligente a enlace instantáneo para que ninguna confirmación se pierda jamás.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Historial de Mensajes Enviados */}
        <Card className="bg-slate-900 border-slate-800 lg:col-span-2 shadow-lg">
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
              <div className="divide-y divide-slate-800 max-h-[380px] overflow-y-auto pr-1">
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
