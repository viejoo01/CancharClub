// src/app/api/auth/mercadopago/callback/route.ts
// ==============================================================================
// OAUTH CALLBACK — Mercado Pago Marketplace Account Link
// ==============================================================================

import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyMpOAuthState } from '@/actions/mp-marketplace.actions'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')
  const rawState = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'

  if (error || !code || !rawState) {
    console.error('[MP OAuth Callback] Error or missing params:', { error, code, rawState })
    return NextResponse.redirect(`${appUrl}/dashboard/plan?mp_error=auth_failed`)
  }

  // 1. BLINDAJE ANTI-CSRF / ANTI-ACCOUNT TAKEOVER: Validar firma criptográfica del state
  const stateVerification = await verifyMpOAuthState(rawState)
  if (!stateVerification.valid || !stateVerification.tenantId) {
    console.error('[MP OAuth Callback] ALERTA DE SEGURIDAD: State inválido, expirado o manipulado:', rawState)
    return NextResponse.redirect(`${appUrl}/dashboard/plan?mp_error=invalid_state`)
  }

  const tenantId = stateVerification.tenantId

  try {
    const clientId = process.env.MP_CLIENT_ID
    const clientSecret = process.env.MP_CLIENT_SECRET
    const redirectUri = `${appUrl}/api/auth/mercadopago/callback`

    if (!clientId || !clientSecret) {
      console.error('[MP OAuth Callback] Error: MP_CLIENT_ID o MP_CLIENT_SECRET no configurados en el servidor')
      return NextResponse.redirect(`${appUrl}/dashboard/plan?mp_error=server_missing_credentials`)
    }

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
    if (!response.ok || !data.access_token) {
      console.error('[MP OAuth Token Exchange] Error retornado por Mercado Pago:', data)
      const errorDetail = data?.message || data?.error || 'token_exchange_failed'
      return NextResponse.redirect(`${appUrl}/dashboard/plan?mp_error=${encodeURIComponent(errorDetail)}`)
    }

    const accessToken = data.access_token
    const refreshToken = data.refresh_token || null
    const collectorId = String(data.user_id)

    // Actualizar en base de datos para el tenant
    const supabase = await createServiceClient()
    await supabase
      .from('tenants')
      .update({
        mp_access_token: accessToken,
        mp_refresh_token: refreshToken,
        mp_collector_id: collectorId,
        mp_connected_at: new Date().toISOString(),
        mp_marketplace_fee_pct: 0, // 0% fee - La plataforma no retiene cargos por reserva
      })
      .eq('id', tenantId)

    return NextResponse.redirect(`${appUrl}/dashboard/plan?mp_connected=true`)
  } catch (err) {
    console.error('[MP OAuth Callback] Unexpected error:', err)
    return NextResponse.redirect(`${appUrl}/dashboard/plan?mp_error=server_error`)
  }
}
