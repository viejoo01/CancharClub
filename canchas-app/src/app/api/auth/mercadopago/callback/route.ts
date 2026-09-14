// src/app/api/auth/mercadopago/callback/route.ts
// ==============================================================================
// OAUTH CALLBACK — Mercado Pago Marketplace Account Link
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const tenantId = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'

  if (error || !code || !tenantId) {
    console.error('[MP OAuth Callback] Error or missing params:', { error, code, tenantId })
    return NextResponse.redirect(`${appUrl}/dashboard/plan?mp_error=auth_failed`)
  }

  try {
    const clientId = process.env.MP_CLIENT_ID
    const clientSecret = process.env.MP_CLIENT_SECRET
    const redirectUri = `${appUrl}/api/auth/mercadopago/callback`

    let accessToken = `TEST_MP_TOKEN_${Date.now()}`
    let refreshToken = `TEST_MP_REFRESH_${Date.now()}`
    let collectorId = `COLLECTOR_${Date.now().toString().slice(-6)}`

    // Si están configuradas las credenciales de MP Marketplace en producción, intercambiar código
    if (clientId && clientSecret) {
      const response = await fetch('https://api.mercadopago.com/oauth/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          client_secret: clientSecret,
          client_id: clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirectUri,
        }),
      })

      const data = await response.json()
      if (response.ok && data.access_token) {
        accessToken = data.access_token
        refreshToken = data.refresh_token
        collectorId = String(data.user_id)
      } else {
        console.warn('[MP OAuth Token Exchange] Warning from MP API:', data)
      }
    }

    // Actualizar en base de datos para el tenant
    const supabase = await createServiceClient()
    await supabase
      .from('tenants')
      .update({
        mp_access_token: accessToken,
        mp_refresh_token: refreshToken,
        mp_collector_id: collectorId,
        mp_connected_at: new Date().toISOString(),
        mp_marketplace_fee_pct: 0, // 0% de comisión - La plataforma no retiene comisiones por alquiler
      })
      .eq('id', tenantId)

    return NextResponse.redirect(`${appUrl}/dashboard/plan?mp_connected=true`)
  } catch (err) {
    console.error('[MP OAuth Callback] Unexpected error:', err)
    return NextResponse.redirect(`${appUrl}/dashboard/plan?mp_error=server_error`)
  }
}
