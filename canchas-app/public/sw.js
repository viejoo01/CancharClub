// CancharClub PWA Service Worker - High-Performance Cache, Offline Contingency, Court Images & Background Sync (v9)

const CACHE_NAME = 'canchar-pwa-v9'
const IMAGES_CACHE = 'canchar-images-v1'
const OFFLINE_URL = '/offline.html'

const PRECACHE_ASSETS = [
  OFFLINE_URL,
  '/icon-192.png',
  '/icon-512.png',
  '/icon.svg',
  '/favicon.ico',
  '/favicon-32x32.png',
  '/favicon-16x16.png',
  '/apple-touch-icon.png',
  '/manifest.json'
]

// 1. Instalación del Service Worker y precaché de contingencia
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_ASSETS).catch((err) => {
        console.warn('[SW] Error precacheando recursos offline:', err)
      })
    })
  )
  self.skipWaiting()
})

// 2. Activación: limpieza de cachés obsoletos y toma de control de clientes
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== IMAGES_CACHE)
          .map((key) => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

// 3. Manejo inteligente de peticiones de red
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)

  // Rutas dinámicas, Server Actions, auth y APIs: NUNCA cachear en SW
  if (
    url.pathname.startsWith('/api/') || 
    url.pathname.startsWith('/auth/') ||
    url.searchParams.has('_rsc')
  ) {
    return
  }

  // A. Navegación de páginas (HTML): Network-First estricto con contingencia offline
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return networkResponse
        })
        .catch(async () => {
          // Si no hay red, servir la página de contingencia offline con la copia local de turnos
          const cache = await caches.open(CACHE_NAME)
          const offlinePage = await cache.match(OFFLINE_URL)
          return offlinePage || new Response('CancharClub sin conexión', {
            status: 503,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          })
        })
    )
    return
  }

  // B. Fotos de canchas, avatares y multimedia (Supabase Storage, _next/image, imágenes locales)
  // Estrategia Stale-While-Revalidate con soporte offline y respuestas opacas cross-origin
  const isImageRequest = 
    event.request.destination === 'image' ||
    url.pathname.includes('/storage/v1/object/public/') ||
    url.pathname.startsWith('/_next/image') ||
    url.pathname.match(/\.(png|jpg|jpeg|webp|svg|ico|avif)$/i)

  if (isImageRequest) {
    event.respondWith(
      caches.open(IMAGES_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request)

        const fetchPromise = fetch(event.request)
          .then((networkResponse) => {
            if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
              cache.put(event.request, networkResponse.clone()).catch(() => {})
            }
            return networkResponse
          })
          .catch(() => cachedResponse)

        return cachedResponse || fetchPromise
      })
    )
    return
  }

  // C. Recursos estáticos inmutables (_next/static, fuentes woff2)
  if (
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.endsWith('.woff2')
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse
        }
        return fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone()
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseClone).catch(() => {})
            })
          }
          return networkResponse
        }).catch(() => {
          return new Response(null, { status: 404 })
        })
      })
    )
    return
  }

  // D. Resto de peticiones: Red directa
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request)
      return cached || new Response(null, { status: 404 })
    })
  )
})

// 4. Background Sync: Sincronización en segundo plano de mutaciones offline (Cobros, altas)
self.addEventListener('sync', (event) => {
  if (event.tag === 'canchar-offline-sync') {
    event.waitUntil(
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientsList) => {
        clientsList.forEach((client) => {
          client.postMessage({ type: 'TRIGGER_OFFLINE_SYNC' })
        })
      })
    )
  }
})

// 5. Notificaciones Push nativas en el móvil
self.addEventListener('push', (event) => {
  let data = { 
    title: 'CancharClub', 
    body: 'Tenés una novedad en tus turnos.', 
    url: '/dashboard' 
  }

  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data.body = event.data.text()
    }
  }

  const options = {
    body: data.body,
    icon: '/icon-192.png',
    badge: '/favicon-32x32.png',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/dashboard'
    },
    actions: [
      { action: 'open', title: 'Ver Turno' },
      { action: 'dismiss', title: 'Descartar' }
    ]
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'CancharClub', options)
  )
})

// 6. Clic en la notificación: abrir o enfocar la app
self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  if (event.action === 'dismiss') {
    return
  }

  const targetPath = event.notification.data?.url || '/dashboard'
  const fullTargetUrl = new URL(targetPath, self.location.origin).href

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === fullTargetUrl && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(fullTargetUrl)
      }
    })
  )
})
