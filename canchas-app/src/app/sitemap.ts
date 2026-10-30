import type { MetadataRoute } from 'next'
import { createServiceClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'
export const revalidate = 3600 // Revalidar cada 1 hora en producción

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'

  // 1. Rutas estáticas de alta prioridad
  const staticRoutes: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1.0,
    },
    {
      url: `${baseUrl}/sumar-club`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.9,
    },
    {
      url: `${baseUrl}/torneo`,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${baseUrl}/mis-reservas`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ]

  // 2. Rutas dinámicas de clubes activos y torneos en Supabase
  try {
    const supabase = await createServiceClient()

    const [tenantsResult, tournamentsResult] = await Promise.all([
      supabase
        .from('tenants')
        .select('slug, created_at')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(200),
      supabase
        .from('tournaments')
        .select('id, created_at, status')
        .in('status', ['DRAFT', 'PUBLISHED', 'IN_PROGRESS'])
        .order('created_at', { ascending: false })
        .limit(100),
    ])

    const clubRoutes: MetadataRoute.Sitemap = (tenantsResult.data || [])
      .filter((t) => Boolean(t.slug))
      .map((t) => ({
        url: `${baseUrl}/club/${t.slug}`,
        lastModified: t.created_at ? new Date(t.created_at) : new Date(),
        changeFrequency: 'hourly',
        priority: 0.9,
      }))

    const tournamentRoutes: MetadataRoute.Sitemap = (tournamentsResult.data || [])
      .filter((tr) => Boolean(tr.id))
      .map((tr) => ({
        url: `${baseUrl}/torneo/${tr.id}`,
        lastModified: tr.created_at ? new Date(tr.created_at) : new Date(),
        changeFrequency: 'daily',
        priority: 0.7,
      }))

    return [...staticRoutes, ...clubRoutes, ...tournamentRoutes]
  } catch (err) {
    console.warn('[sitemap] Error al generar sitemap dinámico desde Supabase:', err)
    return staticRoutes
  }
}
