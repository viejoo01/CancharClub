// src/lib/env.ts
// ==============================================================================
// VALIDACIÓN Y GESTIÓN CENTRALIZADA DE VARIABLES DE ENTORNO
// ==============================================================================
// Verifica la existencia y formato de las variables críticas en el arranque.
// ==============================================================================

export interface AppEnv {
  NODE_ENV: 'development' | 'production' | 'test'
  isProduction: boolean
  isDevelopment: boolean
  
  // Supabase
  supabaseUrl: string
  supabaseAnonKey: string
  supabaseServiceRoleKey: string

  // Superadmin
  superadminUsername?: string
  superadminSessionSecret?: string
  superadminUserId?: string

  // Upstash Redis
  upstashRedisUrl?: string
  upstashRedisToken?: string
  hasDistributedRedis: boolean

  // Mercado Pago
  mpAccessToken?: string
  mpWebhookSecret?: string

  // App
  appUrl: string
  appName: string
}

function getEnvVar(key: string, required = false, fallback = ''): string {
  const value = process.env[key] || fallback
  if (required && !value && process.env.NODE_ENV === 'production') {
    throw new Error(`[env] ERROR CRÍTICO: La variable de entorno obligatoria "${key}" no está definida.`)
  }
  return value
}

function isUrl(str: string): boolean {
  try {
    new URL(str)
    return true
  } catch {
    return false
  }
}

/**
 * Realiza un diagnóstico exhaustivo de la configuración del entorno.
 * Reporta advertencias y variables faltantes de forma estructurada.
 */
export function validateEnvironment(): { valid: boolean; warnings: string[]; errors: string[] } {
  const warnings: string[] = []
  const errors: string[] = []
  const isProd = process.env.NODE_ENV === 'production'

  // 1. Supabase
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const supabaseService = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    errors.push('NEXT_PUBLIC_SUPABASE_URL no está configurada.')
  } else if (!isUrl(supabaseUrl)) {
    errors.push(`NEXT_PUBLIC_SUPABASE_URL no es una URL válida: "${supabaseUrl}".`)
  }

  if (!supabaseAnon) {
    errors.push('NEXT_PUBLIC_SUPABASE_ANON_KEY no está configurada.')
  }

  if (!supabaseService) {
    if (isProd) {
      errors.push('SUPABASE_SERVICE_ROLE_KEY es requerida en producción para operaciones administrativas y multi-tenant.')
    } else {
      warnings.push('SUPABASE_SERVICE_ROLE_KEY no está configurada en desarrollo.')
    }
  }

  // 2. Superadmin
  const saSecret = process.env.SUPERADMIN_SESSION_SECRET
  if (!saSecret) {
    if (isProd) {
      errors.push('SUPERADMIN_SESSION_SECRET no está configurada. El panel Superadmin no podrá emitir sesiones seguras.')
    } else {
      warnings.push('SUPERADMIN_SESSION_SECRET no está configurada en desarrollo.')
    }
  } else if (saSecret.length < 32) {
    warnings.push('SUPERADMIN_SESSION_SECRET tiene menos de 32 caracteres. Se recomienda una clave criptográfica de alta entropía.')
  }

  // 3. Upstash Redis
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN
  const hasRedis = Boolean(redisUrl && redisToken && !redisUrl.includes('mock') && !redisToken.includes('mock'))

  if (!hasRedis && isProd) {
    warnings.push(
      'UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN no están configurados en producción. ' +
      'El sistema utilizará almacenamiento en memoria local (no distribuido entre instancias serverless).'
    )
  }

  // 4. Mercado Pago
  const mpToken = process.env.MP_ACCESS_TOKEN
  if (!mpToken && isProd) {
    warnings.push('MP_ACCESS_TOKEN no está configurada. Los cobros de suscripción y pagos online estarán deshabilitados.')
  }

  const mpWebhook = process.env.MP_WEBHOOK_SECRET
  if (!mpWebhook && isProd) {
    warnings.push('MP_WEBHOOK_SECRET no está configurada. Las firmas de webhooks de Mercado Pago no podrán validarse criptográficamente.')
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  }
}

// Ejecutar validación diagnóstica (solo logs informativos en consola)
if (typeof window === 'undefined') {
  const result = validateEnvironment()
  if (result.errors.length > 0) {
    console.error('[env] 🚨 ERRORES EN VARIABLES DE ENTORNO:\n' + result.errors.map(e => `  - ${e}`).join('\n'))
  }
  if (result.warnings.length > 0 && process.env.NODE_ENV === 'production') {
    console.warn('[env] ⚠️ ADVERTENCIAS DE CONFIGURACIÓN:\n' + result.warnings.map(w => `  - ${w}`).join('\n'))
  }
}

export const env: AppEnv = {
  NODE_ENV: (process.env.NODE_ENV as AppEnv['NODE_ENV']) || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isDevelopment: process.env.NODE_ENV !== 'production',

  supabaseUrl: getEnvVar('NEXT_PUBLIC_SUPABASE_URL', false, 'https://placeholder.supabase.co'),
  supabaseAnonKey: getEnvVar('NEXT_PUBLIC_SUPABASE_ANON_KEY', false, 'placeholder-anon-key'),
  supabaseServiceRoleKey: getEnvVar('SUPABASE_SERVICE_ROLE_KEY', false, 'placeholder-service-key'),

  superadminUsername: process.env.SUPERADMIN_USERNAME,
  superadminSessionSecret: process.env.SUPERADMIN_SESSION_SECRET,
  superadminUserId: process.env.SUPERADMIN_USER_ID,

  upstashRedisUrl: process.env.UPSTASH_REDIS_REST_URL,
  upstashRedisToken: process.env.UPSTASH_REDIS_REST_TOKEN,
  hasDistributedRedis: Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN &&
    !process.env.UPSTASH_REDIS_REST_URL.includes('mock')
  ),

  mpAccessToken: process.env.MP_ACCESS_TOKEN,
  mpWebhookSecret: process.env.MP_WEBHOOK_SECRET,

  appUrl: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
  appName: process.env.NEXT_PUBLIC_APP_NAME || 'CancharClub',
}
