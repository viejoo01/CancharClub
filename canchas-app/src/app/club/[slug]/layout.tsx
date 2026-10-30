import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ slug: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'
  const clubUrl = `${baseUrl}/club/${slug}`

  try {
    const supabase = await createServiceClient()
    const { data: club } = await supabase
      .from('tenants')
      .select('id, name, description, address, city')
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
    const title = `${clubName} | Turnos y Canchas Online${city}`
    const description =
      club.description ||
      `Reservá tu cancha online en ${clubName}${city}. Consultá turnos de pádel, fútbol y tenis disponibles, precios actualizados y confirmá tu turno con seña inmediata por Mercado Pago.`

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
            url: `${baseUrl}/api/og/club?slug=${slug}`,
            width: 1200,
            height: 630,
            alt: `Reservas online en ${clubName}`,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title: `${clubName} | Reservá tu Cancha Online`,
        description,
        images: [`${baseUrl}/api/og/club?slug=${slug}`],
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
      .select('id, name, description, address, city')
      .eq('slug', slug)
      .maybeSingle()

    if (club) {
      const { data: courts } = await supabase
        .from('courts')
        .select('sport')
        .eq('tenant_id', club.id)
        .eq('is_active', true)

      const sportsList = Array.from(new Set((courts || []).map((c) => c.sport).filter(Boolean)))
      const effectiveSports = sportsList.length > 0 ? sportsList : ['Pádel', 'Fútbol', 'Tenis']

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
            address: {
              '@type': 'PostalAddress',
              streetAddress: club.address || 'Complejo Deportivo',
              addressLocality: club.city || 'Argentina',
              addressCountry: 'AR',
            },
            sport: effectiveSports,
            amenityFeature: [
              { '@type': 'LocationFeatureSpecification', name: 'Turnos Online en Vivo', value: true },
              { '@type': 'LocationFeatureSpecification', name: 'Seña con Mercado Pago', value: true },
              { '@type': 'LocationFeatureSpecification', name: 'Split Payment entre Amigos', value: true },
            ],
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
  } catch {}

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
