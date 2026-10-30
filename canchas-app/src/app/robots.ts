import type { MetadataRoute } from 'next'

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'

  return {
    rules: [
      {
        userAgent: '*',
        allow: [
          '/',
          '/sumar-club',
          '/club/',
          '/torneo/',
          '/partido/',
          '/mis-reservas',
          '/api/availability',
          '/llms.txt',
        ],
        disallow: [
          '/dashboard/',
          '/superadmin/',
          '/auth/',
          '/onboarding/',
          '/billing/',
          '/api/',
          '/_next/',
        ],
      },
      // Reglas específicas para rastreadores de motores de búsqueda con IA
      {
        userAgent: ['GPTBot', 'ClaudeBot', 'PerplexityBot', 'Google-Extended', 'Applebot-Extended'],
        allow: [
          '/',
          '/sumar-club',
          '/club/',
          '/torneo/',
          '/partido/',
          '/llms.txt',
        ],
        disallow: [
          '/dashboard/',
          '/superadmin/',
          '/auth/',
          '/api/',
        ],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
    host: baseUrl,
  }
}
