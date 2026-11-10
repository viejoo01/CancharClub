import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils'

interface Props {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}

function formatSportName(raw?: string | null): string {
  if (!raw) return 'Deporte'
  const s = raw.toUpperCase().trim()
  if (s.includes('PADEL') || s.includes('PÁDEL')) return 'Pádel'
  if (s.includes('FUTBOL11') || s.includes('11')) return 'Fútbol 11'
  if (s.includes('FUTBOL7') || s.includes('7')) return 'Fútbol 7'
  if (s.includes('FUTBOL5') || s.includes('5')) return 'Fútbol 5'
  if (s.includes('FUTBOL') || s.includes('SOCCER')) return 'Fútbol'
  if (s.includes('TENIS') || s.includes('TENNIS')) return 'Tenis'
  if (s.includes('BASQUET') || s.includes('BASKET')) return 'Básquet'
  return raw
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'
  const clubUrl = `${baseUrl}/club/${slug}`

  try {
    const supabase = await createServiceClient()
    const { data: club } = await supabase
      .from('tenants')
      .select('id, name, description, address, city, phone_whatsapp')
      .eq('slug', slug)
      .maybeSingle()

    if (!club) {
      return {
        title: 'Club Deportivo | CancharClub',
        description: 'Reservá tu turno online en CancharClub.',
        alternates: { canonical: clubUrl },
      }
    }

    const clubName = club.name || 'Club Deportivo'
    const city = club.city ? ` en ${club.city}` : ''

    // Consultar canchas y tarifas para enriquecer los títulos y OpenGraph
    const [courtsRes, priceRulesRes] = await Promise.all([
      supabase
        .from('courts')
        .select('id, name, sport, surface')
        .eq('tenant_id', club.id)
        .eq('is_active', true),
      supabase
        .from('price_rules')
        .select('court_id, price_cents, is_active')
        .eq('tenant_id', club.id)
        .eq('is_active', true),
    ])

    const courts = courtsRes.data || []
    const priceRules = priceRulesRes.data || []

    let minPrice = 20000
    if (priceRules.length > 0) {
      const prices = priceRules.map((r) => Math.round((Number(r.price_cents) || 0) / 100)).filter((p) => p > 0)
      if (prices.length > 0) minPrice = Math.min(...prices)
    }

    const sportsList = Array.from(new Set(courts.map((c) => formatSportName(c.sport)).filter(Boolean)))
    const sportsText = sportsList.length > 0 ? sportsList.join(', ') : 'Pádel, Fútbol y Tenis'

    const title = `${clubName} | Turnos y Canchas Online${city}`
    const description =
      club.description ||
      `Reservá tu cancha online en ${clubName}${city}. Canchas disponibles de ${sportsText} desde ${formatARS(
        minPrice
      )}. Turnos en vivo y confirmación con seña inmediata por Mercado Pago.`

    const ogImageUrl = `${baseUrl}/api/og/club?slug=${slug}`

    return {
      title,
      description,
      alternates: {
        canonical: clubUrl,
      },
      openGraph: {
        title: `${clubName} • Reservas Online`,
        description,
        url: clubUrl,
        siteName: 'CancharClub',
        locale: 'es_AR',
        type: 'website',
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: `Reservas online en ${clubName}`,
            type: 'image/png',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${clubName} | Reservá tu Cancha Online`,
        description,
        images: [ogImageUrl],
      },
    }
  } catch {
    return {
      title: 'Portal de Reservas | CancharClub',
      description: 'Reservá tu turno online en complejos deportivos de Argentina.',
      alternates: { canonical: clubUrl },
    }
  }
}

export default async function ClubLayout({ params, children }: Props) {
  const { slug } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'

  let jsonLd: Record<string, unknown> | null = null

  try {
    const supabase = await createServiceClient()
    const { data: club } = await supabase
      .from('tenants')
      .select(`
        id, 
        name, 
        description, 
        address, 
        city, 
        province, 
        phone_whatsapp, 
        instagram_handle, 
        google_maps_url
      `)
      .eq('slug', slug)
      .maybeSingle()

    if (club) {
      const [courtsRes, priceRulesRes] = await Promise.all([
        supabase
          .from('courts')
          .select('id, name, sport, surface, slot_duration_minutes, has_lights, is_indoor, image_url')
          .eq('tenant_id', club.id)
          .eq('is_active', true)
          .order('display_order', { ascending: true }),
        supabase
          .from('price_rules')
          .select('court_id, price_cents, is_active')
          .eq('tenant_id', club.id)
          .eq('is_active', true),
      ])

      const courts = courtsRes.data || []
      const priceRules = priceRulesRes.data || []

      const sportsList = Array.from(new Set(courts.map((c) => formatSportName(c.sport)).filter(Boolean)))
      const effectiveSports = sportsList.length > 0 ? sportsList : ['Pádel', 'Fútbol', 'Tenis']

      // Generar catálogo estructurado de canchas (Offers) para Schema.org
      const courtOffers = courts.map((court) => {
        const matchingRules = priceRules.filter((r) => !r.court_id || r.court_id === court.id)
        let price = 25000
        if (matchingRules.length > 0) {
          price = Math.min(...matchingRules.map((r) => Math.round((Number(r.price_cents) || 0) / 100)))
        }

        const sportLabel = formatSportName(court.sport)
        const courtImageUrl = `${baseUrl}/api/og/club?slug=${slug}&courtId=${court.id}&price=${price}&courtName=${encodeURIComponent(
          court.name
        )}&sport=${encodeURIComponent(sportLabel)}`

        return {
          '@type': 'Offer',
          '@id': `${baseUrl}/club/${slug}/cancha/${court.id}#offer`,
          name: court.name,
          description: `Cancha de ${sportLabel} (${court.surface || 'Sintético Pro'}). Turnos disponibles con seña online.`,
          price,
          priceCurrency: 'ARS',
          availability: 'https://schema.org/InStock',
          url: `${baseUrl}/club/${slug}/cancha/${court.id}`,
          image: courtImageUrl,
          itemOffered: {
            '@type': 'Service',
            name: `Alquiler de ${court.name}`,
            serviceType: sportLabel,
          },
        }
      })

      const sameAsList: string[] = []
      if (club.instagram_handle) {
        const handle = club.instagram_handle.replace(/^@/, '')
        sameAsList.push(`https://instagram.com/${handle}`)
      }

      jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SportsActivityLocation',
            '@id': `${baseUrl}/club/${slug}#place`,
            name: club.name,
            description:
              club.description || `Complejo deportivo ${club.name}. Turnos y reservas online en tiempo real.`,
            url: `${baseUrl}/club/${slug}`,
            priceRange: '$$',
            telephone: club.phone_whatsapp ? `+${club.phone_whatsapp.replace(/\D/g, '')}` : undefined,
            sameAs: sameAsList.length > 0 ? sameAsList : undefined,
            address: {
              '@type': 'PostalAddress',
              streetAddress: club.address || 'Complejo Deportivo',
              addressLocality: club.city || 'Argentina',
              addressRegion: club.province || 'Tucumán',
              addressCountry: 'AR',
            },
            sport: effectiveSports,
            amenityFeature: [
              { '@type': 'LocationFeatureSpecification', name: 'Turnos Online en Vivo', value: true },
              { '@type': 'LocationFeatureSpecification', name: 'Seña con Mercado Pago', value: true },
              { '@type': 'LocationFeatureSpecification', name: 'Split Payment entre Amigos', value: true },
              { '@type': 'LocationFeatureSpecification', name: 'Iluminación LED', value: true },
            ],
            // Catálogo estructurado de canchas y tarifas para Google y motores con IA
            hasOfferCatalog: {
              '@type': 'OfferCatalog',
              name: `Canchas Disponibles en ${club.name}`,
              itemListElement: courtOffers,
            },
          },
          {
            '@type': 'BreadcrumbList',
            '@id': `${baseUrl}/club/${slug}#breadcrumb`,
            itemListElement: [
              {
                '@type': 'ListItem',
                position: 1,
                name: 'Inicio',
                item: baseUrl,
              },
              {
                '@type': 'ListItem',
                position: 2,
                name: 'Clubes',
                item: `${baseUrl}/#clubes`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: club.name,
                item: `${baseUrl}/club/${slug}`,
              },
            ],
          },
        ],
      }
    }
  } catch (err) {
    console.warn('[ClubLayout] Error construyendo Schema.org:', err)
  }

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(jsonLd),
          }}
        />
      )}
      {children}
    </>
  )
}
