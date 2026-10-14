import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const rawNext = searchParams.get('next') ?? '/dashboard'
  // Prevenir vulnerabilidad de Open Redirect y protocolo relativo (//malicious.com)
  const safeNext = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/dashboard'

  if (code) {
    const supabase = await createClient()
    const { data: sessionData, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const response = NextResponse.redirect(`${origin}${safeNext}`)

      // Sincronizar tenant cookie si el usuario tiene un club asignado en profiles
      if (sessionData?.user) {
        try {
          const { data: profile } = await supabase
            .from('profiles')
            .select('tenant_id')
            .eq('id', sessionData.user.id)
            .single()

          if (profile?.tenant_id) {
            const isProd = process.env.NODE_ENV === 'production'
            const cookieOpts = {
              path: '/',
              maxAge: 60 * 60 * 24 * 30, // 30 días
              sameSite: 'lax' as const,
              secure: isProd,
            }
            response.cookies.set('canchar_tenant_id', profile.tenant_id, cookieOpts)
            response.cookies.set('demo_tenant_id', profile.tenant_id, cookieOpts)
          }
        } catch (profileErr) {
          console.warn('[auth/callback] No se pudo obtener el tenant_id inicial del perfil:', profileErr)
        }
      }

      return response
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=auth_failed`)
}
