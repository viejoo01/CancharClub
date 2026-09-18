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
]

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const pathname = request.nextUrl.pathname
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
  // En producción, el acceso al dashboard requiere una sesión real autenticada en Supabase.
  if (pathname.startsWith('/dashboard')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
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
