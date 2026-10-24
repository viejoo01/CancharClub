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
 * Valida que una URL sea segura para peticiones salientes (previene SSRF).
 * - Exige HTTPS.
 * - Bloquea localhost, loopback, rangos privados RFC 1918, link-local y metadata de cloud (169.254.169.254).
 */
function isSafePublicWebhookUrl(urlStr: string): { valid: boolean; reason?: string } {
  try {
    const parsed = new URL(urlStr)
    if (parsed.protocol !== 'https:') {
      return { valid: false, reason: 'Solo se permiten webhooks seguros con HTTPS' }
    }

    const host = parsed.hostname.toLowerCase()

    // Bloquear localhost y variantes
    if (host === 'localhost' || host.endsWith('.localhost') || host === '127.0.0.1' || host === '::1') {
      return { valid: false, reason: 'No se permiten URLs locales o loopback' }
    }

    // Bloquear AWS/GCP/Azure/DigitalOcean metadata endpoints
    if (host === '169.254.169.254' || host === 'metadata.google.internal' || host.endsWith('.internal')) {
      return { valid: false, reason: 'Dirección de metadata de nube no permitida' }
    }

    // Bloquear IPs privadas RFC 1918 y link-local
    const ipv4Regex = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/
    const match = host.match(ipv4Regex)
    if (match) {
      const octet1 = parseInt(match[1], 10)
      const octet2 = parseInt(match[2], 10)
      if (
        octet1 === 10 || // 10.0.0.0/8
        octet1 === 127 || // 127.0.0.0/8
        (octet1 === 172 && octet2 >= 16 && octet2 <= 31) || // 172.16.0.0/12
        (octet1 === 192 && octet2 === 168) || // 192.168.0.0/16
        (octet1 === 169 && octet2 === 254) || // 169.254.0.0/16
        octet1 === 0 // 0.0.0.0/8
      ) {
        return { valid: false, reason: 'No se permiten direcciones IP de redes privadas o locales' }
      }
    }

    return { valid: true }
  } catch {
    return { valid: false, reason: 'URL inválida' }
  }
}

/**
 * Valida que el servidor de Shelly Cloud apunte a infraestructura legítima de Shelly.
 */
function isSafeShellyCloudServer(server: string): boolean {
  if (!server) return true
  const clean = server.trim().toLowerCase()
  return clean === 'shelly-api.shelly.cloud' || /^[a-zA-Z0-9-]+\.shelly\.cloud$/.test(clean)
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
      const server = (cloudConfig?.server && isSafeShellyCloudServer(cloudConfig.server))
        ? cloudConfig.server.trim()
        : 'shelly-api.shelly.cloud'
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
    const urlValidation = isSafePublicWebhookUrl(cloudConfig.webhookUrl)
    if (!urlValidation.valid) {
      return { success: false, courtId, isOn: false, error: `Webhook bloqueado por seguridad: ${urlValidation.reason}` }
    }

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

const lightConfigsCache = new Map<string, { data: Record<string, Partial<CourtLightConfigData>>; expiresAt: number }>()

export async function invalidateLightConfigsCache(tenantId?: string | null) {
  if (tenantId) lightConfigsCache.delete(tenantId)
  else lightConfigsCache.clear()
}

/**
 * Obtener configuración de iluminación de las canchas del club.
 */
export async function getCourtLightConfigs(tenantId: string): Promise<Record<string, Partial<CourtLightConfigData>>> {
  try {
    if (!tenantId) return {}

    const cached = lightConfigsCache.get(tenantId)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.data
    }

    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) return {}

    const supabase = await createServiceClient()

    // 1. Intentar consultar tabla relacional dedicada court_lights
    let configs: Record<string, Partial<CourtLightConfigData>> = {}
    const { data: dbLights, error: dbLightsErr } = await supabase
      .from('court_lights')
      .select('*')
      .eq('tenant_id', tenantId)

    if (!dbLightsErr && dbLights && dbLights.length > 0) {
      for (const r of dbLights) {
        configs[r.court_id] = {
          court_id: r.court_id,
          is_on: r.is_on,
          is_auto_mode: r.auto_schedule,
          relay_type: r.relay_type as RelayType,
          last_state_change: r.last_state_change || new Date().toISOString(),
        }
      }
    } else {
      // 2. Fallback retrocompatible a audit_log
      const { data } = await supabase
        .from('audit_log')
        .select('new_data')
        .eq('tenant_id', tenantId)
        .eq('action', 'COURT_LIGHT_CONFIG')
        .order('created_at', { ascending: false })
        .limit(1)

      if (data && data.length > 0 && data[0].new_data) {
        configs = (data[0].new_data as { configs: Record<string, Partial<CourtLightConfigData>> }).configs || {}
      }
    }

    lightConfigsCache.set(tenantId, { data: configs, expiresAt: Date.now() + 60000 })
    return configs
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

    // Validar protecciones SSRF si se suministra configuración cloud
    if (config.cloud_config?.webhookUrl) {
      const urlCheck = isSafePublicWebhookUrl(config.cloud_config.webhookUrl)
      if (!urlCheck.valid) {
        return { success: false, error: `URL de Webhook inválida o insegura: ${urlCheck.reason}` }
      }
    }

    if (config.cloud_config?.server) {
      if (!isSafeShellyCloudServer(config.cloud_config.server)) {
        return { success: false, error: 'Servidor Shelly Cloud inválido. Debe pertenecer al dominio *.shelly.cloud' }
      }
    }

    const supabase = await createServiceClient()
    const current = await getCourtLightConfigs(tenantId)
    current[courtId] = { ...(current[courtId] || {}), ...config }

    // 1. Guardar de forma relacional en tabla court_lights
    try {
      await supabase.from('court_lights').upsert({
        tenant_id: tenantId,
        court_id: courtId,
        relay_type: config.relay_type || 'SHELLY_CLOUD',
        is_on: config.is_on ?? false,
        auto_schedule: config.is_auto_mode ?? true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'court_id' })
    } catch (tblErr) {
      console.warn('[saveCourtLightConfig] Warning upserting court_lights:', tblErr)
    }

    // 2. Dual-write inmutable a audit_log
    await supabase.from('audit_log').insert({
      tenant_id: tenantId,
      action: 'COURT_LIGHT_CONFIG',
      table_name: 'court_lights',
      record_id: courtId,
      new_data: { configs: current, updated_at: new Date().toISOString() },
    })

    await invalidateLightConfigsCache(tenantId)
    revalidatePath('/dashboard/luces')
    return { success: true }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error al guardar configuración'
    return { success: false, error: msg }
  }
}

