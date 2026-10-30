import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Sumá tu Club a CancharClub | Software de Gestión y Turnos Online',
  description:
    'Automatizá tu complejo deportivo con CancharClub: reservas online, cobro de señas automático con Mercado Pago MLA, facturación ARCA y control de caja ciega. 15 días de prueba gratis.',
  keywords: [
    'software para canchas',
    'sistema de turnos pádel',
    'gestión de canchas de fútbol 5',
    'cobro de señas mercado pago',
    'control de predios deportivos',
    'facturación ARCA canchas',
    'argentina',
  ],
  alternates: {
    canonical: 'https://cancharclub.com.ar/sumar-club',
  },
  openGraph: {
    title: 'Sumá tu Club Deportivo a CancharClub | Software Integral',
    description:
      'Automatizá turnos, cobro de señas por Mercado Pago, luces y facturación de tu complejo. Probá CancharClub 15 días gratis.',
    url: 'https://cancharclub.com.ar/sumar-club',
    siteName: 'CancharClub',
    locale: 'es_AR',
    type: 'website',
    images: [
      {
        url: 'https://cancharclub.com.ar/og-cancharclub.jpg',
        width: 1200,
        height: 630,
        alt: 'CancharClub SaaS — Plataforma para Clubes Deportivos',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Sumá tu Club a CancharClub | Gestión de Canchas Deportivas',
    description:
      'Reservas online, cobro de señas con Mercado Pago, luces y facturación ARCA. 15 días de prueba gratis.',
  },
}

export default function SumarClubLayout({ children }: { children: React.ReactNode }) {
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: 'CancharClub SaaS',
        operatingSystem: 'Web, Android, iOS (PWA)',
        applicationCategory: 'BusinessApplication',
        description:
          'Software integral en la nube para administración de complejos deportivos, reservas online, cobro de señas automático con Mercado Pago MLA y facturación electrónica ARCA.',
        offers: {
          '@type': 'Offer',
          price: '0',
          priceCurrency: 'ARS',
          description: '15 días de prueba gratuita sin cargo',
        },
      },
      {
        '@type': 'FAQPage',
        mainEntity: [
          {
            '@type': 'Question',
            name: '¿Cómo funciona la prueba gratuita de 15 días?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Al registrar tu club, accedés de inmediato a todas las funcionalidades del sistema (turnos online, señas con Mercado Pago, caja ciega y facturación) con 15 días bonificados sin costo.',
            },
          },
          {
            '@type': 'Question',
            name: '¿Cómo se cobran las señas de las reservas de los jugadores?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'El sistema se conecta directamente con tu cuenta de Mercado Pago. Cuando un jugador reserva un turno, el dinero de la seña se acredita de forma directa e inmediata en tu cuenta comercial.',
            },
          },
          {
            '@type': 'Question',
            name: '¿Qué deportes y tipos de canchas soporta el sistema?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'CancharClub admite Pádel (blindex y cemento), Fútbol (5, 7 y 8), Tenis (polvo de ladrillo y cemento), Básquet, Vóley y Pickleball, con soporte para múltiples sedes.',
            },
          },
          {
            '@type': 'Question',
            name: '¿El sistema previene la superposición de turnos?',
            acceptedAnswer: {
              '@type': 'Answer',
              text: 'Sí, CancharClub cuenta con un motor anti-overbooking transaccional con bloqueos a nivel de base de datos que garantiza que nunca dos personas reserven el mismo turno.',
            },
          },
        ],
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
