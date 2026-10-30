import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'
  const tournamentUrl = `${baseUrl}/torneo/${id}`

  try {
    const supabase = await createServiceClient()
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('name, sport, format, start_date, end_date, entry_fee_amount, tenant_id')
      .eq('id', id)
      .maybeSingle()

    if (!tournament) {
      return {
        title: 'Torneo Deportivo | CancharClub',
        description: 'Inscripción y fixture en vivo en CancharClub.',
        alternates: { canonical: tournamentUrl },
      }
    }

    let clubName = 'Club Deportivo'
    if (tournament.tenant_id) {
      const { data: club } = await supabase
        .from('tenants')
        .select('name, city')
        .eq('id', tournament.tenant_id)
        .maybeSingle()
      if (club?.name) {
        clubName = `${club.name}${club.city ? ` (${club.city})` : ''}`
      }
    }

    const sportLabel = tournament.sport || 'Pádel'
    const title = `${tournament.name} | Torneo de ${sportLabel} en ${clubName}`
    const description = `Inscripciones abiertas para ${tournament.name} en ${clubName}. Formato ${tournament.format || 'competitivo'}, categorías y llaves en vivo en CancharClub.`

    return {
      title,
      description,
      alternates: {
        canonical: tournamentUrl,
      },
      openGraph: {
        title: `${tournament.name} • Torneo de ${sportLabel}`,
        description,
        url: tournamentUrl,
        siteName: 'CancharClub',
        locale: 'es_AR',
        type: 'website',
        images: [
          {
            url: `${baseUrl}/og-cancharclub.jpg`,
            width: 1200,
            height: 630,
            alt: `Torneo ${tournament.name}`,
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
      },
    }
  } catch {
    return {
      title: 'Torneo Deportivo | CancharClub',
      description: 'Inscripciones y resultados en vivo en CancharClub.',
      alternates: { canonical: tournamentUrl },
    }
  }
}

export default async function TournamentLayout({ params, children }: Props) {
  const { id } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'

  let jsonLd: Record<string, unknown> | null = null

  try {
    const supabase = await createServiceClient()
    const { data: tournament } = await supabase
      .from('tournaments')
      .select('name, sport, start_date, end_date, entry_fee_amount, tenant_id')
      .eq('id', id)
      .maybeSingle()

    if (tournament) {
      jsonLd = {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'SportsEvent',
            '@id': `${baseUrl}/torneo/${id}#event`,
            name: tournament.name,
            sport: tournament.sport || 'Pádel',
            url: `${baseUrl}/torneo/${id}`,
            ...(tournament.start_date ? { startDate: tournament.start_date } : {}),
            ...(tournament.end_date ? { endDate: tournament.end_date } : {}),
            ...(tournament.entry_fee_amount
              ? {
                  offers: {
                    '@type': 'Offer',
                    price: String(tournament.entry_fee_amount),
                    priceCurrency: 'ARS',
                  },
                }
              : {}),
          },
          {
            '@type': 'BreadcrumbList',
            '@id': `${baseUrl}/torneo/${id}#breadcrumb`,
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
                name: 'Torneos',
                item: `${baseUrl}/torneo`,
              },
              {
                '@type': 'ListItem',
                position: 3,
                name: tournament.name,
                item: `${baseUrl}/torneo/${id}`,
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