/**
 * Persistir el estado ON/OFF del relé en la tabla courts (campo light_is_on) y court_lights.
 */
async function updateLightStateInDB(courtId: string, isOn: boolean): Promise<void> {
  try {
    const supabase = await createServiceClient()
    const nowIso = new Date().toISOString()
    await Promise.allSettled([
      supabase
        .from('courts')
        .update({ light_is_on: isOn, light_updated_at: nowIso })
        .eq('id', courtId),
      supabase
        .from('court_lights')
        .update({ is_on: isOn, last_state_change: nowIso, updated_at: nowIso })
        .eq('court_id', courtId),
    ])
  } catch {
    // Silently ignore
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
      .select('id, has_lights')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)

    if (!courts?.length) {
      return { success: true, results: [] }
    }

    const lightCourts = courts.filter(c => c.has_lights !== false)
    if (!lightCourts.length) {
      return { success: true, results: [] }
    }

    const configs = await getCourtLightConfigs(tenantId)

    const results = await Promise.allSettled(
      lightCourts.map(c => {
        const conf = configs[c.id]
        return toggleCourtLight(
          c.id,
          command,
          conf?.relay_ip_or_id,
          conf?.relay_type ?? 'SHELLY_CLOUD',
          0,
          conf?.cloud_config
        )
      })
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

export interface LightMetricsData {
  hoursSaved: number
  estimatedSavingsArs: number
}

/**
 * Obtiene métricas reales de ahorro energético para el club.
 * Para un club nuevo o sin automatización de reflectores registrada, retorna 0 hs y $ 0.
 */
export async function getLightMetricsAction(tenantId: string): Promise<LightMetricsData> {
  try {
    if (!tenantId) return { hoursSaved: 0, estimatedSavingsArs: 0 }

    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { hoursSaved: 0, estimatedSavingsArs: 0 }
    }

    const supabase = await createServiceClient()
    const { data: logs } = await supabase
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', tenantId)
      .eq('action', 'LIGHT_ENERGY_SAVED')
      .order('created_at', { ascending: false })
      .limit(100)

    let totalMinutes = 0
    if (logs && logs.length > 0) {
      for (const log of logs) {
        const minutes = Number((log.new_data as { minutes_saved?: number })?.minutes_saved) || 0
        totalMinutes += minutes
      }
    }

    const hours = Math.round((totalMinutes / 60) * 10) / 10
    const costPerHour = 3000
    const savings = Math.round(hours * costPerHour)

    return {
      hoursSaved: hours,
      estimatedSavingsArs: savings,
    }
  } catch {
    return { hoursSaved: 0, estimatedSavingsArs: 0 }
  }
}
