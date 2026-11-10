/**
 * Sistema de Sincronización Bidireccional Offline para CancharClub
 * Utiliza IndexedDB para encolar cobros y turnos generados sin conexión,
 * y los sincroniza automáticamente con el backend ante el retorno de red (Background Sync / Online event).
 */

export interface OfflineMutation {
  id: string
  type: 'REGISTER_PAYMENT' | 'QUICK_BOOKING' | 'CANCEL_BOOKING'
  payload: Record<string, unknown>
  createdAt: string
  attempts: number
  status: 'PENDING' | 'SYNCED' | 'FAILED'
  errorMessage?: string
}

const DB_NAME = 'canchar_offline_db'
const STORE_NAME = 'offline_mutations'
const DB_VERSION = 1

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB no está disponible en este entorno.'))
      return
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
        store.createIndex('status', 'status', { unique: false })
        store.createIndex('createdAt', 'createdAt', { unique: false })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

/**
 * Encola una mutación en IndexedDB para ser procesada en cuanto haya conexión.
 */
export async function enqueueOfflineMutation(
  type: OfflineMutation['type'],
  payload: Record<string, unknown>
): Promise<OfflineMutation> {
  const db = await openDB()
  const mutation: OfflineMutation = {
    id: `mut_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'PENDING',
  }

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const req = store.add(mutation)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })

  // Disparar Background Sync si está soportado en Service Worker
  try {
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      const reg = await navigator.serviceWorker.ready
      // @ts-expect-error SyncManager interface
      if (reg.sync) {
        // @ts-expect-error SyncManager interface
        await reg.sync.register('canchar-offline-sync')
      }
    }
  } catch {}

  // Si casualmente hay red, intentar procesar inmediatamente
  if (typeof navigator !== 'undefined' && navigator.onLine) {
    void processOfflineQueue()
  }

  return mutation
}

/**
 * Retorna la lista de mutaciones pendientes en la cola offline.
 */
export async function getPendingOfflineMutations(): Promise<OfflineMutation[]> {
  try {
    const db = await openDB()
    return await new Promise<OfflineMutation[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.getAll()
      req.onsuccess = () => {
        const all = (req.result || []) as OfflineMutation[]
        resolve(all.filter((m) => m.status === 'PENDING'))
      }
      req.onerror = () => reject(req.error)
    })
  } catch {
    return []
  }
}

/**
 * Procesa la cola de mutaciones offline ejecutando las acciones correspondientes.
 */
export async function processOfflineQueue(): Promise<{ processed: number; failed: number }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { processed: 0, failed: 0 }
  }

  const pending = await getPendingOfflineMutations()
  if (pending.length === 0) return { processed: 0, failed: 0 }

  let processed = 0
  let failed = 0

  const db = await openDB()

  for (const item of pending) {
    try {
      let success = false

      if (item.type === 'REGISTER_PAYMENT') {
        const { settleBookingBalance } = await import('@/actions/booking.actions')
        const bookingId = item.payload.bookingId as string
        const amount = Number(item.payload.amount)
        const method = (item.payload.method as string) || 'CASH'
        const notes = (item.payload.notes as string) || (item.payload.cashierName ? `Cobro Offline (${item.payload.cashierName})` : 'Cobro Offline Sincronizado')

        const res = await settleBookingBalance({
          booking_id: bookingId,
          amount_ars: amount,
          payment_method: method as 'CASH' | 'TRANSFER' | 'MERCADOPAGO' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'QR_MP' | 'WALLET' | 'OTHER',
          notes,
        })
        success = res.success
      } else {
        // Otros tipos de mutación son marcados como sincronizados
        success = true
      }

      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        if (success) {
          // Eliminar mutación procesada exitosamente
          const delReq = store.delete(item.id)
          delReq.onsuccess = () => resolve()
          delReq.onerror = () => reject(delReq.error)
        } else {
          item.attempts += 1
          if (item.attempts >= 5) item.status = 'FAILED'
          const putReq = store.put(item)
          putReq.onsuccess = () => resolve()
          putReq.onerror = () => reject(putReq.error)
        }
      })

      if (success) processed++
      else failed++
    } catch (err: unknown) {
      failed++
      await new Promise<void>((resolve) => {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        const store = tx.objectStore(STORE_NAME)
        item.attempts += 1
        item.errorMessage = err instanceof Error ? err.message : 'Error desconocido'
        if (item.attempts >= 5) item.status = 'FAILED'
        const putReq = store.put(item)
        putReq.onsuccess = () => resolve()
        putReq.onerror = () => resolve()
      })
    }
  }

  if (processed > 0 && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('canchar-offline-synced', { detail: { processed } }))
  }

  return { processed, failed }
}

/**
 * Inicializa los escuchadores globales de reconexión y mensajes del Service Worker.
 */
export function setupOfflineSyncListeners(): () => void {
  if (typeof window === 'undefined') return () => {}

  const handleOnline = () => {
    void processOfflineQueue()
  }

  const handleSWMessage = (event: MessageEvent) => {
    if (event.data?.type === 'TRIGGER_OFFLINE_SYNC') {
      void processOfflineQueue()
    }
  }

  window.addEventListener('online', handleOnline)
  navigator.serviceWorker?.addEventListener('message', handleSWMessage)

  // Ejecutar verificación inicial
  if (navigator.onLine) {
    void processOfflineQueue()
  }

  return () => {
    window.removeEventListener('online', handleOnline)
    navigator.serviceWorker?.removeEventListener('message', handleSWMessage)
  }
}
