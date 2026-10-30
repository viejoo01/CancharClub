import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Mis Reservas y Turnos Deportivos | CancharClub',
  description:
    'Consultá el estado de tus turnos de pádel, fútbol y tenis, comprobantes de seña y cancelaciones en complejos deportivos de Argentina.',
  alternates: {
    canonical: 'https://cancharclub.com.ar/mis-reservas',
  },
  openGraph: {
    title: 'Mis Reservas y Turnos • CancharClub',
    description:
      'Consultá tus turnos confirmados, señas abonadas y comprobantes de juego en CancharClub.',
    url: 'https://cancharclub.com.ar/mis-reservas',
    siteName: 'CancharClub',
    locale: 'es_AR',
    type: 'website',
    images: [
      {
        url: 'https://cancharclub.com.ar/og-cancharclub.jpg',
        width: 1200,
        height: 630,
        alt: 'Mis Reservas CancharClub',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Mis Reservas y Turnos | CancharClub',
    description: 'Consultá tus turnos activos y comprobantes de juego.',
  },
}

export default function MisReservasLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Inicio',
        item: 'https://cancharclub.com.ar',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Mis Reservas',
        item: 'https://cancharclub.com.ar/mis-reservas',
      },
    ],
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd),
        }}
      />
      {children}
    </>
  )
}
