// src/app/api/superadmin/login/route.ts
// Endpoint de autenticación exclusivo del superadmin.
// Las credenciales viven en variables de entorno del servidor (nunca expuestas al cliente).
// La sesión usa una cookie HttpOnly + Secure que dura hasta que el navegador se cierre
// (session cookie – sin maxAge = no se persiste en disco).

import { NextResponse, type NextRequest } from 'next/server'
import { createHmac, timingSafeEqual, createHash } from 'crypto'
import { checkSuperadminLoginRateLimit, getClientIp } from '@/lib/rate-limiter'

const COOKIE_NAME = 'sa_session'
const SESSION_MAX_AGE_MS = 8 * 60 * 60 * 1000 // 8 horas máximo

function signToken(username: string, secret: string): string {
  const payload = `${username}:${Date.now()}`
  const sig = createHmac('sha256', secret).update(payload).digest('hex')
  return Buffer.from(`${payload}:${sig}`).toString('base64url')
}

function verifyToken(token: string, secret: string): boolean {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length < 3) return false
    const sig = parts.pop()!
    const timestampStr = parts[parts.length - 1]
    const timestamp = parseInt(timestampStr, 10)

    // Verificar expiración de sesión (8 horas)
    if (isNaN(timestamp) || Date.now() - timestamp > SESSION_MAX_AGE_MS) {
      return false
    }

    const payload = parts.join(':')
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    return timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))
  } catch {
    return false
  }
}

/**
 * Comparación segura en tiempo constante para evitar ataques de temporización.
 */
function safeCompareStrings(a: string, b: string): boolean {
  const hashA = createHash('sha256').update(a || '').digest()
  const hashB = createHash('sha256').update(b || '').digest()
  return timingSafeEqual(hashA, hashB)
}

export async function POST(req: NextRequest) {
  // 1. ESCUDO ANTI-FUERZA BRUTA: Máximo 5 intentos por cada 15 minutos por IP
  const clientIp = getClientIp(req)
  const rateLimit = await checkSuperadminLoginRateLimit(clientIp)
  if (!rateLimit.success) {
    return NextResponse.json(
      { error: 'Demasiados intentos fallidos. Panel bloqueado temporalmente por 15 minutos.' },
      { status: 429 }
    )
  }

  const body = await req.json().catch(() => ({}))
  const { username, password } = body as { username?: string; password?: string }

  const validUser = process.env.SUPERADMIN_USERNAME
  const validPass = process.env.SUPERADMIN_PASSWORD
  const secret    = process.env.SUPERADMIN_SESSION_SECRET

  if (!validUser || !validPass || !secret) {
    return NextResponse.json({ error: 'Superadmin no configurado en el servidor.' }, { status: 500 })
  }

  // Comparación en tiempo constante
  const isUserValid = safeCompareStrings(username || '', validUser)
  const isPassValid = safeCompareStrings(password || '', validPass)

  if (!isUserValid || !isPassValid) {
    // Delay de seguridad anti-fuerza bruta
    await new Promise(r => setTimeout(r, 600))
    return NextResponse.json({ error: 'Credenciales incorrectas.' }, { status: 401 })
  }

  const token = signToken(username!, secret)

  const res = NextResponse.json({ ok: true })
  // Session cookie: HttpOnly, Secure, SameSite=Strict con path / para cubrir todas las Server Actions
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
  })

  return res
}

export async function DELETE() {
  // Logout: eliminar la cookie de sesión en ambos paths
  const res = NextResponse.json({ ok: true })
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0,
  })
  res.cookies.set(COOKIE_NAME, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/superadmin',
    maxAge: 0,
  })
  return res
}

/** Utilidad exportada para ser usada en middleware (verificación de sesión) */
export { verifyToken, COOKIE_NAME }
