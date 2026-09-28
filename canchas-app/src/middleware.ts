// src/middleware.ts
// ==============================================================================
// MIDDLEWARE DE CONTROL DE ACCESO, MULTI-TENANT & DUNNING SYSTEM
// ==============================================================================
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/sumar-club',        // Landing para dueños de clubes
  '/mis-reservas',      // Consulta de reservas de jugadores
  '/club',              // Portal público por slug
  '/reserva',           // Confirmación y estado público de reservas
  '/auth',              // Login/Register/Callback
  '/api/webhooks',      // Webhooks externos (MP)
  '/api/availability',  // Disponibilidad pública
  '/billing',           // Pantallas de suspensión y cobranzas
  '/onboarding',        // Carga obligatoria de tarjeta para activar club
]

// In-memory sliding window para rate limiting de rutas sensibles
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  // Cabeceras estrictas anti-caché para que ni dueños ni jugadores vean HTML obsoleto
  response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
  response.headers.set('Pragma', 'no-cache')
  response.headers.set('Expires', '0')
  response.headers.set('Surrogate-Control', 'no-store')

  const pathname = request.nextUrl.pathname

  // ─── RATE LIMITING (Protección contra ataques de fuerza bruta y spam) ───
  const isRateLimitedRoute = pathname.startsWith('/auth') || (pathname.startsWith('/api') && !pathname.startsWith('/api/webhooks'))
  if (isRateLimitedRoute) {
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
               request.headers.get('x-real-ip') ||
               '127.0.0.1'
    const limit = pathname.startsWith('/auth') ? 35 : 120 // 35 req/min para auth, 120 req/min para APIs
    const now = Date.now()
    const windowMs = 60 * 1000

    // Limpieza esporádica de memoria
    if (rateLimitMap.size > 2000) {
      for (const [k, v] of rateLimitMap.entries()) {
        if (now > v.resetTime) rateLimitMap.delete(k)
      }
    }

    const record = rateLimitMap.get(ip) || { count: 0, resetTime: now + windowMs }
    if (now > record.resetTime) {
      record.count = 1
      record.resetTime = now + windowMs
    } else {
      record.count++
    }
    rateLimitMap.set(ip, record)

    if (record.count > limit) {
      return new NextResponse(
        JSON.stringify({
          error: 'Demasiadas solicitudes. Por favor aguardá un minuto antes de reintentar.',
          retryAfter: 60,
        }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '60',
            'X-RateLimit-Limit': String(limit),
            'X-RateLimit-Remaining': '0',
          },
        }
      )
    }

    response.headers.set('X-RateLimit-Limit', String(limit))
    response.headers.set('X-RateLimit-Remaining', String(Math.max(0, limit - record.count)))
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  // Simulación rápida en modo demo mediante cookie o query param (útil para tests locales)
  const demoStatusOverride = request.nextUrl.searchParams.get('simulate_status') || 
                             request.cookies.get('demo_subscription_status')?.value

  // Permitir la página de inicio ('/') y todas las rutas públicas sin redirección
  const isPublicPath = pathname === '/' || PUBLIC_PATHS.some(p => pathname.startsWith(p))
  if (isPublicPath) {
    return response
  }

  // ─── 1. MODO DEMO LOCAL SIN BASE DE DATOS ACTIVA ───────────────────────────
  if (!supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('tu-proyecto') || supabaseUrl.includes('placeholder')) {
    if (demoStatusOverride === 'LOCKED') {
      if (pathname.startsWith('/dashboard') && !pathname.startsWith('/dashboard/plan')) {
        return NextResponse.redirect(new URL('/billing/suspended', request.url))
      }
    }
    if (demoStatusOverride) {
      response.headers.set('x-tenant-status', demoStatusOverride)
    }
    return response
  }

  // ─── 2. CLIENTE SUPABASE SSR CON SESIÓN REAL ───────────────────────────────
  const supabase = createServerClient(
    supabaseUrl,
    supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refrescar la sesión
  const { data: { user } } = await supabase.auth.getUser()

  // ─── 3. PROTECCIÓN DE RUTAS PRIVADAS (DASHBOARD) ──────────────────────────
  // El acceso al dashboard requiere una sesión real autenticada en Supabase o sesión Superadmin.
  if (pathname.startsWith('/dashboard')) {
    const saSession = request.cookies.get('sa_session')?.value
    if (!user && !saSession) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
    }

    // SI EL USUARIO NO ES SUPERADMIN: VERIFICAR QUE EL CLUB HAYA VINCULADO SU TARJETA
    if (!saSession && user) {
      const isFromMpReturn = request.nextUrl.searchParams.get('subscription_active') === 'true' ||
                             request.nextUrl.searchParams.get('auto_debit_registered') === 'true'

      // Si regresa de Mercado Pago con la suscripción aprobada en /dashboard/plan, permitir procesar activación
      if (isFromMpReturn && pathname.startsWith('/dashboard/plan')) {
        return response
      }

      const isPendingActivation = request.cookies.get('new_club_pending_activation')?.value === 'true'
      const cookieHasCard = request.cookies.get('demo_has_card')?.value === 'true'
      const cookieCardLast4 = request.cookies.get('demo_card_last4')?.value

      // Si la cookie explícitamente indica activación pendiente o falta de tarjeta
      if (isPendingActivation || (!cookieHasCard || !cookieCardLast4)) {
        // Consultar perfil para descartar superadmin y verificar metadatos de tarjeta
        const { data: profile } = await supabase
          .from('profiles')
          .select('role, tenant_id, tenants(subscription_status, is_active, description)')
          .eq('id', user.id)
          .single()

        if (profile && profile.role !== 'SUPERADMIN') {
          const tenantData = profile?.tenants as unknown as { subscription_status?: string; is_active?: boolean; description?: string } | null
          let metaCardLinked = false
          if (tenantData?.description) {
            try {
              const meta = JSON.parse(tenantData.description)
              metaCardLinked = Boolean(meta.card_linked)
            } catch {}
          }

          if (!metaCardLinked) {
            return NextResponse.redirect(new URL('/onboarding/tarjeta', request.url))
          }
        }
      }
    }
  }

  // ─── 4. PROTECCIÓN DEL PANEL SUPERADMIN ────────────────────────────────────
  // El panel superadmin usa su propio sistema de sesión (cookie sa_session),
  // completamente independiente de Supabase.
  if (pathname.startsWith('/superadmin')) {
    // La página de login del superadmin es pública
    if (pathname === '/superadmin/login') {
      return response
    }

    // Verificar la cookie de sesión sa_session
    const saSession = request.cookies.get('sa_session')?.value
    const secret = process.env.SUPERADMIN_SESSION_SECRET

    if (!saSession || !secret) {
      return NextResponse.redirect(new URL('/superadmin/login', request.url))
    }

    // Verificar firma HMAC del token y timestamp usando Web Crypto API (Edge Runtime)
    try {
      const decoded = Buffer.from(saSession, 'base64url').toString('utf-8')
      const parts = decoded.split(':')
      if (parts.length < 3) throw new Error('invalid')
      const sig = parts.pop()!

      // Verificar que la sesión no tenga más de 8 horas
      const timestamp = parseInt(parts[parts.length - 1], 10)
      if (isNaN(timestamp) || Date.now() - timestamp > 8 * 60 * 60 * 1000) {
        throw new Error('expired')
      }

      const payload = parts.join(':')

      const enc = new TextEncoder()
      const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify']
      )
      const sigBytes = Buffer.from(sig, 'hex')
      const payloadBytes = enc.encode(payload)
      const valid = await crypto.subtle.verify('HMAC', keyMaterial, sigBytes, payloadBytes)
      if (!valid) throw new Error('invalid sig')
    } catch {
      return NextResponse.redirect(new URL('/superadmin/login', request.url))
    }

    return response
  }

  // ─── 5. EVALUACIÓN DEL ESTADO DE DUNNING DEL CLUB (TENANT) ────────────────
  if (pathname.startsWith('/dashboard') && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('tenant_id, tenants(subscription_status, is_active)')
      .eq('id', user.id)
      .single()

    const tenantData = profile?.tenants as unknown as { subscription_status?: string; is_active?: boolean } | null
    const tenantStatus = demoStatusOverride || tenantData?.subscription_status || 'ACTIVE'

    // Inyectar estado en headers para consumo en Server Components
    response.headers.set('x-tenant-status', tenantStatus)

    // SI EL ESTADO ES 'LOCKED' (Día 15+ de mora):
    // Interceptar y redirigir a /billing/suspended, excepto si va a pagar en /dashboard/plan
    if (tenantStatus === 'LOCKED') {
      if (!pathname.startsWith('/dashboard/plan') && !pathname.startsWith('/billing/suspended')) {
        return NextResponse.redirect(new URL('/billing/suspended', request.url))
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
