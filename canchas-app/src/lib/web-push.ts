/**
 * Utilidades para Notificaciones Web Push Nativas (PWA) en CancharClub
 * Soporta registro de permisos, suscripción PushManager y compatibilidad iOS/Android.
 */

export interface WebPushSubscriptionData {
  endpoint: string
  keys: {
    p256dh: string
    auth: string
  }
}

/**
 * Convierte una clave pública VAPID en Base64 URL a un Uint8Array para PushManager.
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

/**
 * Comprueba si el navegador actual soporta Web Push Notifications.
 */
export function isWebPushSupported(): boolean {
  if (typeof window === 'undefined') return false
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/**
 * Obtiene el estado actual del permiso de notificaciones ('default' | 'granted' | 'denied').
 */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isWebPushSupported()) return 'unsupported'
  return Notification.permission
}

/**
 * Solicita permiso al usuario y suscribe el navegador a notificaciones push.
 */
export async function subscribeToWebPush(
  vapidPublicKey?: string
): Promise<{ success: boolean; subscription?: WebPushSubscriptionData; error?: string }> {
  if (!isWebPushSupported()) {
    return { success: false, error: 'Web Push no está soportado en este navegador.' }
  }

  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { success: false, error: 'Permiso de notificaciones denegado por el usuario.' }
    }

    const registration = await navigator.serviceWorker.ready

    let subscription = await registration.pushManager.getSubscription()

    if (!subscription) {
      const options: PushSubscriptionOptionsInit = {
        userVisibleOnly: true,
      }

      const key = vapidPublicKey || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
      if (key) {
        options.applicationServerKey = urlBase64ToUint8Array(key) as unknown as BufferSource
      }

      subscription = await registration.pushManager.subscribe(options)
    }

    const rawSub = subscription.toJSON()

    return {
      success: true,
      subscription: {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: rawSub.keys?.p256dh || '',
          auth: rawSub.keys?.auth || '',
        },
      },
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error desconocido al suscribir a push.'
    return { success: false, error: msg }
  }
}

/**
 * Cancela la suscripción push activa del dispositivo.
 */
export async function unsubscribeFromWebPush(): Promise<boolean> {
  if (!isWebPushSupported()) return false
  try {
    const registration = await navigator.serviceWorker.ready
    const subscription = await registration.pushManager.getSubscription()
    if (subscription) {
      return await subscription.unsubscribe()
    }
    return true
  } catch {
    return false
  }
}
