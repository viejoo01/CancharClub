// CancharClub PWA Service Worker - Auto-Bust Cache (v2-live)

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter(key => key !== 'canchar-v3').map(key => caches.delete(key))
      )
    }).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  const url = new URL(event.request.url)
  // Rutas dinámicas y de autenticación: siempre directo a la red sin interceptar
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
    return
  }

  // Navegación de páginas: SIEMPRE desde la red para ver los cambios en tiempo real
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).catch(async () => {
        const cached = await caches.match(event.request)
        return cached || new Response('Sin conexión', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
      })
    )
    return
  }

  // Recursos estáticos: Network-First con fallback seguro
  event.respondWith(
    fetch(event.request).catch(async () => {
      const cached = await caches.match(event.request)
      return cached || new Response(null, { status: 404 })
    })
  )
})

// Listener de Notificaciones Push (1B)
self.addEventListener('push', (event) => {
  let data = { title: 'CancharClub', body: 'Tu turno está por comenzar.', url: '/dashboard' }
  if (event.data) {
    try {
      data = event.data.json()
    } catch {
      data.body = event.data.text()
    }
  }

  const options = {
    body: data.body,
    icon: '/globe.svg',
    badge: '/globe.svg',
    vibrate: [100, 50, 100],
    data: {
      url: data.url || '/dashboard'
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'CancharClub', options)
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
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
