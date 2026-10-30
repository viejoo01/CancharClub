import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { clearUserProfileServerCache } from '@/lib/auth-security'
import { logAuditEvent } from '@/lib/audit-logger'

const KNOWN_AUTH_COOKIES = [
  'sa_session',
  'canchar_tenant_id',
  'canchar_tenant_slug',
  'canchar_cached_tenant_id',
  'canchar_user_role',
  'canchar_active_venue_id',
  'canchar_active_venue_name',
  'new_club_pending_activation',
  'demo_user_role',
  'demo_user_name',
  'demo_subscription_status',
  'demo_plan_id',
  'demo_tenant_name',
  'demo_tenant_slug',
  'demo_tenant_id',
  'demo_is_active',
  'demo_has_card',
  'demo_card_last4',
  'demo_card_brand',
  'demo_card_holder',
  'demo_trial_ends_at',
  'demo_trial_forfeited',
  'demo_terms_accepted_at',
]

async function handleLogout(request: Request) {
  let userId: string | null = null
  let userEmail: string | null = null

  // 1. Invalidación efectiva y real en el servidor de Supabase Auth
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser().catch(() => ({ data: { user: null } }))
    if (user) {
      userId = user.id
      userEmail = user.email || null
    }
    // scope: 'global' revoca los refresh tokens de este usuario en la base de datos de Supabase Auth
    await supabase.auth.signOut({ scope: 'global' })
  } catch (err) {
    console.warn('[auth/logout] Advertencia al revocar sesión en Supabase Auth:', err)
  }

  // 2. Purgar caché en memoria del servidor Node.js
  clearUserProfileServerCache()

  // 3. Auditoría de seguridad del cierre de sesión
  if (userId) {
    void logAuditEvent({
      action: 'AUTH_LOGOUT',
      resource: 'auth',
      userId,
      details: { email: userEmail, path: '/auth/logout' },
    }).catch(() => {})
  }

  const origin = new URL(request.url).origin
  const response = NextResponse.redirect(`${origin}/`, { status: 303 })

  // 4. Recopilar todas las cookies enviadas por el navegador y presentes en cookieStore
  const cookieStore = await cookies()
  const rawCookieHeader = request.headers.get('cookie') || ''
  const parsedReqCookies = rawCookieHeader
    .split(';')
    .map(c => c.trim().split('=')[0])
    .filter(Boolean)
  const storeCookies = cookieStore.getAll().map(c => c.name)

  const allCandidateNames = new Set([
    ...parsedReqCookies,
    ...storeCookies,
    ...KNOWN_AUTH_COOKIES,
  ])

  // 5. Destruir en el servidor cada cookie de autenticación, sesión y token Supabase
  for (const name of allCandidateNames) {
    if (
      name.startsWith('sb-') ||
      name.startsWith('canchar_') ||
      name.startsWith('demo_') ||
      KNOWN_AUTH_COOKIES.includes(name)
    ) {
      try {
        cookieStore.delete(name)
      } catch {}

      // Expirar forzosamente en las cabeceras HTTP Set-Cookie de la respuesta
      response.cookies.delete(name)
      response.cookies.set(name, '', {
        path: '/',
        maxAge: 0,
        expires: new Date(0),
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
      })
    }
  }

  // 6. Encabezados estrictos anti-caché y purga de credenciales en navegador
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  response.headers.set('Clear-Site-Data', '"cookies"')

  return response
}

export async function POST(request: Request) {
  return handleLogout(request)
}

export async function GET(request: Request) {
  return handleLogout(request)
}
