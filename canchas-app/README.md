# CancharClub — Plataforma SaaS de Gestión y Reservas de Canchas

Sistema full-stack de administración integral de complejos deportivos, reservas de turnos en tiempo real, señas automáticas por Mercado Pago MLA y portal público del jugador.

## Arquitectura y Despliegue en Producción

- **Hosting & Edge Runtime**: [Cloudflare Workers](https://workers.cloudflare.com/) optimizado con [`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare).
- **Dominio Principal**: [https://cancharclub.com.ar](https://cancharclub.com.ar)
- **Base de Datos & Autenticación**: PostgreSQL en Supabase con Row Level Security (RLS) activo y Supabase Realtime vía WebSockets.
- **Cobros & Pasarela de Pagos**: Mercado Pago MLA (Checkout Pro, Débito Automático con validación bancaria real y Webhooks transaccionales).
- **Motor de Tareas Programadas (Crons)**: Cloudflare Cron Triggers (`0 4,6,10,12,18 * * *`) y endpoint seguro `/api/cron/keep-alive`.

## Comandos de Desarrollo y Compilación

Dentro del directorio `canchas-app/`:

```bash
# Desarrollo local
npm run dev

# Verificación de tipos estricta
npx tsc --noEmit

# Compilación para Cloudflare Workers
npm run build:cloudflare

# Previsualización local en runtime workerd (Miniflare)
npm run preview:cloudflare

# Despliegue manual directo a Cloudflare
npm run deploy:cloudflare
```

## Integración Continua (CI/CD)

Las compilaciones y publicaciones a producción se ejecutan de forma automática a través de **Cloudflare Workers Builds** cada vez que se envía un `git push` a la rama `main` de GitHub.
