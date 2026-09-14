'use server'
// src/actions/lights.actions.ts
// ==============================================================================
// SERVER ACTIONS — Control de Iluminación IoT (Shelly / Sonoff)
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type LightCommand = 'on' | 'off' | 'toggle'

export interface LightToggleResult {
  success: boolean
  courtId: string
  isOn: boolean
  deviceResponse?: unknown
  error?: string
  isMock?: boolean
}

/**
 * Envía un comando de encendido/apagado al relé IoT de una cancha.
 *
 * Soporta:
 *   - Shelly Pro / Gen2: POST http://{ip}/rpc/Switch.Set   { id: 0, on: true/false }
 *   - Sonoff 4CH / NSPanel: POST http://{ip}/cm?cmnd=Power1%20{on|off}
 *   - Tasmota genérico: GET http://{ip}/cm?cmnd=Power+{on|off}
 *
 * Si el dispositivo no responde (timeout 4s), devuelve error sin crashear.
 * En entorno de desarrollo / sin IP configurada, simula la acción.
 */
export async function toggleCourtLight(
  courtId: string,
  command: LightCommand,
  relayIp?: string | null,
  relayType: 'SHELLY' | 'SONOFF' | 'TASMOTA' = 'SHELLY',
  relayChannel: number = 0
): Promise<LightToggleResult> {
  const isOn = command === 'on' ? true : command === 'off' ? false : null

  // Si no hay IP configurada, modo simulado
  if (!relayIp || relayIp.startsWith('192.168') === false) {
    console.log(`[lights] Modo simulado — court ${courtId} → ${command}`)
    // Guardar estado en BD de todas formas
    await updateLightStateInDB(courtId, isOn ?? false)
    return { success: true, courtId, isOn: isOn ?? false, isMock: true }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000) // 4s timeout

    let response: Response

    if (relayType === 'SHELLY') {
      // Shelly Gen2+ RPC API
      const body = isOn !== null
        ? JSON.stringify({ id: relayChannel, on: isOn })
        : JSON.stringify({ id: relayChannel })

      response = await fetch(`http://${relayIp}/rpc/Switch.Set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      })
    } else if (relayType === 'SONOFF') {
      // Sonoff eWeLink Local API (DIY mode / Tasmota)
      const cmd = isOn !== null
        ? `Power${relayChannel + 1}%20${isOn ? 'on' : 'off'}`
        : `Power${relayChannel + 1}%20toggle`
      response = await fetch(`http://${relayIp}/cm?cmnd=${cmd}`, {
        signal: controller.signal,
      })
    } else {
      // Tasmota genérico
      const state = isOn !== null ? (isOn ? 'on' : 'off') : 'toggle'
      response = await fetch(`http://${relayIp}/cm?cmnd=Power+${state}`, {
        signal: controller.signal,
      })
    }

    clearTimeout(timeout)

    if (!response.ok) {
      return { success: false, courtId, isOn: false, error: `HTTP ${response.status}` }
    }

    const deviceResponse = await response.json().catch(() => ({}))
    const resolvedIsOn   = isOn ?? (deviceResponse?.ison ?? false)

    await updateLightStateInDB(courtId, resolvedIsOn)
    revalidatePath('/dashboard/luces')

    return { success: true, courtId, isOn: resolvedIsOn, deviceResponse }
  } catch (err: unknown) {
    const msg = err instanceof Error && err.name === 'AbortError'
      ? 'Dispositivo no responde (timeout)'
      : `Error de conexión: ${String(err)}`
    console.error(`[toggleCourtLight] court=${courtId}: ${msg}`)
    return { success: false, courtId, isOn: false, error: msg }
  }
}

/**
 * Persistir el estado ON/OFF del relé en la tabla courts (campo light_is_on).
 * Si el campo no existe aún en la BD, falla silenciosamente.
 */
async function updateLightStateInDB(courtId: string, isOn: boolean): Promise<void> {
  try {
    const supabase = await createServiceClient()
    await supabase
      .from('courts')
      .update({ light_is_on: isOn, light_updated_at: new Date().toISOString() })
      .eq('id', courtId)
  } catch {
    // Silently ignore — el campo puede no existir aún
  }
}

/**
 * Encender/apagar todas las luces de un tenant a la vez.
 */
export async function toggleAllLights(
  tenantId: string,
  command: 'on' | 'off'
): Promise<{ success: boolean; results: LightToggleResult[] }> {
  try {
    const supabase = await createServiceClient()
    const { data: courts } = await supabase
      .from('courts')
      .select('id, relay_ip, relay_type, relay_channel')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .eq('has_lighting', true)

    if (!courts?.length) {
      return { success: true, results: [] }
    }

    const results = await Promise.allSettled(
      courts.map(c =>
        toggleCourtLight(
          c.id,
          command,
          c.relay_ip,
          c.relay_type ?? 'SHELLY',
          c.relay_channel ?? 0
        )
      )
    )

    const settled = results.map(r =>
      r.status === 'fulfilled'
        ? r.value
        : { success: false, courtId: '', isOn: false, error: 'Error desconocido' }
    )

    return { success: true, results: settled }
  } catch (err) {
    console.error('[toggleAllLights] Error:', err)
    return { success: false, results: [] }
  }
}
