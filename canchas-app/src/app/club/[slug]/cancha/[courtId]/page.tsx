import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/server'
import { formatARS } from '@/lib/utils'
import { 
  ArrowLeft, 
  MapPin, 
  Share2, 
  Sparkles, 
  Trophy, 
  Zap, 
  Calendar, 
  ChevronRight,
  ShieldCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface Props {
  params: Promise<{ slug: string; courtId: string }>
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

function formatSurfaceName(raw?: string | null): string {
  if (!raw) return 'Césped Sintético'
  const s = raw.toUpperCase().trim()
  if (s.includes('CRISTAL') || s.includes('BLINDEX')) return 'Cristal Panorámico'
  if (s.includes('SINTETICO') || s.includes('CESPED')) return 'Césped Sintético Pro'
  if (s.includes('NATURAL')) return 'Césped Natural'
  if (s.includes('POLVO') || s.includes('LADRILLO')) return 'Polvo de Ladrillo'
  if (s.includes('ALFOMBRA')) return 'Alfombra Pro'
  if (s.includes('CEMENTO')) return 'Cemento Rápido'
  if (s.includes('PARQUET')) return 'Parquet'
  return raw.replace(/_/g, ' ')
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, courtId } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'
  const courtUrl = `${baseUrl}/club/${slug}/cancha/${courtId}`

  try {
    const supabase = await createServiceClient()
    const { data: club } = await supabase
      .from('tenants')
      .select('id, name, city, address, description, phone_whatsapp')
      .eq('slug', slug)
      .maybeSingle()

    const clubName = club?.name || 'Complejo Deportivo'
    const city = club?.city || 'Argentina'

    // Buscar la cancha por id o nombre
    let courtQuery = supabase
      .from('courts')
      .select('id, name, sport, surface, slot_duration_minutes, has_lights, is_indoor, image_url')
      .eq('is_active', true)

    if (club?.id) {
      courtQuery = courtQuery.eq('tenant_id', club.id)
    }

    courtQuery = courtQuery.or(`id.eq.${courtId},name.ilike.%${courtId}%`)
    const { data: court } = await courtQuery.maybeSingle()

    const courtName = court?.name || 'Cancha Deportiva'
    const sportLabel = formatSportName(court?.sport)
    const surfaceLabel = formatSurfaceName(court?.surface)

    // Precios de la cancha
    let courtPrice = 25000
    if (club?.id) {
      const { data: priceRules } = await supabase
        .from('price_rules')
        .select('court_id, price_cents, is_active')
        .eq('tenant_id', club.id)
        .eq('is_active', true)

      const matchingRules = (priceRules || []).filter(
        (r) => !r.court_id || (court && r.court_id === court.id)
      )
      if (matchingRules.length > 0) {
        courtPrice = Math.min(
          ...matchingRules.map((r) => Math.round((Number(r.price_cents) || 0) / 100))
        )
      }
    }

    const formattedPrice = formatARS(courtPrice)
    const title = `${courtName} • ${formattedPrice} | ${clubName}`
    const description = `Reservá tu turno en ${courtName} (${sportLabel} - ${surfaceLabel}) en ${clubName}, ${city}. Tarifa: ${formattedPrice}. Turnos en vivo con confirmación y seña online por Mercado Pago.`
    const ogImageUrl = `${baseUrl}/api/og/club?slug=${slug}&courtId=${courtId}&price=${courtPrice}&courtName=${encodeURIComponent(
      courtName
    )}&sport=${encodeURIComponent(sportLabel)}&surface=${encodeURIComponent(surfaceLabel)}`

    return {
      title,
      description,
      alternates: {
        canonical: courtUrl,
      },
      openGraph: {
        title,
        description,
        url: courtUrl,
        siteName: 'CancharClub',
        locale: 'es_AR',
        type: 'website',
        images: [
          {
            url: ogImageUrl,
            width: 1200,
            height: 630,
            alt: `${courtName} en ${clubName} - ${formattedPrice}`,
            type: 'image/png',
          },
        ],
      },
      twitter: {
        card: 'summary_large_image',
        title,
        description,
        images: [ogImageUrl],
      },
    }
  } catch (err) {
    console.warn('[cancha/generateMetadata] Error:', err)
    return {
      title: 'Cancha Deportiva | CancharClub',
      description: 'Reservá tu turno online en CancharClub con seña inmediata.',
      alternates: { canonical: courtUrl },
    }
  }
}

export default async function CourtSharePage({ params }: Props) {
  const { slug, courtId } = await params
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cancharclub.com.ar'
  const courtUrl = `${baseUrl}/club/${slug}/cancha/${courtId}`

  const supabase = await createServiceClient()
  const { data: club } = await supabase
    .from('tenants')
    .select('id, name, city, address, description, phone_whatsapp, instagram_handle')
    .eq('slug', slug)
    .maybeSingle()

  if (!club) {
    notFound()
  }

  // Buscar cancha
  const { data: court } = await supabase
    .from('courts')
    .select('id, name, sport, surface, slot_duration_minutes, has_lights, is_indoor, image_url')
    .eq('tenant_id', club.id)
    .or(`id.eq.${courtId},name.ilike.%${courtId}%`)
    .maybeSingle()

  if (!court) {
    notFound()
  }

  // Precios
  let courtPrice = 25000
  const { data: priceRules } = await supabase
    .from('price_rules')
    .select('court_id, price_cents, is_active')
    .eq('tenant_id', club.id)
    .eq('is_active', true)

  const matchingRules = (priceRules || []).filter(
    (r) => !r.court_id || r.court_id === court.id
  )
  if (matchingRules.length > 0) {
    courtPrice = Math.min(
      ...matchingRules.map((r) => Math.round((Number(r.price_cents) || 0) / 100))
    )
  }

  const sportLabel = formatSportName(court.sport)
  const surfaceLabel = formatSurfaceName(court.surface)
  const durationMinutes = court.slot_duration_minutes || (court.sport?.includes('FUTBOL') ? 60 : 90)
  const formattedPrice = formatARS(courtPrice)
  const depositPrice = Math.round(courtPrice * 0.5)

  const ogImageUrl = `${baseUrl}/api/og/club?slug=${slug}&courtId=${court.id}&price=${courtPrice}&courtName=${encodeURIComponent(
    court.name
  )}&sport=${encodeURIComponent(sportLabel)}&surface=${encodeURIComponent(surfaceLabel)}`

  // WhatsApp share link
  const shareText = encodeURIComponent(
    `¡Miren esta cancha para jugar! 🎾\n*${court.name}* en *${club.name}*\n• Tarifa: ${formattedPrice} (Seña ${formatARS(depositPrice)})\n• ${sportLabel} (${surfaceLabel})\n\nReservá el turno acá:\n${courtUrl}`
  )
  const waShareLink = `https://api.whatsapp.com/send?text=${shareText}`

  // Schema.org estructurado para Google y WhatsApp Crawlers
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Product',
        '@id': `${courtUrl}#product`,
        name: `${court.name} - ${club.name}`,
        description: `Alquiler y reserva online de ${court.name} (${sportLabel}, ${surfaceLabel}) en ${club.name}, ${club.city}. Turnos de ${durationMinutes} min con confirmación inmediata y seña con Mercado Pago.`,
        image: ogImageUrl,
        category: sportLabel,
        brand: {
          '@type': 'Brand',
          name: club.name,
        },
        offers: {
          '@type': 'Offer',
          '@id': `${courtUrl}#offer`,
          name: `Alquiler ${court.name} (${durationMinutes} min)`,
          price: courtPrice,
          priceCurrency: 'ARS',
          priceValidUntil: '2027-12-31',
          availability: 'https://schema.org/InStock',
          url: courtUrl,
          seller: {
            '@type': 'SportsActivityLocation',
            name: club.name,
            address: {
              '@type': 'PostalAddress',
              streetAddress: club.address || 'Complejo Deportivo',
              addressLocality: club.city || 'Argentina',
              addressCountry: 'AR',
            },
          },
        },
      },
      {
        '@type': 'SportsActivityLocation',
        '@id': `${baseUrl}/club/${slug}#place`,
        name: club.name,
        url: `${baseUrl}/club/${slug}`,
        address: {
          '@type': 'PostalAddress',
          streetAddress: club.address || 'Complejo Deportivo',
          addressLocality: club.city || 'Argentina',
          addressCountry: 'AR',
        },
        sport: [sportLabel],
      },
      {
        '@type': 'BreadcrumbList',
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
            name: club.name,
            item: `${baseUrl}/club/${slug}`,
          },
          {
            '@type': 'ListItem',
            position: 3,
            name: court.name,
            item: courtUrl,
          },
        ],
      },
    ],
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center">
      {/* Script Schema.org oficial */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(jsonLd),
        }}
      />

      <div className="w-full max-w-lg md:max-w-2xl flex-1 flex flex-col p-4 sm:p-6 border-x border-slate-900 bg-slate-950 space-y-6">
        {/* Barra superior de navegación */}
        <header className="flex items-center justify-between pb-3 border-b border-slate-900">
          <Link
            href={`/club/${slug}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Volver al Club</span>
          </Link>

          <Badge className="bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-xs px-2.5 py-0.5">
            Turnos Disponibles
          </Badge>
        </header>

        {/* Card Principal de la Cancha */}
        <div className="relative overflow-hidden rounded-3xl border border-emerald-500/30 bg-gradient-to-b from-slate-900 via-slate-900/90 to-slate-950 p-6 sm:p-8 shadow-2xl shadow-emerald-950/40 space-y-6">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-400">
                <Trophy className="w-4 h-4" />
                <span>{sportLabel.toUpperCase()}</span>
                <span>•</span>
                <span>{club.name}</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                {court.name}
              </h1>
              <p className="text-xs text-slate-400 flex items-center gap-1.5 pt-0.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>{club.address}, {club.city}</span>
              </p>
            </div>

            <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-emerald-400" />
            </div>
          </div>

          {/* Caja Radiante de Precio y Seña */}
          <div className="rounded-2xl border border-emerald-500/40 bg-emerald-950/20 p-4 sm:p-5 flex items-center justify-between gap-4 shadow-inner">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-300 block">
                Tarifa de Turno ({durationMinutes} min)
              </span>
              <span className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                {formattedPrice}
              </span>
              <span className="text-xs text-emerald-400/90 block mt-0.5 font-medium">
                Seña requerida: {formatARS(depositPrice)} (50%)
              </span>
            </div>

            <div className="text-right shrink-0">
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-300 bg-slate-900/80 px-2.5 py-1 rounded-full border border-slate-800">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Mercado Pago</span>
              </span>
            </div>
          </div>

          {/* Características de la Cancha */}
          <div className="space-y-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              Instalaciones y Superficie
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span className="text-slate-300">{surfaceLabel}</span>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-2">
                <span className="text-emerald-400">✓</span>
                <span className="text-slate-300">Turnos de {durationMinutes} min</span>
              </div>
              {court.has_lights && (
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-2">
                  <Zap className="w-3.5 h-3.5 text-yellow-400" />
                  <span className="text-slate-300">Iluminación LED Pro</span>
                </div>
              )}
              {court.is_indoor ? (
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-teal-400" />
                  <span className="text-slate-300">Cancha Techada</span>
                </div>
              ) : (
                <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center gap-2">
                  <span className="text-slate-400">🌤️</span>
                  <span className="text-slate-300">Al Aire Libre</span>
                </div>
              )}
            </div>
          </div>

          {/* Botones de Acción */}
          <div className="space-y-3 pt-2">
            <Link
              href={`/club/${slug}?courtId=${court.id}&sport=${court.sport}`}
              className="w-full block"
            >
              <Button
                className="w-full h-13 rounded-2xl bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-sm shadow-xl shadow-emerald-950/60 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99] transition-transform"
              >
                <Calendar className="w-4 h-4" />
                <span>Ver Horarios y Reservar Ahora</span>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </Link>

            <a
              href={waShareLink}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full block"
            >
              <Button
                variant="outline"
                className="w-full h-12 rounded-2xl border-emerald-500/40 text-emerald-300 hover:bg-emerald-950/40 hover:text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-colors"
              >
                <Share2 className="w-4 h-4 text-emerald-400" />
                <span>Compartir Cancha por WhatsApp</span>
              </Button>
            </a>
          </div>
        </div>

        {/* Footer Informativo */}
        <footer className="text-center text-xs text-slate-500 pt-4">
          <p>
            Al reservar en {club.name}, tu seña se procesa de forma segura a través de CancharClub.
          </p>
        </footer>
      </div>
    </div>
  )
}
