// src/middleware.ts
// ==============================================================================
// MIDDLEWARE DE CONTROL DE ACCESO, MULTI-TENANT & DUNNING SYSTEM
// ==============================================================================
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const PUBLIC_PATHS = [
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

  // Permitir rutas públicas sin autenticación
  const isPublicPath = PUBLIC_PATHS.some(p => pathname.startsWith(p))

  // Ruta raíz: redirigir según estado de auth
  if (pathname === '/') {
    if (!user) {
      return NextResponse.redirect(new URL('/auth/login', request.url))
    }
    return NextResponse.redirect(new URL('/dashboard', request.url))
  }

  if (isPublicPath) {
    return response
  }

  // ─── 3. PROTECCIÓN DE RUTAS PRIVADAS ───────────────────────────────────────
  if (pathname.startsWith('/dashboard') || pathname.startsWith('/superadmin')) {
    if (!user) {
      const url = request.nextUrl.clone()
      url.pathname = '/auth/login'
      url.searchParams.set('redirectTo', pathname)
      return NextResponse.redirect(url)
    }
  }

  // ─── 4. PROTECCIÓN DEL PANEL SUPERADMIN ────────────────────────────────────
  if (pathname.startsWith('/superadmin')) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user!.id)
      .single()

    if (profile?.role !== 'SUPERADMIN') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
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
