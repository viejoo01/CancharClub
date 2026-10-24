// src/middleware.ts
// ==============================================================================
// MIDDLEWARE DE CONTROL DE ACCESO, MULTI-TENANT & DUNNING SYSTEM
// ==============================================================================
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = [
  '/app',               // Enrutador inteligente PWA (selector de perfil Jugador vs Club)
  '/api/manifest',      // Manifiesto PWA dinámico según perfil
  '/sumar-club',        // Landing para dueños de clubes
  '/mis-reservas',      // Consulta de reservas de jugadores
  '/club',              // Portal público por slug
  '/reserva',           // Confirmación y estado público de reservas
  '/partido',           // Split payment público para dividir costo del partido entre amigos
  '/torneo',            // Consulta pública e inscripción a torneos
  '/totem',             // Pantalla de autoservicio y check-in en recepción del club
  '/auth',              // Login/Register/Callback
  '/api/webhooks',      // Webhooks externos (MP)
  '/api/availability',  // Disponibilidad pública
  '/api/health',        // Health check & keep-alive monitor (Supabase wake-up)
  '/api/cron',          // Tareas programadas de mantenimiento y keep-alive
  '/billing',           // Pantallas de suspensión y cobranzas
  '/onboarding',        // Carga obligatoria de tarjeta para activar club
]

// Sliding window en memoria local para protección perimetral en Edge/Node isolates.
// Nota de seguridad (MED-03): Para entornos serverless con múltiples réplicas concurrentes,
// las rutas críticas (/api/superadmin/login, reservas, etc.) complementan este control
// con el rate limiter distribuido basado en Upstash Redis de src/lib/rate-limiter.ts.
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()

/**
 * Valida criptográficamente la sesión Superadmin (cookie sa_session) mediante HMAC SHA-256 y expiración.
 */
