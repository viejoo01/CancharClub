// src/lib/rate-limiter.ts
// ==============================================================================
// SISTEMA DE RATE LIMITING Y PROTECCIÓN ANTI-FUERZA BRUTA
// ==============================================================================
// Implementa algoritmo de ventana deslizante (sliding window) con soporte
// híbrido: Upstash Redis (distribuido) + Memoria Local LRU (fallback autónomo).
// ==============================================================================

import { Redis } from '@upstash/redis'

// Inicializar cliente Redis si las credenciales existen y son válidas
let redisClient: Redis | null = null
if (
  process.env.UPSTASH_REDIS_REST_URL &&
  !process.env.UPSTASH_REDIS_REST_URL.includes('mock') &&
  process.env.UPSTASH_REDIS_REST_TOKEN &&
  !process.env.UPSTASH_REDIS_REST_TOKEN.includes('mock')
) {
  try {
    redisClient = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  } catch (err) {
    console.warn('[RateLimiter] Error initializing Redis client, using in-memory store:', err)
  }
}

// Almacén en memoria de fallback con auto-limpieza
interface MemoryRecord {
  count: number
  resetAt: number
}
const memoryStore = new Map<string, MemoryRecord>()

// Limpiar periódicamente registros expirados de memoria para evitar fugas de RAM
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now()
    for (const [key, val] of memoryStore.entries()) {
      if (now > val.resetAt) {
        memoryStore.delete(key)
      }
    }
  }, 60_000)
}

export interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

/**
 * Verifica si una clave supera la cuota de peticiones permitidas en una ventana de tiempo.
 *
 * @param key Identificador único (ej: "ip:1.2.3.4:action:login")
 * @param limit Número máximo de llamadas permitidas
 * @param windowSeconds Duración de la ventana en segundos
 */
export async function checkRateLimit(
  key: string,
  limit: number,
  windowSeconds: number
): Promise<RateLimitResult> {
  const now = Date.now()
  const windowMs = windowSeconds * 1000

  // 1. Intentar con Upstash Redis si está disponible
  if (redisClient) {
    try {
      const redisKey = `ratelimit:${key}`
      const current = await redisClient.incr(redisKey)
      if (current === 1) {
        await redisClient.expire(redisKey, windowSeconds)
      }
      const ttl = await redisClient.ttl(redisKey)
      const reset = now + (ttl > 0 ? ttl * 1000 : windowMs)
      const remaining = Math.max(0, limit - current)

      return {
        success: current <= limit,
        limit,
        remaining,
        reset,
      }
    } catch (err) {
      console.warn('[RateLimiter] Redis error, falling back to memory:', err)
    }
  }

  // 2. Fallback en Memoria Local (Sliding Window / Fixed Window Reset)
  const record = memoryStore.get(key)
  if (!record || now > record.resetAt) {
    const newRecord: MemoryRecord = {
      count: 1,
      resetAt: now + windowMs,
    }
    memoryStore.set(key, newRecord)
    return {
      success: true,
      limit,
      remaining: limit - 1,
      reset: newRecord.resetAt,
    }
  }

  record.count += 1
  const remaining = Math.max(0, limit - record.count)
  const isAllowed = record.count <= limit

  return {
    success: isAllowed,
    limit,
    remaining,
    reset: record.resetAt,
  }
}

/**
 * Obtiene la IP del cliente de forma segura evaluando encabezados de proxy.
 */
export function getClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for')
  if (forwardedFor) {
    // Tomar la primera IP de la cadena (la IP real del cliente previa a Cloudflare/Vercel)
    const firstIp = forwardedFor.split(',')[0].trim()
    if (firstIp) return firstIp
  }

  const realIp = req.headers.get('x-real-ip')
  if (realIp) return realIp.trim()

  return '127.0.0.1'
}

// ─────────────────────────────────────────────────────────────────────────────
// PERFILES PRECONFIGURADOS DE SEGURIDAD
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Escudo de login para el Superadmin:
 * Máximo 5 intentos por cada 15 minutos (900 seg) por IP.
 */
export async function checkSuperadminLoginRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`superadmin:login:${ip}`, 5, 900)
}

/**
 * Escudo de autenticación de usuarios (login y registro):
 * Máximo 10 intentos por minuto por IP.
 */
export async function checkAuthRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`auth:${ip}`, 10, 60)
}

/**
 * Escudo de checkout y creación de pagos:
 * Máximo 15 peticiones de checkout por minuto por IP (previene ataques de prueba de tarjetas y spam de bots).
 */
export async function checkCheckoutRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`checkout:${ip}`, 15, 60)
}

/**
 * Escudo de consultas de disponibilidad y reservas:
 * Máximo 30 peticiones por minuto por IP.
 */
export async function checkBookingActionRateLimit(ip: string): Promise<RateLimitResult> {
  return checkRateLimit(`booking:${ip}`, 30, 60)
}
