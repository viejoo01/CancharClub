import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function formatSportLabel(sport?: string | null): string {
  if (!sport) return 'Deporte'
  const s = sport.toUpperCase().trim()
  if (s.includes('PADEL') || s.includes('PÁDEL')) return 'PÁDEL'
  if (s.includes('FUTBOL11') || s.includes('11')) return 'FÚTBOL 11'
  if (s.includes('FUTBOL7') || s.includes('7')) return 'FÚTBOL 7'
  if (s.includes('FUTBOL5') || s.includes('5')) return 'FÚTBOL 5'
  if (s.includes('FUTBOL') || s.includes('SOCCER')) return 'FÚTBOL'
  if (s.includes('TENIS') || s.includes('TENNIS')) return 'TENIS'
  if (s.includes('BASQUET') || s.includes('BASKET')) return 'BÁSQUET'
  return s
}

function formatSurfaceLabel(surface?: string | null): string {
  if (!surface) return 'Superficie Pro'
  const s = surface.toUpperCase().trim()
  if (s.includes('CRISTAL') || s.includes('BLINDEX')) return 'Cristal Panorámico'
  if (s.includes('SINTETICO') || s.includes('CESPED')) return 'Césped Sintético'
  if (s.includes('NATURAL')) return 'Césped Natural'
  if (s.includes('POLVO') || s.includes('LADRILLO') || s.includes('ARCILLA')) return 'Polvo de Ladrillo'
  if (s.includes('ALFOMBRA')) return 'Alfombra Pro'
  if (s.includes('CEMENTO') || s.includes('RAPIDA')) return 'Cemento / Rápida'
  if (s.includes('PARQUET')) return 'Parquet Flotante'
  return surface.replace(/_/g, ' ')
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get('slug')
    const courtId = searchParams.get('courtId')
    const explicitCourtName = searchParams.get('courtName')
    const explicitPrice = searchParams.get('price')
    const explicitSport = searchParams.get('sport')
    const explicitSurface = searchParams.get('surface')

    let clubName = 'Complejo Deportivo'
    let city = 'Argentina'
    let sports: string[] = ['Pádel', 'Fútbol', 'Tenis']
    let courtFound: {
      name: string
      sport: string
      surface: string
      duration: number
      hasLights: boolean
      isIndoor: boolean
      price: number
      imageUrl?: string | null
    } | null = null

    if (slug) {
      try {
        const supabase = await createServiceClient()
        const { data: club } = await supabase
          .from('tenants')
          .select('id, name, city, address')
          .eq('slug', slug)
          .maybeSingle()

        if (club?.name) {
          clubName = club.name
          city = club.city || club.address || 'Argentina'

          // Si se solicitó una cancha específica por ID o nombre
          if (courtId || explicitCourtName) {
            let courtQuery = supabase
              .from('courts')
              .select('id, name, sport, surface, slot_duration_minutes, has_lights, is_indoor, image_url')
              .eq('tenant_id', club.id)
              .eq('is_active', true)

            if (courtId) {
              courtQuery = courtQuery.or(`id.eq.${courtId},name.ilike.%${courtId}%`)
            } else if (explicitCourtName) {
              courtQuery = courtQuery.ilike('name', `%${explicitCourtName}%`)
            }

            const { data: courtData } = await courtQuery.maybeSingle()

            // Precios de la cancha
            let courtPrice = explicitPrice ? Number(explicitPrice) : 0
            if (!courtPrice) {
              const { data: priceRules } = await supabase
                .from('price_rules')
                .select('court_id, price_cents, is_active')
                .eq('tenant_id', club.id)
                .eq('is_active', true)

              const matchingRules = (priceRules || []).filter(
                (r) => !r.court_id || (courtData && r.court_id === courtData.id)
              )
              if (matchingRules.length > 0) {
                courtPrice = Math.min(
                  ...matchingRules.map((r) => Math.round((Number(r.price_cents) || 0) / 100))
                )
              }
            }

            if (!courtPrice || courtPrice <= 0) courtPrice = 25000

            if (courtData) {
              courtFound = {
                name: courtData.name,
                sport: courtData.sport,
                surface: courtData.surface || explicitSurface || 'Césped Sintético',
                duration: courtData.slot_duration_minutes || (courtData.sport?.includes('FUTBOL') ? 60 : 90),
                hasLights: courtData.has_lights !== false,
                isIndoor: Boolean(courtData.is_indoor),
                price: courtPrice,
                imageUrl: courtData.image_url,
              }
            } else if (explicitCourtName) {
              courtFound = {
                name: explicitCourtName,
                sport: explicitSport || 'PADEL',
                surface: explicitSurface || 'Cristal Panorámico',
                duration: 90,
                hasLights: true,
                isIndoor: false,
                price: courtPrice,
              }
            }
          }

          // Consultar deportes generales si no hay cancha específica
          if (!courtFound) {
            const { data: courts } = await supabase
              .from('courts')
              .select('sport')
              .eq('tenant_id', club.id)
              .eq('is_active', true)

            if (courts && courts.length > 0) {
              const unique = Array.from(new Set(courts.map((c) => c.sport).filter(Boolean)))
              if (unique.length > 0) sports = unique
            }
          }
        }
      } catch (err) {
        console.warn('[api/og/club] Error fetching Supabase metadata:', err)
      }
    }

    // =========================================================================
    // CASO 1: TARJETA DE CANCHA ESPECÍFICA (Compartida en WhatsApp)
    // =========================================================================
    if (courtFound) {
      const sportLabel = formatSportLabel(courtFound.sport)
      const surfaceLabel = formatSurfaceLabel(courtFound.surface)
      const formattedPrice = new Intl.NumberFormat('es-AR', {
        style: 'currency',
        currency: 'ARS',
        maximumFractionDigits: 0,
      }).format(courtFound.price)

      return new ImageResponse(
        (
          <div
            style={{
              height: '100%',
              width: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              backgroundColor: '#030712',
              backgroundImage:
                'radial-gradient(circle at 85% 15%, rgba(16, 185, 129, 0.25) 0%, transparent 45%), radial-gradient(circle at 15% 85%, rgba(6, 78, 59, 0.35) 0%, transparent 50%), radial-gradient(circle at 50% 50%, rgba(15, 23, 42, 0.8) 0%, #030712 100%)',
              padding: '48px 56px',
              fontFamily: 'sans-serif',
              color: '#ffffff',
            }}
          >
            {/* Header: Marca y Badge de Estado */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '12px',
                    backgroundColor: 'rgba(16, 185, 129, 0.2)',
                    border: '2px solid rgba(16, 185, 129, 0.6)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#34d399',
                    fontSize: '22px',
                    fontWeight: 900,
                  }}
                >
                  C
                </div>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '24px', fontWeight: 900, letterSpacing: '-0.5px' }}>
                    Canchar<span style={{ color: '#34d399' }}>Club</span>
                  </span>
                  <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: 500 }}>
                    Reservas Online en Tiempo Real
                  </span>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  border: '1.5px solid rgba(16, 185, 129, 0.4)',
                  padding: '8px 20px',
                  borderRadius: '9999px',
                }}
              >
                <div
                  style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    backgroundColor: '#10b981',
                  }}
                />
                <span
                  style={{
                    fontSize: '14px',
                    fontWeight: 800,
                    color: '#6ee7b7',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                  }}
                >
                  {sportLabel} • TURNO DISPONIBLE
                </span>
              </div>
            </div>

            {/* Cuerpo Principal: Título de Cancha y Tarjeta de Precio */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                gap: '32px',
              }}
            >
              {/* Información de Cancha y Club */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                  maxWidth: '680px',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '20px',
                    color: '#34d399',
                    fontWeight: 700,
                  }}
                >
                  📍 {clubName} • {city}
                </div>

                <h1
                  style={{
                    fontSize: '52px',
                    fontWeight: 900,
                    lineHeight: 1.05,
                    letterSpacing: '-1.5px',
                    margin: 0,
                    color: '#f8fafc',
                  }}
                >
                  {courtFound.name}
                </h1>

                {/* Badges de características */}
                <div style={{ display: 'flex', gap: '10px', marginTop: '6px', flexWrap: 'wrap' }}>
                  <div
                    style={{
                      backgroundColor: 'rgba(51, 65, 85, 0.7)',
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      color: '#e2e8f0',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '15px',
                      fontWeight: 600,
                    }}
                  >
                    🎾 {surfaceLabel}
                  </div>

                  <div
                    style={{
                      backgroundColor: 'rgba(51, 65, 85, 0.7)',
                      border: '1px solid rgba(148, 163, 184, 0.3)',
                      color: '#e2e8f0',
                      padding: '6px 14px',
                      borderRadius: '8px',
                      fontSize: '15px',
                      fontWeight: 600,
                    }}
                  >
                    ⏱️ Turnos {courtFound.duration} min
                  </div>

                  {courtFound.hasLights && (
                    <div
                      style={{
                        backgroundColor: 'rgba(234, 179, 8, 0.15)',
                        border: '1px solid rgba(234, 179, 8, 0.4)',
                        color: '#fef08a',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '15px',
                        fontWeight: 600,
                      }}
                    >
                      ⚡ Iluminación LED
                    </div>
                  )}

                  {courtFound.isIndoor && (
                    <div
                      style={{
                        backgroundColor: 'rgba(14, 165, 233, 0.15)',
                        border: '1px solid rgba(14, 165, 233, 0.4)',
                        color: '#bae6fd',
                        padding: '6px 14px',
                        borderRadius: '8px',
                        fontSize: '15px',
                        fontWeight: 600,
                      }}
                    >
                      🏟️ Techada
                    </div>
                  )}
                </div>
              </div>

              {/* Caja de Precio Radiante */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(6, 78, 59, 0.3)',
                  border: '2px solid rgba(16, 185, 129, 0.5)',
                  borderRadius: '24px',
                  padding: '24px 36px',
                  boxShadow: '0 20px 40px -10px rgba(6, 78, 59, 0.5)',
                  minWidth: '280px',
                }}
              >
                <span
                  style={{
                    fontSize: '13px',
                    fontWeight: 800,
                    color: '#a7f3d0',
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                  }}
                >
                  Tarifa de Turno
                </span>
                <span
                  style={{
                    fontSize: '50px',
                    fontWeight: 900,
                    color: '#34d399',
                    lineHeight: 1,
                    letterSpacing: '-1px',
                  }}
                >
                  {formattedPrice}
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    color: '#94a3b8',
                    marginTop: '8px',
                    fontWeight: 600,
                  }}
                >
                  💳 Seña Online con Mercado Pago
                </span>
              </div>
            </div>

            {/* Footer: Llamado a la Acción para WhatsApp */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                width: '100%',
                borderTop: '1px solid rgba(51, 65, 85, 0.7)',
                paddingTop: '20px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#cbd5e1', fontSize: '16px' }}>
                <span>📲</span>
                <span>Confirmá y señá tu cancha en menos de 2 minutos</span>
              </div>

              <div
                style={{
                  fontSize: '18px',
                  fontWeight: 800,
                  color: '#34d399',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                cancharclub.com.ar/club/{slug}
              </div>
            </div>
          </div>
        ),
        {
          width: 1200,
          height: 630,
        }
      )
    }

    // =========================================================================
    // CASO 2: TARJETA GENERAL DE CLUB (Portal Completo)
    // =========================================================================
    return new ImageResponse(
      (
        <div
          style={{
            height: '100%',
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            backgroundColor: '#020617',
            backgroundImage:
              'radial-gradient(circle at 80% 20%, rgba(16, 185, 129, 0.2) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(99, 102, 241, 0.15) 0%, transparent 50%)',
            padding: '56px 64px',
            fontFamily: 'sans-serif',
            color: '#ffffff',
          }}
        >
          {/* Top Bar: Brand */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
              <div
                style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  border: '2px solid rgba(16, 185, 129, 0.6)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#34d399',
                  fontSize: '24px',
                  fontWeight: 900,
                }}
              >
                C
              </div>
              <span style={{ fontSize: '28px', fontWeight: 900, letterSpacing: '-0.5px' }}>
                Canchar<span style={{ color: '#34d399' }}>Club</span>
              </span>
            </div>

            <div
              style={{
                backgroundColor: 'rgba(16, 185, 129, 0.15)',
                border: '1.5px solid rgba(16, 185, 129, 0.4)',
                padding: '8px 20px',
                borderRadius: '9999px',
                fontSize: '15px',
                fontWeight: 800,
                color: '#6ee7b7',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Reservas Online en Vivo
            </div>
          </div>

          {/* Main Title & Club Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '900px' }}>
            <h1
              style={{
                fontSize: '56px',
                fontWeight: 900,
                lineHeight: 1.1,
                letterSpacing: '-1.5px',
                margin: 0,
                color: '#f8fafc',
              }}
            >
              {clubName}
            </h1>
            <p
              style={{
                fontSize: '24px',
                color: '#94a3b8',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              📍 {city} • Turnos en vivo con seña automática por Mercado Pago
            </p>
          </div>

          {/* Bottom Bar: Sports Badges & CTA */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              borderTop: '1px solid rgba(51, 65, 85, 0.6)',
              paddingTop: '24px',
            }}
          >
            <div style={{ display: 'flex', gap: '12px' }}>
              {sports.slice(0, 4).map((s) => (
                <div
                  key={s}
                  style={{
                    backgroundColor: '#0f172a',
                    border: '1px solid #334155',
                    color: '#e2e8f0',
                    padding: '8px 18px',
                    borderRadius: '8px',
                    fontSize: '16px',
                    fontWeight: 600,
                  }}
                >
                  {s}
                </div>
              ))}
            </div>

            <div
              style={{
                fontSize: '18px',
                fontWeight: 800,
                color: '#34d399',
              }}
            >
              cancharclub.com.ar
            </div>
          </div>
        </div>
      ),
      {
        width: 1200,
        height: 630,
      }
    )
  } catch (err) {
    console.error('[api/og/club] Error generating OG image:', err)
    return new Response('Error generating OpenGraph image', { status: 500 })
  }
}
