import type { Metadata } from 'next'
import { createServiceClient } from '@/lib/supabase/server'

interface Props {
  params: Promise<{ id: string }>
  children: React.ReactNode
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'
  const matchUrl = `${baseUrl}/partido/${id}`

  try {
    const supabase = await createServiceClient()
    const { data: booking } = await supabase
      .from('bookings')
      .select('date, start_time, tenant_id, courts(name, sport)')
      .eq('id', id)
      .maybeSingle()

    let clubName = 'Complejo Deportivo'
    if (booking?.tenant_id) {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('name, city')
        .eq('id', booking.tenant_id)
        .maybeSingle()
      if (tenant?.name) {
        clubName = tenant.name
      }
    }

    const title = `Dividir Pago del Partido en ${clubName} | CancharClub`
    const description = `Aboná tu parte de la cancha para el partido en ${clubName}. Pago instantáneo y seguro vía Mercado Pago.`

    return {
      title,
      description,
      alternates: { canonical: matchUrl },
      openGraph: {
        title,
        description,
        url: matchUrl,
        siteName: 'CancharClub',
        locale: 'es_AR',
        type: 'website',
        images: [
          {
            url: `${baseUrl}/og-cancharclub.jpg`,
            width: 1200,
            height: 630,
            alt: `Dividir pago del partido en ${clubName}`,
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
      title: 'Dividir Pago del Partido | CancharClub',
      description: 'Aboná tu parte de la cancha con Mercado Pago en CancharClub.',
      alternates: { canonical: matchUrl },
    }
  }
}

export default function MatchSplitLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
