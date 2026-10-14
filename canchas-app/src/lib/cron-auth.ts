import { type NextRequest } from 'next/server'

/**
 * Validador seguro de invocación de endpoints cron (Vercel Cron, cron-job.org, GitHub Actions).
 * Soporta autenticación mediante Header Authorization Bearer o query parameter ?secret=
 */
export function verifyCronRequest(request: NextRequest): { authorized: boolean; error?: string } {
  const rawSecret = (process.env.CRON_SECRET ?? '').trim()
  const cronSecret = rawSecret.replace(/^["']|["']$/g, '').trim()

  if (!cronSecret) {
    if (process.env.NODE_ENV === 'production') {
      console.error('[verifyCronRequest] CRON_SECRET no está configurado en producción')
      return { authorized: false, error: 'Cron secret not configured' }
    }
    // En desarrollo local sin CRON_SECRET se permite la ejecución para pruebas
    return { authorized: true }
  }

  const rawAuth = request.headers.get('authorization')?.trim() ?? ''
  const isBearer = rawAuth.toLowerCase().startsWith('bearer ')
  const tokenFromHeader = (isBearer ? rawAuth.slice(7) : rawAuth).replace(/^["']|["']$/g, '').trim()
  const querySecret = (request.nextUrl.searchParams.get('secret') ?? '').replace(/^["']|["']$/g, '').trim()

  const isHeaderValid = tokenFromHeader.length > 0 && tokenFromHeader === cronSecret
  const isQueryValid = querySecret.length > 0 && querySecret === cronSecret

  if (!isHeaderValid && !isQueryValid) {
    return { authorized: false, error: 'Unauthorized cron invocation' }
  }

  return { authorized: true }
}
