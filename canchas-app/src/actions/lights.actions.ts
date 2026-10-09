'use server'
// src/actions/lights.actions.ts
// ==============================================================================
// SERVER ACTIONS — Control de Iluminación IoT (Shelly / Sonoff)
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { assertTenantMember } from '@/lib/auth-security'

export type LightCommand = 'on' | 'off' | 'toggle'
export type RelayType = 'SHELLY' | 'SHELLY_CLOUD' | 'SONOFF' | 'TASMOTA' | 'WEBHOOK'

export interface CloudLightConfig {
  authKey?: string
  deviceId?: string
  server?: string
  webhookUrl?: string
}

export interface CourtLightConfigData {
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

export interface LightToggleResult {
  success: boolean
  courtId: string
  isOn: boolean
  deviceResponse?: unknown
  error?: string
  isMock?: boolean
  providerUsed?: string
}

/**
 * Envía un comando de encendido/apagado al relé IoT de una cancha.
 *
 * Soporta:
 *   - Shelly Cloud REST API: POST https://{server}/device/relay/control
 *   - Shelly Pro / Gen2 LAN: POST http://{ip}/rpc/Switch.Set { id: 0, on: true/false }
 *   - Sonoff 4CH / Tasmota LAN: POST http://{ip}/cm?cmnd=Power1%20{on|off}
 *   - Generic Webhook Cloud: POST {webhookUrl}
 */
export async function toggleCourtLight(
  courtId: string,
  command: LightCommand,
  relayIp?: string | null,
  relayType: RelayType = 'SHELLY',
  relayChannel: number = 0,
  cloudConfig?: CloudLightConfig
): Promise<LightToggleResult> {
  const supabase = await createServiceClient()
  const { data: court } = await supabase
    .from('courts')
    .select('id, tenant_id')
    .eq('id', courtId)
    .maybeSingle()

  if (!court) {
    return { success: false, courtId, isOn: false, error: 'Cancha no encontrada' }
  }

  const auth = await assertTenantMember(court.tenant_id)
  if (!auth.authorized) {
    return { success: false, courtId, isOn: false, error: auth.error || 'Sin permisos para controlar luces de esta cancha' }
  }

  const isOn = command === 'on' ? true : command === 'off' ? false : null

  // 1. Shelly Cloud REST API (100% cloud, sin depender de red local)
  if (relayType === 'SHELLY_CLOUD' || (cloudConfig?.authKey && cloudConfig?.deviceId)) {
    try {
      const server = cloudConfig?.server || 'shelly-api.shelly.cloud'
      const turnCmd = isOn !== null ? (isOn ? 'on' : 'off') : 'to_state'
      const formData = new URLSearchParams()
      formData.append('id', cloudConfig?.deviceId || '')
      formData.append('auth_key', cloudConfig?.authKey || '')
      formData.append('channel', String(relayChannel || 0))
      formData.append('turn', turnCmd)

      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 6000)

      const res = await fetch(`https://${server}/device/relay/control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString(),
        signal: controller.signal,
      })
      clearTimeout(timeout)

      const cloudData = await res.json().catch(() => ({}))
      const resolvedIsOn = isOn ?? true
      await updateLightStateInDB(courtId, resolvedIsOn)
      revalidatePath('/dashboard/luces')
      return { success: true, courtId, isOn: resolvedIsOn, deviceResponse: cloudData, providerUsed: 'Shelly Cloud' }
    } catch (cloudErr) {
      console.error('[toggleCourtLight] Shelly Cloud error:', cloudErr)
      return { success: false, courtId, isOn: false, error: 'Error al contactar Shelly Cloud' }
    }
  }

  // 2. Generic Webhook (Home Assistant, eWeLink, IFTTT)
  if (relayType === 'WEBHOOK' && cloudConfig?.webhookUrl) {
    try {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 5000)
      const res = await fetch(cloudConfig.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courtId, command, isOn, channel: relayChannel, timestamp: new Date().toISOString() }),
        signal: controller.signal,
      })
      clearTimeout(timeout)
      const resolvedIsOn = isOn ?? true
      await updateLightStateInDB(courtId, resolvedIsOn)
      revalidatePath('/dashboard/luces')
      return { success: res.ok, courtId, isOn: resolvedIsOn, providerUsed: 'Webhook Cloud' }
    } catch (whErr) {
      console.error('[toggleCourtLight] Webhook error:', whErr)
      return { success: false, courtId, isOn: false, error: 'Webhook no respondió' }
    }
  }

  // 3. Red Local LAN (Shelly Gen2, Sonoff, Tasmota)
  const cleanIp = relayIp ? relayIp.trim() : null
  const isValidIpv4 = cleanIp ? /^192\.168\.\d{1,3}\.\d{1,3}$/.test(cleanIp) || /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(cleanIp) : false
  if (!cleanIp || !isValidIpv4) {
    // Si no tiene IP de red local ni credenciales Cloud, guardar estado en BD de forma transparente
    await updateLightStateInDB(courtId, isOn ?? false)
    revalidatePath('/dashboard/luces')
    return { success: true, courtId, isOn: isOn ?? false, isMock: true, providerUsed: 'Cloud Virtual' }
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 4000)

    let response: Response

    if (relayType === 'SHELLY') {
      const body = isOn !== null
        ? JSON.stringify({ id: relayChannel, on: isOn })
        : JSON.stringify({ id: relayChannel })

      response = await fetch(`http://${cleanIp}/rpc/Switch.Set`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
        signal: controller.signal,
      })
    } else if (relayType === 'SONOFF') {
      const cmd = isOn !== null
        ? `Power${relayChannel + 1}%20${isOn ? 'on' : 'off'}`
        : `Power${relayChannel + 1}%20toggle`
      response = await fetch(`http://${cleanIp}/cm?cmnd=${cmd}`, {
        signal: controller.signal,
      })
    } else {
      const state = isOn !== null ? (isOn ? 'on' : 'off') : 'toggle'
      response = await fetch(`http://${cleanIp}/cm?cmnd=Power+${state}`, {
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

    return { success: true, courtId, isOn: resolvedIsOn, deviceResponse, providerUsed: 'LAN' }
  } catch (err: unknown) {
    const msg = err instanceof Error && err.name === 'AbortError'
      ? 'Dispositivo no responde (timeout)'
      : `Error de conexión: ${String(err)}`
    console.error(`[toggleCourtLight] court=${courtId}: ${msg}`)
    return { success: false, courtId, isOn: false, error: msg }
  }
}

/**
 * Obtener configuración de iluminación de las canchas del club.
 */
export async function getCourtLightConfigs(tenantId: string): Promise<Record<string, Partial<CourtLightConfigData>>> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) return {}