async function isValidSuperadminSession(token: string | undefined): Promise<boolean> {
  const secret = process.env.SUPERADMIN_SESSION_SECRET
  if (!token || !secret) return false

  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf-8')
    const parts = decoded.split(':')
    if (parts.length < 3) return false
    const sig = parts.pop()!

    // Verificar expiración (máximo 8 horas)
    const timestamp = parseInt(parts[parts.length - 1], 10)
    if (isNaN(timestamp) || Date.now() - timestamp > 8 * 60 * 60 * 1000) {
      return false
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
    return await crypto.subtle.verify('HMAC', keyMaterial, sigBytes, payloadBytes)
  } catch {
    return false
  }
}

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', pathname)

  let response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  // Cabeceras estrictas anti-caché para páginas dinámicas y panel de administración
  // Se excluyen /api/availability y recursos estáticos para permitir SWR y absorción de alto tráfico en el CDN
  if (!pathname.startsWith('/api/availability') && !pathname.startsWith('/_next')) {
    response.headers.set('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    response.headers.set('Surrogate-Control', 'no-store')
  }

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

  let profileData: {
    role?: string
    tenant_id?: string
    tenants?: { subscription_status?: string; is_active?: boolean; description?: string }
  } | null = null

  // ─── 3. PROTECCIÓN DE RUTAS PRIVADAS (DASHBOARD) ──────────────────────────
  // El acceso al dashboard requiere una sesión real autenticada en Supabase o sesión Superadmin legítima.
  if (pathname.startsWith('/dashboard')) {
    const rawSaSession = request.cookies.get('sa_session')?.value
    const isSuperadmin = await isValidSuperadminSession(rawSaSession)

    if (!user && !isSuperadmin) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
    }

    // SI EL USUARIO NO ES SUPERADMIN: OBTENER PERFIL Y VERIFICAR ACCESO
    if (!isSuperadmin && user) {
      const { data: profile } = (await supabase
        .from('profiles')
        .select('role, tenant_id, tenants(subscription_status, is_active, description, trial_ends_at, created_at)')
        .eq('id', user.id)
        .maybeSingle()) as {
          data: {
            role?: string
            tenant_id?: string
            tenants?: { subscription_status?: string; is_active?: boolean; description?: string; trial_ends_at?: string; created_at?: string }
          } | null
        }

      profileData = profile

      const isFromMpReturn = request.nextUrl.searchParams.get('subscription_active') === 'true' ||
                             request.nextUrl.searchParams.get('auto_debit_registered') === 'true' ||
                             request.nextUrl.searchParams.get('mp_card_connected') === 'true' ||
                             request.nextUrl.searchParams.has('preapproval_id') ||
                             request.nextUrl.searchParams.has('payment_id') ||
                             request.nextUrl.searchParams.has('collection_id')

      // Si regresa de Mercado Pago con la suscripción aprobada en el dashboard, permitir procesar activación
      if (isFromMpReturn && pathname.startsWith('/dashboard')) {
        return response
      }

      // En producción, NUNCA confiar ciegamente en cookies del cliente para omitir la validación de tarjeta
      const isProdEnv = process.env.NODE_ENV === 'production'
      const isPendingActivation = request.cookies.get('new_club_pending_activation')?.value === 'true'
      const cookieHasCard = request.cookies.get('demo_has_card')?.value === 'true'
      const cookieCardLast4 = request.cookies.get('demo_card_last4')?.value

      // En desarrollo sin DB puede admitir cookies demo; en producción se verifica estrictamente la BD
      const requiresCardCheck = isProdEnv || isPendingActivation || (!cookieHasCard || !cookieCardLast4)

      if (requiresCardCheck && profileData && (profileData.role === 'TENANT_ADMIN' || profileData.role === 'ADMIN')) {
        // Permitir acceso a la pantalla de planes y soporte incluso si no tiene tarjeta
        const isExemptPath = pathname.startsWith('/dashboard/plan') || pathname.startsWith('/dashboard/soporte')
        if (isExemptPath) {
          return response
        }

        const rawTenants = profileData.tenants
        const tenantData = Array.isArray(rawTenants) ? rawTenants[0] : rawTenants
        let metaCardLinked = false
        if (tenantData?.description) {
          try {
            const meta = JSON.parse(tenantData.description)
            metaCardLinked = Boolean(meta.card_linked)
          } catch {}
        }

        // Si el club se encuentra dentro de su período de prueba de 15 días, NO se lo bloquea
        let isTrialActive = false
        const trialEndsAt = tenantData?.trial_ends_at || (tenantData?.created_at ? new Date(new Date(tenantData.created_at).getTime() + 15 * 86400000).toISOString() : null)
        if (trialEndsAt && new Date(trialEndsAt) > new Date()) {
          isTrialActive = true
        }

        if (!metaCardLinked && !isTrialActive) {
          return NextResponse.redirect(new URL('/onboarding/tarjeta', request.url))
        }
      }
    }
  }

  // ─── 4. PROTECCIÓN DEL PANEL SUPERADMIN ────────────────────────────────────
  // El panel superadmin usa su propio sistema de sesión criptográfica (cookie sa_session),
  // completamente independiente de Supabase.
  if (pathname.startsWith('/superadmin')) {
    // La página de login del superadmin es pública
    if (pathname === '/superadmin/login') {
      return response
    }

    const rawSaSession = request.cookies.get('sa_session')?.value
    const isSuperadmin = await isValidSuperadminSession(rawSaSession)

    if (!isSuperadmin) {
      return NextResponse.redirect(new URL('/superadmin/login', request.url))
    }

    return response
  }

  // ─── 5. EVALUACIÓN DEL ESTADO DE DUNNING DEL CLUB (TENANT) ────────────────
  if (pathname.startsWith('/dashboard') && user) {
    const rawTenants = profileData?.tenants
    const tenantData = Array.isArray(rawTenants) ? rawTenants[0] : rawTenants
    const isProd = process.env.NODE_ENV === 'production'
    // En producción la base de datos es la única fuente de verdad inmutable
    const tenantStatus = (isProd ? tenantData?.subscription_status : (demoStatusOverride || tenantData?.subscription_status)) || 'ACTIVE'

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
