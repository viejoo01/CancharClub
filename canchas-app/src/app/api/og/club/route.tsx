import { ImageResponse } from 'next/og'
import { NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const slug = searchParams.get('slug')

    let clubName = 'Complejo Deportivo'
    let city = 'Argentina'
    let sports: string[] = ['Pádel', 'Fútbol', 'Tenis']

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
      } catch {}
    }

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
              'radial-gradient(circle at 80% 20%, rgba(16, 185, 129, 0.15) 0%, transparent 50%), radial-gradient(circle at 20% 80%, rgba(99, 102, 241, 0.1) 0%, transparent 50%)',
            padding: '60px 70px',
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
                backgroundColor: 'rgba(16, 185, 129, 0.12)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                padding: '8px 18px',
                borderRadius: '9999px',
                fontSize: '16px',
                fontWeight: 700,
                color: '#6ee7b7',
                textTransform: 'uppercase',
                letterSpacing: '1px',
              }}
            >
              Reservas Online
            </div>
          </div>

          {/* Main Title & Club Info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '900px' }}>
            <h1
              style={{
                fontSize: '56px',
                fontWeight: 900,
                lineHeight: 1.1,
                letterSpacing: '-1px',
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
              📍 {city} • Turnos en vivo con seña automática
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
              paddingTop: '28px',
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
                fontWeight: 700,
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
