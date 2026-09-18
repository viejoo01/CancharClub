// src/app/api/superadmin/login/route.ts
// Endpoint de autenticación exclusivo del superadmin.
// Las credenciales viven en variables de entorno del servidor (nunca expuestas al cliente).
// La sesión usa una cookie HttpOnly + Secure que dura hasta que el navegador se cierre
// (session cookie – sin maxAge = no se persiste en disco).

import { NextResponse, type NextRequest } from 'next/server'
import { createHmac } from 'crypto'

const COOKIE_NAME = 'sa_session'

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
    const payload = parts.join(':')
    const expected = createHmac('sha256', secret).update(payload).digest('hex')
    return sig === expected
  } catch {
    return false
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { username, password } = body as { username?: string; password?: string }

  const validUser = process.env.SUPERADMIN_USERNAME
  const validPass = process.env.SUPERADMIN_PASSWORD
  const secret    = process.env.SUPERADMIN_SESSION_SECRET

  if (!validUser || !validPass || !secret) {
    return NextResponse.json({ error: 'Superadmin no configurado en el servidor.' }, { status: 500 })
  }

  if (username !== validUser || password !== validPass) {
    // Pequeño delay para dificultar ataques de fuerza bruta
    await new Promise(r => setTimeout(r, 600))
    return NextResponse.json({ error: 'Credenciales incorrectas.' }, { status: 401 })
  }

  const token = signToken(username, secret)

  const res = NextResponse.json({ ok: true })
  // Session cookie: sin maxAge ni expires → se elimina al cerrar el navegador
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/superadmin',
    // Sin maxAge → cookie de sesión (no persiste en disco)
  })

  return res
}

export async function DELETE() {
  // Logout: eliminar la cookie de sesión
  const res = NextResponse.json({ ok: true })
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
