import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Torneos y Fixtures de Pádel y Fútbol | CancharClub Argentina',
  description:
    'Explorá torneos abiertos, cuadros de competencia, llaves en vivo e inscribite online con tu pareja o equipo en complejos deportivos de Argentina.',
  keywords: [
    'torneos de pádel',
    'torneos de fútbol 5',
    'fixture en vivo pádel',
    'inscripción torneos argentina',
    'torneos relámpago',
    'cancharclub',
  ],
  alternates: {
    canonical: 'https://cancharclub.com.ar/torneo',
  },
  openGraph: {
    title: 'Torneos de Pádel y Fútbol en Vivo | CancharClub',
    description:
      'Inscripciones abiertas, rankings, categorías y fixtures en vivo en los mejores complejos deportivos de Argentina.',
    url: 'https://cancharclub.com.ar/torneo',
    siteName: 'CancharClub',
    locale: 'es_AR',
    type: 'website',
    images: [
      {
        url: 'https://cancharclub.com.ar/og-cancharclub.jpg',
        width: 1200,
        height: 630,
        alt: 'Torneos CancharClub',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Torneos y Competencias Deportivas | CancharClub',
    description: 'Seguí llaves y cuadros en vivo e inscribí a tu equipo.',
  },
}

export default function TorneosDirectoryLayout({
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
        name: 'Torneos',
        item: 'https://cancharclub.com.ar/torneo',
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
