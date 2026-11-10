---
name: pwa-deployment-production
description: Arquitectura Progressive Web App (PWA), instalación sin App Store/Play Store, optimización de despliegue en Vercel y monitoreo de producción para CancharClub.
---

# PWA & Production Deployment — Skill de Despliegue y Web Apps Progresivas

Esta skill define la configuración, estándares de instalación móvil sin intermediarios y las pautas de despliegue continuo en producción sobre Vercel.

---

## 1. Arquitectura Progressive Web App (PWA)

CancharClub opera como una **PWA completa**, permitiendo a dueños de clubes y jugadores instalar la aplicación en sus teléfonos (iOS y Android) y computadoras de escritorio **sin pasar por Google Play Store ni Apple App Store**.

### Ventajas Operativas Clave
1. **Cero Comisiones de Tiendas**: No se paga el 30% a Apple o Google ni costos de publicación de cuentas de desarrollador.
2. **Instalación Directa e Instantánea**:
   * **Android / Chrome / Edge**: Detección automática del banner `Añadir a la pantalla principal` o prompt programático `beforeinstallprompt`.
   * **iOS / Safari**: Menú `Compartir` ➔ `Agregar al inicio`.
3. **Experiencia Nativa**:
   * La app se ejecuta en modo `standalone` a pantalla completa, sin barra de direcciones ni controles del navegador.
   * Icono propio en el menú de aplicaciones del dispositivo.

### Componentes Técnicos Requeridos
* **Manifest (`src/app/manifest.ts` o `public/manifest.json`)**:
  ```typescript
  import type { MetadataRoute } from 'next';

  export default function manifest(): MetadataRoute.Manifest {
    return {
      name: 'CancharClub',
      short_name: 'CancharClub',
      description: 'Gestión inteligente y reservas de canchas deportivas',
      start_url: '/dashboard',
      display: 'standalone',
      background_color: '#020617',
      theme_color: '#10b981',
      icons: [
        {
          src: '/icons/icon-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'maskable',
        },
        {
          src: '/icons/icon-512x512.png',
          sizes: '512x512',
          type: 'image/png',
        },
      ],
    };
  }
  ```
* **Metadatos en `layout.tsx`**:
  - `apple-mobile-web-app-capable: 'yes'`
  - `apple-mobile-web-app-status-bar-style: 'black-translucent'`
  - `themeColor: '#020617'`

---

## 2. Checklist Obligatorio de Pre-Despliegue

Antes de fusionar ramas o empujar commits a `origin main` que disparen despliegues automáticos en Vercel:

1. **Chequeo de Tipos TypeScript**:
   ```bash
   cd canchas-app
   npx tsc --noEmit
   ```
   *Debe retornar 0 errores.*

2. **Compilación de Producción Local**:
   ```bash
   npm run build
   ```
   *Debe generar las páginas y rutas de la API en modo estático/dinámico sin excepciones.*

3. **Variables de Entorno Críticas**:
   Asegurar que Vercel tenga configuradas:
   * `NEXT_PUBLIC_SUPABASE_URL`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   * `SUPABASE_SERVICE_ROLE_KEY` (privada, solo servidor)
   * `MP_ACCESS_TOKEN` / `MP_WEBHOOK_SECRET`
   * `NEXT_PUBLIC_APP_URL` (`https://www.cancharclub.com.ar`)

---

## 3. Verificación Post-Despliegue

Tras confirmarse el build en Vercel, ejecutar una llamada al endpoint de salud para verificar la respuesta HTTP 200 y conectividad con la base de datos:
```bash
curl -I https://www.cancharclub.com.ar/api/health
```
