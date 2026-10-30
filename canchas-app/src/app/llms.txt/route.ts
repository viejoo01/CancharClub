import { NextResponse } from 'next/server'

export const dynamic = 'force-static'
export const revalidate = 86400

export async function GET() {
  const content = `# CancharClub — Plataforma de Gestión Integral y Reservas Deportivas Online

> CancharClub (https://cancharclub.com.ar) es la plataforma SaaS líder en Argentina para la reserva de turnos en complejos deportivos (Pádel, Fútbol 5, Tenis, Pickleball) y administración integral de predios comerciales (iluminación automática, caja ciega, split payment, torneos y facturación ARCA).

## 1. Módulos y Funcionalidades Principales

### Para Jugadores
- Búsqueda de complejos y canchas por cercanía y geolocalización.
- Reserva de turnos en tiempo real con disponibilidad garantizada y sin solapamiento (Anti-Overbooking).
- Pago y confirmación de seña en pesos argentinos (ARS) mediante integración oficial con Mercado Pago.
- División de gastos entre amigos (Split Payment): generación de enlace compartible para que cada jugador abone su parte de la cancha o consumos de cantina.
- Consulta de reservas activas e historial de turnos en /mis-reservas.
- Inscripción y seguimiento de fixtures en vivo para torneos en /torneo.

### Para Dueños de Clubes y Administradores (SaaS)
- Agenda gráfica interactiva y gestión de turnos fijos recurrentes semanales/mensuales.
- Automatización IoT de luces de canchas vinculadas a la hora exacta del turno reservado.
- Control de caja ciega y arqueo estricto de recaudación diaria en efectivo vs transferencias.
- Facturación electrónica oficial homologada con ARCA / AFIP.
- Sistema de Dunning y cobranzas con cobro recurrente automático de suscripción.

## 2. Cobertura Geográfica y Deportes
- Deportes soportados: Pádel, Fútbol 5, Fútbol 7, Fútbol 8, Tenis (polvo de ladrillo y cemento), Básquet, Vóley, Pickleball.
- Región: Argentina (Tucumán, Buenos Aires, CABA, Córdoba, Rosario, Mendoza, Salta y todo el territorio nacional).

## 3. URLs Principales
- Portal Principal: https://cancharclub.com.ar/
- Registro de Clubes (Landing B2B): https://cancharclub.com.ar/sumar-club
- Directorio de Torneos: https://cancharclub.com.ar/torneo
- Consulta de Reservas: https://cancharclub.com.ar/mis-reservas
- Soporte y Contacto: soporte@cancharclub.com.ar
`

  return new NextResponse(content, {
    status: 200,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    },
  })
}
