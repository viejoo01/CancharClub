import type { Metadata, Viewport } from 'next'
import { Inter, Outfit } from 'next/font/google'
import './globals.css'
import { Toaster } from 'sonner'

import { siteConfig } from '@/config/site'
import { AppAutoUpdater } from '@/components/shared/app-auto-updater'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' })
const outfit = Outfit({ subsets: ['latin'], variable: '--font-outfit', display: 'swap' })

export const dynamic = 'force-dynamic'
export const revalidate = 0

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export const metadata: Metadata = {
  metadataBase: new URL('https://cancharclub.com.ar'),
  title: {
    template: '%s | CancharClub',
    default: 'CancharClub | Gestión y Reservas de Canchas Deportivas',
  },
  description: siteConfig.description,
  alternates: {
    canonical: 'https://cancharclub.com.ar',
  },
  keywords: [
    'CancharClub',
    'Canchar',
    'gestión de canchas',
    'reservas de canchas',
    'pádel',
    'fútbol 5',
    'tenis',
    'software clubes deportivos',
    'turnos online',
    'argentina',
    'tucumán',
  ],
  authors: [{ name: siteConfig.name, url: siteConfig.url }],
  creator: siteConfig.name,
  openGraph: {
    type: 'website',
    locale: 'es_AR',
    url: siteConfig.url,
    siteName: siteConfig.name,
    title: 'CancharClub | Gestión y Reservas de Canchas Deportivas',
    description: `${siteConfig.tagline}. ${siteConfig.description}`,
    images: [
      {
        url: siteConfig.ogImage,
        width: 1200,
        height: 630,
        alt: `${siteConfig.name} - ${siteConfig.tagline}`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${siteConfig.name} | ${siteConfig.tagline}`,
    description: siteConfig.description,
    creator: '@cancharclub',
  },
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/favicon-32x32.png', type: 'image/png', sizes: '32x32' },
      { url: '/favicon-16x16.png', type: 'image/png', sizes: '16x16' },
    ],
    shortcut: '/favicon.ico',
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: siteConfig.name,
  },
}

import { PwaInstallBanner } from '@/components/shared/pwa-install-banner'
import { ThemeProvider } from '@/components/theme-provider'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <meta name="theme-color" content="#020617" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="CancharClub" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              '@context': 'https://schema.org',
              '@graph': [
                {
                  '@type': 'Organization',
                  '@id': 'https://cancharclub.com.ar/#organization',
                  name: 'CancharClub',
                  url: 'https://cancharclub.com.ar',
                  logo: 'https://cancharclub.com.ar/icon-512.png',
                  description: 'Plataforma de gestión integral y reservas online para complejos deportivos en Argentina.',
                  sameAs: [
                    'https://instagram.com/cancharclub',
                    'https://x.com/cancharclub'
                  ],
                  contactPoint: {
                    '@type': 'ContactPoint',
                    telephone: '+5493816001122',
                    contactType: 'customer service',
                    areaServed: 'AR',
                    availableLanguage: 'Spanish'
                  }
                },
                {
                  '@type': 'WebSite',
                  '@id': 'https://cancharclub.com.ar/#website',
                  url: 'https://cancharclub.com.ar',
                  name: 'CancharClub',
                  description: 'Gestión y Reservas de Canchas Deportivas',
                  publisher: {
                    '@id': 'https://cancharclub.com.ar/#organization'
                  },
                  inLanguage: 'es-AR'
                }
              ]
            })
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if (typeof window !== 'undefined' && 'serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost')) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.register('/sw.js').catch(function(err) {
                    console.warn('[SW] Falló registro:', err);
                  });
                });
              }
            `,
          }}
        />
      </head>
      <body className={`${inter.variable} ${outfit.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          storageKey="canchar_theme"
          enableSystem
          disableTransitionOnChange
        >
          <AppAutoUpdater />
          {children}
          <PwaInstallBanner />
          <Toaster
            position="top-right"
            richColors
            closeButton
            toastOptions={{
              duration: 4000,
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}

