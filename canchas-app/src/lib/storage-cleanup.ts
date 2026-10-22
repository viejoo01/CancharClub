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

    if (!storage) return

    const keysToRemove: string[] = []

    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i)
      if (!key) continue

      // Claves sensibles de la aplicación
      if (
        (key.startsWith('canchar_') || key.startsWith('demo_') || key.includes('snapshot') || key.includes('venue')) &&
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

    // Limpiar también cualquier dato de sesión en memoria del navegador
    if (session) {
      try {
        session.clear()
      } catch {}
    }
  } catch (err) {
    console.warn('[clearClientSensitiveStorage] Error al limpiar almacenamiento local:', err)
  }
}
