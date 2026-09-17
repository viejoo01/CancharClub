// CancharClub PWA Service Worker - Auto-Bust Cache (v2-live)

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(keys.map((key) => caches.delete(key)))
    }).then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return

  // Navegación de páginas: SIEMPRE desde la red para ver los cambios en tiempo real
  if (event.request.mode === 'navigate' || event.request.destination === 'document') {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    )
    return
  }

  // Recursos estáticos: Network-First con fallback
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
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
  const targetUrl = event.notification.data?.url || '/dashboard'
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url === targetUrl && 'focus' in client) {
          return client.focus()
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl)
      }
    })
  )
})