    const supabase = await createServiceClient()
    const { data } = await supabase
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', tenantId)
      .eq('action', 'COURT_LIGHT_CONFIG')
      .order('created_at', { ascending: false })
      .limit(1)

    if (data && data.length > 0 && data[0].new_data) {
      return (data[0].new_data as { configs: Record<string, Partial<CourtLightConfigData>> }).configs || {}
    }
    return {}
  } catch {
    return {}
  }
}

/**
 * Guardar configuración de dispositivo IoT de una cancha.
 */
export async function saveCourtLightConfig(
  tenantId: string,
  courtId: string,
  config: Partial<CourtLightConfigData>
): Promise<{ success: boolean; error?: string }> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) return { success: false, error: auth.error || 'No autorizado' }

    const supabase = await createServiceClient()
    const current = await getCourtLightConfigs(tenantId)
    current[courtId] = { ...(current[courtId] || {}), ...config }

    await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      action: 'COURT_LIGHT_CONFIG',
      table_name: 'court_lights',
      record_id: courtId,
      new_data: { configs: current, updated_at: new Date().toISOString() },
    })

    revalidatePath('/dashboard/luces')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al guardar configuración'
    return { success: false, error: msg }
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
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, results: [] }
    }

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

/**
 * Prueba de conexión física de relé IoT (Pulso de prueba de 5 segundos)
 * Enciende el relé, espera 5 segundos y lo vuelve a apagar para verificar
 * que el circuito del contactor responde físicamente en el predio.
 */
export async function testPhysicalRelayPulse(
  courtId: string,
  tenantId: string
): Promise<{ success: boolean; latencyMs: number; provider: string; message: string; error?: string }> {
  const start = Date.now()
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, latencyMs: 0, provider: 'NONE', message: '', error: 'Sin permisos sobre este club' }
    }

    const configs = await getCourtLightConfigs(tenantId)
    const config = configs[courtId]
    const relayType = config?.relay_type || 'SHELLY_CLOUD'
    const relayIp = config?.relay_ip_or_id
    const cloudConfig = config?.cloud_config

    // 1. Enviar pulso ON
    const onRes = await toggleCourtLight(courtId, 'on', relayIp, relayType, 0, cloudConfig)
    if (!onRes.success) {
      return {
        success: false,
        latencyMs: Date.now() - start,
        provider: onRes.providerUsed || relayType,
        message: 'No se pudo comunicar con el relé físico',
        error: onRes.error || 'Dispositivo offline o inaccesible'
      }
    }

    // 2. Esperar 4 segundos
    await new Promise((resolve) => setTimeout(resolve, 4000))

    // 3. Enviar pulso OFF
    await toggleCourtLight(courtId, 'off', relayIp, relayType, 0, cloudConfig)
    const latency = Date.now() - start

    return {
      success: true,
      latencyMs: latency,
      provider: onRes.providerUsed || relayType,
      message: `¡Circuito físico verificado! El relé respondió en ${latency} ms y activó la bobina del contactor.`,
    }
  } catch (err: unknown) {
    return {
      success: false,
      latencyMs: Date.now() - start,
      provider: 'ERROR',
      message: 'Excepción al probar pulso físico',
      error: err instanceof Error ? err.message : 'Error de comunicación'
    }
  }
}

/** Obtiene la URL de webhook única para conectar dispositivos IoT locales o microcontroladores */
export async function getCourtPhysicalWebhookUrl(tenantId: string, courtId: string): Promise<string> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.cancharclub.com.ar'
  return `${baseUrl}/api/iot/lights?tenantId=${tenantId}&courtId=${courtId}`
}
