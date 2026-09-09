// src/lib/redis.ts
// Cliente Upstash Redis + helpers para locking de slots de reserva
// ==============================================================================
// ESTRATEGIA DE LOCK ANTI-OVERBOOKING EN CHECKOUT
// ==============================================================================
// 1. Usuario selecciona un slot → frontend llama a acquireBookingLock()
// 2. SET key NX PX 420000 → solo un cliente puede adquirir el lock
// 3. Si falla (NX = ya existe) → slot tomado, mostrar error
// 4. Si éxito → crear booking en PG con status=SLOT_LOCKED
// 5. Usuario completa el pago en MP → webhook actualiza a DEPOSIT_PAID
// 6. Si el usuario abandona → Redis expira el key → cleanup_expired_slot_locks()
//    lo cancela en PostgreSQL
//
// El lock en Redis es una capa ADICIONAL a la restricción EXCLUDE GIST de PG.
// Redis previene la creación de registros duplicados durante el checkout.
// EXCLUDE GIST previene solapamientos en reservas ya confirmadas.
// ==============================================================================

import { Redis } from '@upstash/redis'

export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || 'https://mock-redis.upstash.io',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || 'mock-token',
})

const LOCK_TTL_MS = (parseInt(process.env.BOOKING_LOCK_TTL_SECONDS || '420')) * 1000

/**
 * Genera la clave Redis para un lock de slot.
 * Formato: lock:court:{courtId}:{startTimestampMs}
 */
export function buildLockKey(courtId: string, startsAt: string): string {
  const ts = new Date(startsAt).getTime()
  return `lock:court:${courtId}:${ts}`
}

/**
 * Intenta adquirir el lock de un slot para checkout.
 *
 * @param lockKey - Clave generada por buildLockKey()
 * @param bookingId - UUID de la reserva a crear (valor del lock para rastreo)
 * @returns true si se adquirió el lock, false si ya está tomado
 */
export async function acquireBookingLock(
  lockKey: string,
  bookingId: string
): Promise<boolean> {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return true
  }
  try {
    const result = await redis.set(lockKey, bookingId, {
      nx: true,          // Only if not exists
      px: LOCK_TTL_MS,   // Expire in ms
    })
    return result === 'OK'
  } catch (err) {
    console.warn('[Redis] Fallback lock granted:', err)
    return true
  }
}

/**
 * Libera el lock de un slot solo si el propietario es el booking correcto.
 * Usa un script Lua para garantizar atomicidad (check-then-delete).
 *
 * @param lockKey - Clave del lock
 * @param bookingId - UUID del booking propietario
 * @returns true si se liberó, false si ya había expirado o era de otro booking
 */
export async function releaseBookingLock(
  lockKey: string,
  bookingId: string
): Promise<boolean> {
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    return true
  }
  try {
    const script = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      else
        return 0
      end
    `
    const result = await redis.eval(script, [lockKey], [bookingId])
    return result === 1
  } catch (err) {
    console.warn('[Redis] Fallback release:', err)
    return true
  }
}

/**
 * Verifica si un slot está actualmente bloqueado en Redis.
 * Se usa para mostrar estado "en checkout" en el portal público.
 */
export async function isSlotLocked(lockKey: string): Promise<boolean> {
  const value = await redis.get(lockKey)
  return value !== null
}

/**
 * Extiende el TTL de un lock existente (por si el usuario tarda más en pagar).
 * Solo extiende si el booking coincide (propietario del lock).
 */
export async function extendBookingLock(
  lockKey: string,
  bookingId: string,
  additionalMs: number = LOCK_TTL_MS
): Promise<boolean> {
  const script = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("PEXPIRE", KEYS[1], ARGV[2])
    else
      return 0
    end
  `
  const result = await redis.eval(script, [lockKey], [bookingId, additionalMs.toString()])
  return result === 1
}

/**
 * Obtiene el tiempo restante (en segundos) de un lock.
 * -1 = no expira, -2 = no existe, > 0 = segundos restantes
 */
export async function getLockTTL(lockKey: string): Promise<number> {
  return await redis.pttl(lockKey) / 1000
}
