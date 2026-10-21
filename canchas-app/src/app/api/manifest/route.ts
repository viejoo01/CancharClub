import { NextResponse, type NextRequest } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams
  const role = searchParams.get('role') // 'player' | 'club'

  const isPlayer = role === 'player'
  const isClub = role === 'club'

  const startUrl = isPlayer ? '/app?role=player' : isClub ? '/app?role=club' : '/app'
  const appName = isPlayer 
    ? 'CancharClub - Reservas de Canchas' 
    : isClub 
      ? 'CancharClub - Gestión de Clubes' 
      : 'CancharClub - Sistema de Canchas y Reservas'

  const shortName = isPlayer ? 'Canchar Reservas' : isClub ? 'Canchar Club' : 'CancharClub'

  const manifest = {
    name: appName,
    short_name: shortName,
    description: isPlayer
      ? 'Buscá canchas, reservá turnos online, consultá tus partidos y torneos en vivo.'
      : 'Gestión integral de complejos deportivos, turnos en vivo, cobro de señas y torneos.',
    start_url: startUrl,
    scope: '/',
    id: `https://cancharclub.com.ar${startUrl}`,
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: '#020617',
    theme_color: '#020617',
    lang: 'es-AR',
    dir: 'ltr',
    categories: ['sports', 'business', 'productivity', 'utilities'],
    prefer_related_applications: false,
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
    shortcuts: [
      {
        name: 'Reservar Canchas (Jugador)',
        short_name: 'Reservar',
        description: 'Buscar clubes y reservar canchas online',
        url: '/app?role=player',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Mis Reservas',
        short_name: 'Mis Turnos',
        description: 'Ver mis partidos y reservas activas',
        url: '/mis-reservas',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Panel de Club (Administrador)',
        short_name: 'Gestión Club',
        description: 'Ver la grilla de turnos y canchas en vivo',
        url: '/app?role=club',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Caja Diaria',
        short_name: 'Caja',
        description: 'Arqueo de caja y cobros del día',
        url: '/dashboard/caja',
        icons: [{ src: '/icon-192.png', sizes: '192x192' }],
      },
    ],
  }

  return NextResponse.json(manifest, {
    headers: {
      'Content-Type': 'application/manifest+json; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
    },
  })
}
