import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { GET as getDynamicManifest } from '@/app/api/manifest/route'

describe('PWA Comprehensive Automated Test Suite', () => {
  const publicDir = path.resolve(process.cwd(), 'public')

  // 1. MANIFEST W3C COMPLIANCE & ASSETS AUDIT
  describe('1. Web App Manifest Static & Dynamic Integrity', () => {
    it('public/manifest.json exists and satisfies W3C PWA standalone requirements', () => {
      const manifestPath = path.join(publicDir, 'manifest.json')
      expect(fs.existsSync(manifestPath)).toBe(true)

      const content = fs.readFileSync(manifestPath, 'utf-8')
      const manifest = JSON.parse(content)

      expect(manifest.name).toBe('CancharClub - Sistema de Canchas y Reservas')
      expect(manifest.short_name).toBe('CancharClub')
      expect(manifest.start_url).toBe('/app')
      expect(manifest.scope).toBe('/')
      expect(manifest.display).toBe('standalone')
      expect(manifest.background_color).toBe('#020617')
      expect(manifest.theme_color).toBe('#020617')
      expect(manifest.lang).toBe('es-AR')
      expect(Array.isArray(manifest.icons)).toBe(true)
      expect(manifest.icons.length).toBeGreaterThanOrEqual(4)

      // Verificar que incluye íconos para launcher maskable y standard any
      const hasMaskable = manifest.icons.some((i: { purpose?: string }) => i.purpose === 'maskable')
      const hasAny = manifest.icons.some((i: { purpose?: string }) => i.purpose === 'any' || !i.purpose)
      expect(hasMaskable).toBe(true)
      expect(hasAny).toBe(true)

      // Verificar accesos directos
      expect(Array.isArray(manifest.shortcuts)).toBe(true)
      expect(manifest.shortcuts.length).toBeGreaterThanOrEqual(2)
      const shortcutUrls = manifest.shortcuts.map((s: { url: string }) => s.url)
      expect(shortcutUrls).toContain('/app?role=player')
      expect(shortcutUrls).toContain('/mis-reservas')
      expect(shortcutUrls).toContain('/app?role=club')
      expect(shortcutUrls).toContain('/dashboard/caja')
    })

    it('all icons referenced in public/manifest.json physically exist in public/ directory', () => {
      const manifest = JSON.parse(fs.readFileSync(path.join(publicDir, 'manifest.json'), 'utf-8'))
      
      for (const icon of manifest.icons) {
        const cleanPath = icon.src.startsWith('/') ? icon.src.slice(1) : icon.src
        const iconPath = path.join(publicDir, cleanPath)
        expect(fs.existsSync(iconPath), `Icon file missing: ${icon.src}`).toBe(true)
        const stats = fs.statSync(iconPath)
        expect(stats.size, `Icon file is empty: ${icon.src}`).toBeGreaterThan(100)
      }
    })

    it('dynamic manifest /api/manifest?role=player outputs specialized Player PWA configuration', async () => {
      const req = new NextRequest('http://localhost:3000/api/manifest?role=player')
      const res = await getDynamicManifest(req)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/manifest+json')
      
      const json = await res.json()
      expect(json.start_url).toBe('/app?role=player')
      expect(json.id).toBe('https://cancharclub.com.ar/app?role=player')
      expect(json.name).toBe('CancharClub - Reservas de Canchas')
      expect(json.short_name).toBe('Canchar Reservas')
      expect(json.display).toBe('standalone')
    })

    it('dynamic manifest /api/manifest?role=club outputs specialized Club Management PWA configuration', async () => {
      const req = new NextRequest('http://localhost:3000/api/manifest?role=club')
      const res = await getDynamicManifest(req)

      expect(res.status).toBe(200)
      expect(res.headers.get('content-type')).toContain('application/manifest+json')
      
      const json = await res.json()
      expect(json.start_url).toBe('/app?role=club')
      expect(json.id).toBe('https://cancharclub.com.ar/app?role=club')
      expect(json.name).toBe('CancharClub - Gestión de Clubes')
      expect(json.short_name).toBe('Canchar Club')
      expect(json.display).toBe('standalone')
    })
  })

  // 2. SERVICE WORKER ARCHITECTURE & CACHING
  describe('2. Service Worker (sw.js) v8 Architecture & Security', () => {
    const swPath = path.join(publicDir, 'sw.js')

    it('public/sw.js exists and is properly configured', () => {
      expect(fs.existsSync(swPath)).toBe(true)
      const swCode = fs.readFileSync(swPath, 'utf-8')
      expect(swCode).toContain('const CACHE_NAME =')
      expect(swCode).toContain('const OFFLINE_URL = \'/offline.html\'')
    })

    it('all PRECACHE_ASSETS listed in sw.js exist on filesystem to prevent install failures', () => {
      const swCode = fs.readFileSync(swPath, 'utf-8')
      // Extraer array PRECACHE_ASSETS
      const match = swCode.match(/const PRECACHE_ASSETS = \[\s*([\s\S]*?)\s*\]/)
      expect(match).not.toBeNull()
      
      const rawAssets = match![1]
        .split('\n')
        .map(line => line.trim().replace(/['",]/g, ''))
        .filter(line => line.length > 0 && !line.startsWith('//') && line !== 'OFFLINE_URL')

      // Incluir OFFLINE_URL
      const assets = ['offline.html', ...rawAssets.map(a => a.startsWith('/') ? a.slice(1) : a)]

      for (const asset of assets) {
        const filePath = path.join(publicDir, asset)
        expect(fs.existsSync(filePath), `Precache asset missing: ${asset}`).toBe(true)
        const stats = fs.statSync(filePath)
        expect(stats.size, `Precache asset is empty: ${asset}`).toBeGreaterThan(50)
      }
    })

    it('sw.js strictly bypasses caching for dynamic APIs, auth, and Next.js RSC payloads', () => {
      const swCode = fs.readFileSync(swPath, 'utf-8')
      // Validar exclusión de rutas dinámicas
      expect(swCode).toContain("url.pathname.startsWith('/api/')")
      expect(swCode).toContain("url.pathname.startsWith('/auth/')")
      expect(swCode).toContain("url.searchParams.has('_rsc')")
    })

    it('sw.js implements Network-First navigation with fallback to OFFLINE_URL', () => {
      const swCode = fs.readFileSync(swPath, 'utf-8')
      expect(swCode).toContain("event.request.mode === 'navigate'")
      expect(swCode).toContain('cache.match(OFFLINE_URL)')
    })

    it('sw.js implements native Web Push notifications and notificationclick focus handler', () => {
      const swCode = fs.readFileSync(swPath, 'utf-8')
      expect(swCode).toContain("self.addEventListener('push'")
      expect(swCode).toContain("self.addEventListener('notificationclick'")
      expect(swCode).toContain('clients.openWindow')
    })
  })

  // 3. OFFLINE CONTINGENCY SYSTEM
  describe('3. Offline Contingency Page (offline.html)', () => {
    const offlinePath = path.join(publicDir, 'offline.html')

    it('public/offline.html is completely self-contained without external CDN dependencies', () => {
      expect(fs.existsSync(offlinePath)).toBe(true)
      const html = fs.readFileSync(offlinePath, 'utf-8')

      // Verificar que no depende de CDNs externas que fallarían sin red
      expect(html).not.toContain('https://fonts.googleapis.com')
      expect(html).not.toContain('https://cdn.tailwindcss.com')
      expect(html).not.toContain('https://cdnjs.cloudflare.com')
      expect(html).not.toContain('https://unpkg.com')

      // Verificar estilos embebidos y tipografía de sistema
      expect(html).toContain('<style>')
      expect(html).toContain('BlinkMacSystemFont')

      // Verificar soporte de contingencia de turnos y sincronización
      expect(html).toContain('renderOfflineSchedule')
      expect(html).toContain('canchar_today_schedule_snapshot')
      expect(html).toContain("window.addEventListener('online'")
    })
  })

  // 4. APPLE / IOS COMPLIANCE IN ROOT LAYOUT
  describe('4. Apple iOS Safari PWA Standalone Meta Tags', () => {
    const layoutPath = path.resolve(process.cwd(), 'src/app/layout.tsx')

    it('layout.tsx declares Apple Web App capabilities and theme-color', () => {
      expect(fs.existsSync(layoutPath)).toBe(true)
      const layoutCode = fs.readFileSync(layoutPath, 'utf-8')

      expect(layoutCode).toContain("name=\"apple-mobile-web-app-capable\" content=\"yes\"")
      expect(layoutCode).toContain("name=\"apple-mobile-web-app-status-bar-style\" content=\"black-translucent\"")
      expect(layoutCode).toContain("name=\"apple-mobile-web-app-title\" content=\"CancharClub\"")
      expect(layoutCode).toContain("rel=\"apple-touch-icon\" href=\"/apple-touch-icon.png\"")
      expect(layoutCode).toContain("name=\"theme-color\" content=\"#020617\"")
    })

    it('layout.tsx automatically registers the service worker upon page load', () => {
      const layoutCode = fs.readFileSync(layoutPath, 'utf-8')
      expect(layoutCode).toContain("navigator.serviceWorker.register('/sw.js')")
    })
  })
})
