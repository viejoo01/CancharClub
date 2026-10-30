/**
 * Utilidad de seguridad y privacidad en el cliente.
 * Purgar completamente datos sensibles almacenados en localStorage y sessionStorage
 * al cerrar sesión (nombres, teléfonos, turnos del día, tokens de recepción).
 * Preserva únicamente preferencias no sensibles de visualización como 'canchar_theme'.
 */
export function clearClientSensitiveStorage(): void {
  try {
    const storage = typeof window !== 'undefined' ? window.localStorage : (typeof globalThis !== 'undefined' ? (globalThis as unknown as { localStorage?: Storage }).localStorage : undefined)
    const session = typeof window !== 'undefined' ? window.sessionStorage : (typeof globalThis !== 'undefined' ? (globalThis as unknown as { sessionStorage?: Storage }).sessionStorage : undefined)

    if (storage) {
      const keysToRemove: string[] = []

      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i)
        if (!key) continue

        // Claves sensibles de la aplicación y tokens de Supabase Auth
        if (
          (key.startsWith('canchar_') ||
           key.startsWith('demo_') ||
           key.startsWith('sb-') ||
           key.includes('supabase') ||
           key.includes('auth-token') ||
           key.includes('snapshot') ||
           key.includes('venue')) &&
          key !== 'canchar_theme' // Preservar modo oscuro/claro
        ) {
          keysToRemove.push(key)
        }
      }

      keysToRemove.forEach((k) => {
        try {
          storage.removeItem(k)
        } catch {}
      })
    }

    // Limpiar también cualquier dato de sesión en memoria del navegador
    if (session) {
      try {
        session.clear()
      } catch {}
    }

    // Limpiar cookies accesibles en el navegador (document.cookie)
    if (typeof document !== 'undefined') {
      try {
        const cookiesList = document.cookie.split(';')
        for (const rawCookie of cookiesList) {
          const eqPos = rawCookie.indexOf('=')
          const name = eqPos > -1 ? rawCookie.substring(0, eqPos).trim() : rawCookie.trim()
          if (!name) continue

          if (
            name.startsWith('sb-') ||
            name.startsWith('canchar_') ||
            name.startsWith('demo_') ||
            name === 'sa_session' ||
            name === 'new_club_pending_activation'
          ) {
            document.cookie = `${name}=; path=/; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`
            if (typeof window !== 'undefined' && window.location.hostname) {
              document.cookie = `${name}=; path=/; domain=${window.location.hostname}; max-age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT`
            }
          }
        }
      } catch {}
    }
  } catch (err) {
    console.warn('[clearClientSensitiveStorage] Error al limpiar almacenamiento local:', err)
  }
}

