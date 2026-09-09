'use client'

import { useState } from 'react'
import { 
  Zap, 
  Lightbulb, 
  Power, 
  Leaf, 
  DollarSign, 
  Wifi, 
  CalendarCheck
} from 'lucide-react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { formatARS } from '@/lib/utils'
import { toast } from 'sonner'
import type { CourtLightConfig } from '@/types/database'

export default function LucesPage() {
  const [courts, setCourts] = useState<CourtLightConfig[]>([
    {
      court_id: 'c1',
      court_name: 'Cancha 1 (Panorámica)',
      is_on: true,
      is_auto_mode: true,
      pre_turn_minutes: 5,
      post_turn_minutes: 5,
      relay_ip_or_id: '192.168.1.120 (Shelly Pro 4PM)',
      last_state_change: '19:55 hs (Encendido automático por turno)',
    },
    {
      court_id: 'c2',
      court_name: 'Cancha 2 (Techada)',
      is_on: true,
      is_auto_mode: true,
      pre_turn_minutes: 5,
      post_turn_minutes: 5,
      relay_ip_or_id: '192.168.1.121 (Shelly Pro 4PM)',
      last_state_change: '19:55 hs (Encendido automático por turno)',
    },
    {
      court_id: 'c3',
      court_name: 'Cancha 3 (Blindex)',
      is_on: false,
      is_auto_mode: true,
      pre_turn_minutes: 5,
      post_turn_minutes: 5,
      relay_ip_or_id: '192.168.1.122 (Sonoff 4CH Pro)',
      last_state_change: '18:35 hs (Apagado automático por cancha vacía)',
    },
    {
      court_id: 'c4',
      court_name: 'Fútbol 5 (Sintético)',
      is_on: false,
      is_auto_mode: false,
      pre_turn_minutes: 5,
      post_turn_minutes: 5,
      relay_ip_or_id: '192.168.1.123 (Sonoff 4CH Pro)',
      last_state_change: 'Modo manual (Apagada)',
    },
  ])

  const handleToggleLight = (courtId: string, current: boolean) => {
    setCourts(prev => prev.map(c => {
      if (c.court_id === courtId) {
        const next = !current
        return {
          ...c,
          is_on: next,
          last_state_change: `${new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })} hs (Acción manual del operador)`,
        }
      }
      return c
    }))

    toast.success(current ? 'Iluminación de cancha apagada' : 'Iluminación encendida', {
      description: 'Comando enviado al relé IoT exitosamente.'
    })
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

  const activeLightsCount = courts.filter(c => c.is_on).length
  const autoModeCount = courts.filter(c => c.is_auto_mode).length

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-amber-400 font-semibold text-xs tracking-wider uppercase mb-1">
            <Zap className="w-4 h-4" />
            Domótica & Control de Energía (IoT)
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Control Inteligente de Iluminación
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Automatización de reflectores LED: encendido 5 min antes del partido y apagado automático al finalizar el turno.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/40 text-xs py-1 px-3 flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5" />
            <span>Relés Conectados (Shelly / Sonoff)</span>
          </Badge>
        </div>
      </div>

      {/* KPI Cards de Ahorro y Eficiencia */}
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

      {/* Grid de Canchas e Interruptores */}
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

              <CardDescription className="text-xs text-slate-400 flex items-center gap-2 mt-1">
                <span className="font-mono text-[11px] text-slate-500">{court.relay_ip_or_id}</span>
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
    </div>
  )
}
