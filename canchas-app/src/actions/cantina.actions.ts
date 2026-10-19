'use server'
// src/actions/cantina.actions.ts
// ==============================================================================
// SERVER ACTIONS — Cantina & Kiosco con persistencia en Supabase
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { assertTenantMember } from '@/lib/auth-security'
import { sanitizeText } from '@/lib/sanitize'
import { 
  type CantinaProduct, 
  type CantinaSupplier, 
  type CantinaCategory,
  DEFAULT_CANTINA_SUPPLIERS,
  DEFAULT_CANTINA_CATEGORIES 
} from '@/config/cantina-data'

// Cache en memoria en el servidor (TTL 60s)
const cantinaProductsCache = new Map<string, { data: CantinaProduct[]; timestamp: number }>()
const cantinaSuppliersCache = new Map<string, { data: CantinaSupplier[]; timestamp: number }>()
const cantinaCategoriesCache = new Map<string, { data: CantinaCategory[]; timestamp: number }>()
const CANTINA_CACHE_TTL_MS = 60000

// Mutex secuencial por tenant para garantizar concurrencia atómica estricta en stock e inventario
const tenantStockLocks = new Map<string, Promise<unknown>>()

export async function withTenantStockLock<T>(tenantId: string, task: () => Promise<T>): Promise<T> {
  const cleanId = tenantId.trim()
  const previousLock = tenantStockLocks.get(cleanId) || Promise.resolve()

  let releaseLock: () => void
  const currentLock = new Promise<void>((resolve) => {
    releaseLock = resolve
  })

  tenantStockLocks.set(cleanId, currentLock)

  try {
    await previousLock.catch(() => {})
    return await task()
  } finally {
    releaseLock!()
    if (tenantStockLocks.get(cleanId) === currentLock) {
      tenantStockLocks.delete(cleanId)
    }
  }
}

export interface StockDelta {
  productId?: string
  name?: string
  delta: number
}

export async function invalidateCantinaCache(tenantId?: string) {
  if (tenantId) {
    cantinaProductsCache.delete(tenantId)
    cantinaSuppliersCache.delete(tenantId)
  } else {
    cantinaProductsCache.clear()
    cantinaSuppliersCache.clear()
  }
}

export type { CantinaProduct, CantinaSupplier }

export type OrderStatus = 'PENDING' | 'PREPARING' | 'DELIVERED' | 'CANCELLED'
export type CantinaPaymentMethod = 'TRANSFER' | 'CASH' | 'QR_MP' | 'CUENTA_CORRIENTE'
export type CantinaPaymentStatus = 'PAID' | 'PENDING'

export interface OrderItem {
  product_id: string
  name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface CourtOrder {
  id: string
  tenant_id: string
  court_id: string | null
  court_name: string
  customer_name: string
  items: OrderItem[]
  total_ars: number
  status: OrderStatus
  payment_method?: CantinaPaymentMethod
  payment_status?: CantinaPaymentStatus
  notes: string | null
  created_at: string
  updated_at: string
}

export interface CreateOrderPayload {
  tenant_id: string
  court_id?: string | null
  court_name: string
  customer_name: string
  items: OrderItem[]
  total_ars: number
  payment_method?: CantinaPaymentMethod
  payment_status?: CantinaPaymentStatus
  notes?: string | null
}

function extractPaymentMethod(order: { notes?: string | null; payment_method?: string }): CantinaPaymentMethod {
  if (order.payment_method === 'TRANSFER' || order.payment_method === 'CASH' || order.payment_method === 'QR_MP' || order.payment_method === 'CUENTA_CORRIENTE') {
    return order.payment_method
  }
  const notes = order.notes || ''
  if (notes.includes('CUENTA_CORRIENTE') || notes.toLowerCase().includes('cuenta corriente') || notes.toLowerCase().includes('fiado')) return 'CUENTA_CORRIENTE'
  if (notes.includes('TRANSFER') || notes.toLowerCase().includes('transferencia')) return 'TRANSFER'
  if (notes.includes('QR_MP') || notes.toLowerCase().includes('mp') || notes.toLowerCase().includes('mercado pago')) return 'QR_MP'
  return 'CASH'
}

// ─── Crear nuevo pedido ───────────────────────────────────────────────────────

export async function createCourtOrder(
  payload: CreateOrderPayload
): Promise<{ success: boolean; order?: CourtOrder; error?: string }> {
  try {
    const supabase = await createServiceClient()
    const method = payload.payment_method || 'CASH'
    const statusPayment = payload.payment_status || (method === 'TRANSFER' ? 'PAID' : 'PENDING')
    
    // Sanitizar entradas
    const safeCustomerName = sanitizeText(payload.customer_name || 'Cliente', 60)
    const safeCourtName = sanitizeText(payload.court_name || 'Cancha', 40)
    const safeNotes = payload.notes ? sanitizeText(payload.notes, 200) : ''
    const safeTotal = Math.max(0, Number(payload.total_ars) || 0)

    // Incluir tag en notas para compatibilidad retroactiva garantizada
    const paymentTag = `[PAGO: ${method}]`
    const combinedNotes = safeNotes 
      ? (safeNotes.includes('[PAGO:') ? safeNotes : `${paymentTag} ${safeNotes}`)
      : paymentTag

    // Intentar insertar con columnas payment_method y payment_status
    const insertData: Record<string, unknown> = {
      tenant_id:     payload.tenant_id,
      court_id:      payload.court_id ?? null,
      court_name:    safeCourtName,
      customer_name: safeCustomerName,
      items:         payload.items,
      total_ars:     safeTotal,
      status:        'PENDING',
      payment_method: method,
      payment_status: statusPayment,
      notes:         combinedNotes,
    }

    let { data, error } = await supabase
      .from('court_orders')
      .insert(insertData)
      .select()
      .single()

    // Si falla porque la tabla court_orders no existe (PGRST205), persistir en audit_log como respaldo garantizado
    if (error && (error.code === 'PGRST205' || error.message.includes('court_orders') || error.message.includes('schema cache'))) {
      const orderId = crypto.randomUUID()
      const nowIso = new Date().toISOString()
      const fallbackOrder: CourtOrder = {
        id: orderId,
        tenant_id: payload.tenant_id,
        court_id: payload.court_id ?? null,
        court_name: payload.court_name,
        customer_name: payload.customer_name,
        items: payload.items,
        total_ars: payload.total_ars,
        status: 'PENDING',
        payment_method: method,
        payment_status: statusPayment,
        notes: combinedNotes,
        created_at: nowIso,
        updated_at: nowIso,
      }

      const auditRes = await supabase.from('audit_log').insert({
        tenant_id: payload.tenant_id,
        action: 'COURT_ORDER',
        table_name: 'court_orders',
        record_id: orderId,
        new_data: fallbackOrder,
      })

      if (auditRes.error) {
        console.error('[createCourtOrder] Fallback audit_log error:', auditRes.error.message)
        return { success: false, error: auditRes.error.message }
      }

      // Descontar inventario automáticamente mediante delta atómico con mutex por club
      try {
        const deltas = payload.items.map(i => ({
          productId: i.product_id,
          name: i.name,
          delta: -Math.abs(i.quantity),
        }))
        await atomicModifyStock(payload.tenant_id, deltas)
      } catch (stockErr) {
        console.warn('[createCourtOrder] Fallback atomic stock deduction notice:', stockErr)
      }

      revalidatePath('/dashboard/cantina')
      revalidatePath('/dashboard/caja')
      return { success: true, order: fallbackOrder }
    }

    // Si falla porque las columnas nuevas no están creadas en Postgres, fallback a campos estándar
    if (error && (error.message.includes('payment_method') || error.message.includes('column'))) {
      const fallbackData = {
        tenant_id:     payload.tenant_id,
        court_id:      payload.court_id ?? null,
        court_name:    payload.court_name,
        customer_name: payload.customer_name,
        items:         payload.items,
        total_ars:     payload.total_ars,
        status:        'PENDING',
        notes:         combinedNotes,
      }
      const retry = await supabase
        .from('court_orders')
        .insert(fallbackData)
        .select()
        .single()
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error('[createCourtOrder] Error:', error.message)
      return { success: false, error: error.message }
    }

    const createdOrder = data as unknown as CourtOrder
    if (createdOrder && !createdOrder.payment_method) {
      createdOrder.payment_method = method
      createdOrder.payment_status = statusPayment
    }

    // Descontar inventario automáticamente del catálogo del club mediante delta atómico
    try {
      const deltas = payload.items.map(i => ({
        productId: i.product_id,
        name: i.name,
        delta: -Math.abs(i.quantity),
      }))
      await atomicModifyStock(payload.tenant_id, deltas)
    } catch (stockErr) {
      console.warn('[createCourtOrder] Atomic stock deduction notice:', stockErr)
    }

    revalidatePath('/dashboard/cantina')
    revalidatePath('/dashboard/caja')
    return { success: true, order: createdOrder }
  } catch (err) {
    console.error('[createCourtOrder] Unexpected:', err)
    return { success: false, error: 'Error al crear el pedido' }
  }
}

// ─── Actualizar estado del pedido ─────────────────────────────────────────────

export async function updateOrderStatus(
  orderId: string,
  status: OrderStatus
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createServiceClient()

    // 0. Validar permisos sobre el club correspondiente
    // Obtener detalles de la orden para saber items y estado previo
    const { data: order } = await supabase
      .from('court_orders')
      .select('id, tenant_id, status, items, notes, payment_method')
      .eq('id', orderId)
      .maybeSingle()

    const orderTenantId = order?.tenant_id
    if (orderTenantId) {
      const auth = await assertTenantMember(orderTenantId)
      if (!auth.authorized) {
        return { success: false, error: auth.error || 'Sin permisos para actualizar pedidos de este club' }
      }
    } else {
      const auth = await assertTenantMember()
      if (!auth.authorized) {
        return { success: false, error: auth.error || 'Sin permisos para actualizar pedidos' }
      }
    }

    const previousStatus = order?.status
    const isCredit = String(order?.payment_method || '').toUpperCase().includes('CORRIENTE') ||
                     String(order?.notes || '').toUpperCase().includes('CUENTA CORRIENTE') ||
                     String(order?.notes || '').toUpperCase().includes('FIADO')

    const updateFields: Record<string, unknown> = {
      status,
      updated_at: new Date().toISOString(),
    }
    if (status === 'DELIVERED' && !isCredit) {
      updateFields.payment_status = 'PAID'
    }

    const { error } = await supabase
      .from('court_orders')
      .update(updateFields)
      .eq('id', orderId)

    // Fallback si court_orders no existe
    if (error && (error.code === 'PGRST205' || error.message.includes('court_orders') || error.message.includes('schema cache'))) {
      const { data: auditRows } = await supabase
        .from('audit_log')
        .select('*')
        .eq('record_id', orderId)
        .eq('action', 'COURT_ORDER')
        .limit(1)

      if (auditRows && auditRows.length > 0) {
        const currentData = (auditRows[0].new_data ?? {}) as Record<string, unknown>
        const updatedData = {
          ...currentData,
          status,
          ...(status === 'DELIVERED' && !isCredit ? { payment_status: 'PAID' } : {}),
          updated_at: new Date().toISOString()
        }
        await supabase
          .from('audit_log')
          .update({ new_data: updatedData })
          .eq('id', auditRows[0].id)
        
        revalidatePath('/dashboard/cantina')
        return { success: true }
      }
    }

    if (error) {
      console.error('[updateOrderStatus] Error:', error.message)
      return { success: false, error: error.message }
    }

    // Si se cancela un pedido que antes no estaba cancelado, reintegrar stock al inventario
    if (status === 'CANCELLED' && previousStatus !== 'CANCELLED' && orderTenantId) {
      try {
        const orderItems = order?.items as OrderItem[] | undefined
        if (Array.isArray(orderItems) && orderItems.length > 0) {
          const deltas = orderItems.map(i => ({
            productId: i.product_id,
            name: i.name,
            delta: Math.abs(i.quantity),
          }))
          await atomicModifyStock(orderTenantId, deltas)
        }
      } catch (cancelErr) {
        console.warn('[updateOrderStatus] Restoring stock notice:', cancelErr)
      }
    } else if (status !== 'CANCELLED' && previousStatus === 'CANCELLED' && orderTenantId) {
      // Si se reactiva un pedido previamente cancelado, volver a descontar el stock
      try {
        const orderItems = order?.items as OrderItem[] | undefined
        if (Array.isArray(orderItems) && orderItems.length > 0) {
          const deltas = orderItems.map(i => ({
            productId: i.product_id,
            name: i.name,
            delta: -Math.abs(i.quantity),
          }))
          await atomicModifyStock(orderTenantId, deltas)
        }
      } catch (reErr) {
        console.warn('[updateOrderStatus] Re-deducting stock notice:', reErr)
      }
    }

    revalidatePath('/dashboard/cantina')
    revalidatePath('/dashboard/caja')
    return { success: true }
  } catch (err) {
    console.error('[updateOrderStatus] Unexpected:', err)
    return { success: false, error: 'Error al actualizar el estado' }
  }
}

// ─── Obtener pedidos del día ──────────────────────────────────────────────────

export async function getDailyOrders(
  tenantId: string,
  date?: string // 'YYYY-MM-DD', default = hoy
): Promise<CourtOrder[]> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return []
    }

    const supabase = await createServiceClient()
    
    // Fecha en zona horaria local de Argentina (UTC-3)
    const argentinaToday = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Tucuman' }).format(new Date())
    const targetDate = date ?? argentinaToday
    const dayStart = new Date(`${targetDate}T00:00:00-03:00`).toISOString()
    const dayEnd   = new Date(`${targetDate}T23:59:59-03:00`).toISOString()

    // Traer todos los pedidos pendientes o en preparación (para que nunca se pierdan de la vista en vivo)
    // o los pedidos creados en el día seleccionado
    const { data, error } = await supabase
      .from('court_orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .or(`and(created_at.gte.${dayStart},created_at.lte.${dayEnd}),status.in.(PENDING,PREPARING)`)
      .neq('status', 'CANCELLED')
      .order('created_at', { ascending: false })

    // Fallback: si court_orders no existe en Supabase, leer de audit_log
    if (error && (error.code === 'PGRST205' || error.message.includes('court_orders') || error.message.includes('schema cache'))) {
      const { data: auditData, error: auditError } = await supabase
        .from('audit_log')
        .select('new_data')
        .eq('tenant_id', tenantId)
        .eq('action', 'COURT_ORDER')
        .eq('table_name', 'court_orders')
        .order('created_at', { ascending: false })

      if (auditError) {
        console.warn('[getDailyOrders] Fallback audit_log error:', auditError.message)
        return []
      }

      const rawOrders = (auditData ?? [])
        .map(row => row.new_data as unknown as CourtOrder)
        .filter(Boolean)
        .filter(o => o.status !== 'CANCELLED')

      return rawOrders.map(o => ({
        ...o,
        payment_method: o.payment_method || extractPaymentMethod(o),
        payment_status: o.payment_status || (extractPaymentMethod(o) === 'TRANSFER' ? 'PAID' : 'PENDING'),
      }))
    }

    if (error) {
      console.warn('[getDailyOrders] Warning:', error.message)
      return []
    }

    const orders = ((data as unknown as CourtOrder[]) ?? []).map(o => ({
      ...o,
      payment_method: o.payment_method || extractPaymentMethod(o),
      payment_status: o.payment_status || (extractPaymentMethod(o) === 'TRANSFER' ? 'PAID' : 'PENDING'),
    }))

    return orders
  } catch (err) {
    console.error('[getDailyOrders] Error inesperado:', err)
    return []
  }
}

// ─── Obtener estadísticas de cantina del mes ──────────────────────────────────

export interface CantinaStats {
  totalRevenue: number
  totalOrders: number
  avgTicket: number
  topProducts: { name: string; quantity: number; revenue: number }[]
}

export async function getCantinaStats(tenantId: string): Promise<CantinaStats> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { totalRevenue: 0, totalOrders: 0, avgTicket: 0, topProducts: [] }
    }

    const supabase = await createServiceClient()
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString()

    const { data } = await supabase
      .from('court_orders')
      .select('total_ars, items')
      .eq('tenant_id', tenantId)
      .gte('created_at', thirtyDaysAgo)
      .eq('status', 'DELIVERED')

    const orders = (data ?? []) as { total_ars: number; items: OrderItem[] }[]
    const totalRevenue = orders.reduce((s, o) => s + (o.total_ars ?? 0), 0)
    const totalOrders  = orders.length
    const avgTicket    = totalOrders > 0 ? Math.round(totalRevenue / totalOrders) : 0

    // Agrupar por producto
    const productMap: Record<string, { quantity: number; revenue: number }> = {}
    for (const order of orders) {
      for (const item of order.items ?? []) {
        if (!productMap[item.name]) productMap[item.name] = { quantity: 0, revenue: 0 }
        productMap[item.name].quantity += item.quantity
        productMap[item.name].revenue  += item.subtotal
      }
    }
    const topProducts = Object.entries(productMap)
      .map(([name, v]) => ({ name, ...v }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5)

    return { totalRevenue, totalOrders, avgTicket, topProducts }
  } catch {
    return { totalRevenue: 0, totalOrders: 0, avgTicket: 0, topProducts: [] }
  }
}

// ─── GESTIÓN DE INVENTARIO Y CATÁLOGO DE PRODUCTOS ───────────────────────────

const DEMO_PRODUCT_IDS = new Set(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8'])
const DEMO_PRODUCT_NAMES = new Set([
  'gatorade / powerade 500ml',
  'agua mineral 500ml',
  'cerveza corona / stella 330ml',
  'tubo pelotas pádel x3 (bullpadel)',
  'tubo pelotas padel x3 (bullpadel)',
  'alquiler de paleta de pádel',
  'alquiler de paleta de padel',
  'overgrip wilson / bullpadel',
  'barra de cereal / proteica',
  'papas fritas / maní snack',
  'papas fritas / mani snack'
])

export async function fetchFreshCantinaProducts(cleanTenantId: string): Promise<CantinaProduct[]> {
  const cleanId = cleanTenantId.trim()
  if (!cleanId) return []

  const supabase = await createServiceClient()

  // 1. Prioridad: Consulta relacional a public.products
  try {
    const { data: dbProducts, error: prodError } = await supabase
      .from('products')
      .select('id, name, category, price_cents, stock, is_active')
      .eq('tenant_id', cleanId)
      .eq('is_active', true)
      .order('name', { ascending: true })

    if (!prodError && dbProducts && dbProducts.length > 0) {
      return dbProducts.map((p: { id: string; name: string; category?: string; price_cents?: number; stock?: number; is_active?: boolean }) => ({
        id: p.id,
        name: p.name,
        category: p.category || 'BEBIDAS',
        price: (p.price_cents ?? 0) / 100,
        stock: p.stock ?? 0,
        is_active: p.is_active ?? true,
      }))
    }
  } catch (err) {
    console.warn('[fetchFreshCantinaProducts] Fallback a audit_log por error en tabla products:', err)
  }

  // 2. Fallback retroactivo: audit_log (NoSQL blob)
  const { data, error } = await supabase
    .from('audit_log')
    .select('new_data')
    .eq('tenant_id', cleanId)
    .eq('action', 'CANTINA_PRODUCT_CATALOG')
    .eq('table_name', 'cantina_products')
    .order('created_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0 || !data[0].new_data) {
    return []
  }

  const catalog = data[0].new_data as { products: CantinaProduct[] }
  let productsList: CantinaProduct[] = []
  if (Array.isArray(catalog.products)) {
    productsList = catalog.products.filter(
      p => !DEMO_PRODUCT_IDS.has(p.id) && !DEMO_PRODUCT_NAMES.has(p.name?.toLowerCase().trim())
    )
  }

  // 3. Migración transparente: Si existen productos en audit_log y la tabla products está vacía,
  // persistir en background para sincronización relacional permanente
  if (productsList.length > 0) {
    try {
      const rows = productsList.map(p => ({
        id: p.id,
        tenant_id: cleanId,
        name: p.name,
        category: p.category || 'BEBIDAS',
        price_cents: Math.round((p.price || 0) * 100),
        stock: Math.max(0, p.stock || 0),
        is_active: p.is_active ?? true,
        updated_at: new Date().toISOString()
      }))
      await supabase.from('products').upsert(rows, { onConflict: 'id' })
    } catch {
      // Ignorar de forma no bloqueante si la tabla aún se está migrando
    }
  }

  return productsList
}

async function saveCantinaProductsDirect(
  cleanTenantId: string,
  products: CantinaProduct[]
): Promise<void> {
  const cleanId = cleanTenantId.trim()
  const supabase = await createServiceClient()

  // 1. Sincronización relacional atómica en tabla products
  try {
    if (products.length > 0) {
      const rows = products.map(p => ({
        id: p.id,
        tenant_id: cleanId,
        name: p.name,
        category: p.category || 'BEBIDAS',
        price_cents: Math.round((p.price || 0) * 100),
        stock: Math.max(0, p.stock || 0),
        is_active: p.is_active ?? true,
        updated_at: new Date().toISOString()
      }))
      await supabase.from('products').upsert(rows, { onConflict: 'id' })
    }
  } catch (err) {
    console.warn('[saveCantinaProductsDirect] Error en tabla products:', err)
  }

  // 2. Respaldo retroactivo dual-write en audit_log
  try {
    const { data: existing } = await supabase
      .from('audit_log')
      .select('id')
      .eq('tenant_id', cleanId)
      .eq('action', 'CANTINA_PRODUCT_CATALOG')
      .eq('table_name', 'cantina_products')
      .order('created_at', { ascending: false })
      .limit(1)

    if (existing && existing.length > 0) {
      await supabase
        .from('audit_log')
        .update({
          new_data: { products, updated_at: new Date().toISOString() }
        })
        .eq('id', existing[0].id)
    } else {
      await supabase.from('audit_log').insert({
        tenant_id: cleanId,
        action: 'CANTINA_PRODUCT_CATALOG',
        table_name: 'cantina_products',
        record_id: cleanId,
        new_data: { products, updated_at: new Date().toISOString() }
      })
    }
  } catch (auditErr) {
    console.warn('[saveCantinaProductsDirect] Audit log warning:', auditErr)
  }

  cantinaProductsCache.set(cleanId, { data: products, timestamp: Date.now() })
  revalidatePath('/dashboard/cantina')
}

export async function atomicModifyStock(
  tenantId: string,
  deltas: StockDelta[]
): Promise<{ success: boolean; products: CantinaProduct[]; error?: string }> {
  const cleanTenantId = tenantId.trim()
  if (!cleanTenantId || !Array.isArray(deltas) || deltas.length === 0) {
    return { success: true, products: [] }
  }

  return withTenantStockLock(cleanTenantId, async () => {
    try {
      cantinaProductsCache.delete(cleanTenantId)
      const supabase = await createServiceClient()
      const currentProducts = await fetchFreshCantinaProducts(cleanTenantId)
      if (currentProducts.length === 0) {
        return { success: true, products: [] }
      }

      let hasChanges = false
      const updatedProducts = currentProducts.map(p => {
        const itemDelta = deltas.find(d =>
          (d.productId && d.productId === p.id) ||
          (d.name && d.name.trim().toLowerCase() === p.name.trim().toLowerCase())
        )
        if (itemDelta && itemDelta.delta !== 0) {
          hasChanges = true
          const nextStock = Math.max(0, (p.stock || 0) + itemDelta.delta)
          return { ...p, stock: nextStock }
        }
        return p
      })

      if (hasChanges) {
        // Actualizar atómicamente a nivel de fila en PostgreSQL para evitar carreras
        for (const d of deltas) {
          if (!d.delta) continue
          const target = updatedProducts.find(p =>
            (d.productId && d.productId === p.id) ||
            (d.name && d.name.trim().toLowerCase() === p.name.trim().toLowerCase())
          )
          if (target) {
            try {
              await supabase
                .from('products')
                .update({ stock: target.stock, updated_at: new Date().toISOString() })
                .eq('tenant_id', cleanTenantId)
                .eq('id', target.id)
            } catch {
              // Fallback manejado por saveCantinaProductsDirect
            }
          }
        }

        await saveCantinaProductsDirect(cleanTenantId, updatedProducts)
        return { success: true, products: updatedProducts }
      }

      return { success: true, products: currentProducts }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error al modificar stock atómico'
      console.error('[atomicModifyStock] Error:', msg)
      return { success: false, products: [], error: msg }
    }
  })
}

export async function getCantinaProducts(tenantId: string): Promise<CantinaProduct[]> {
  try {
    if (!tenantId || typeof tenantId !== 'string' || !tenantId.trim()) {
      return []
    }

    const cleanTenantId = tenantId.trim()
    const cached = cantinaProductsCache.get(cleanTenantId)
    if (cached && Date.now() - cached.timestamp < CANTINA_CACHE_TTL_MS) {
      return cached.data
    }

    const productsList = await fetchFreshCantinaProducts(cleanTenantId)
    cantinaProductsCache.set(cleanTenantId, { data: productsList, timestamp: Date.now() })
    return productsList
  } catch (err) {
    console.error('[getCantinaProducts] Error:', err)
    return []
  }
}

export async function saveCantinaProducts(
  tenantId: string,
  products: CantinaProduct[]
): Promise<{ success: boolean; products: CantinaProduct[]; error?: string }> {
  try {
    const cleanTenantId = tenantId.trim()
    cantinaProductsCache.delete(cleanTenantId)
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, products, error: auth.error || 'Sin permisos sobre este club' }
    }

    return await withTenantStockLock(cleanTenantId, async () => {
      await saveCantinaProductsDirect(cleanTenantId, products)
      return { success: true, products }
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error al guardar productos'
    console.error('[saveCantinaProducts] Error:', errorMsg)
    return { success: false, products, error: errorMsg }
  }
}

export async function updateProductStock(
  tenantId: string,
  productId: string,
  amount: number,
  isDelta = false
): Promise<{ success: boolean; products: CantinaProduct[]; error?: string }> {
  try {
    const cleanTenantId = tenantId.trim()
    if (!cleanTenantId) return { success: false, products: [], error: 'Tenant inválido' }

    if (isDelta) {
      return await atomicModifyStock(cleanTenantId, [{ productId, delta: amount }])
    }

    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, products: [], error: auth.error || 'Sin permisos sobre este club' }
    }

    return await withTenantStockLock(cleanTenantId, async () => {
      cantinaProductsCache.delete(cleanTenantId)
      const currentProducts = await fetchFreshCantinaProducts(cleanTenantId)
      let found = false
      const updated = currentProducts.map(p => {
        if (p.id === productId) {
          found = true
          return { ...p, stock: Math.max(0, amount) }
        }
        return p
      })

      if (found) {
        // Actualización a nivel fila SQL
        const supabase = await createServiceClient()
        try {
          await supabase
            .from('products')
            .update({ stock: Math.max(0, amount), updated_at: new Date().toISOString() })
            .eq('tenant_id', cleanTenantId)
            .eq('id', productId)
        } catch {
          // Fallback en saveCantinaProductsDirect
        }

        await saveCantinaProductsDirect(cleanTenantId, updated)
        return { success: true, products: updated }
      }
      return { success: true, products: currentProducts }
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error al actualizar stock'
    return { success: false, products: [], error: errorMsg }
  }
}

export async function saveSingleProduct(
  tenantId: string,
  product: CantinaProduct
): Promise<{ success: boolean; products: CantinaProduct[]; error?: string }> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, products: [], error: auth.error || 'Sin permisos sobre este club' }
    }

    const cleanTenantId = tenantId.trim()
    const { getCurrentUserProfile } = await import('@/lib/auth-security')
    const currentUser = await getCurrentUserProfile()
    const isOwner = currentUser?.role === 'TENANT_ADMIN' || currentUser?.role === 'SUPERADMIN'

    return await withTenantStockLock(cleanTenantId, async () => {
      cantinaProductsCache.delete(cleanTenantId)
      const currentProducts = await fetchFreshCantinaProducts(cleanTenantId)
      const existingIndex = currentProducts.findIndex(p => p.id === product.id)
      let updated: CantinaProduct[]
      let sanitizedProduct: CantinaProduct

      if (existingIndex >= 0) {
        const existingProduct = currentProducts[existingIndex]
        const protectedPrice = (!isOwner && currentUser) ? existingProduct.price : product.price
        sanitizedProduct = {
          ...product,
          price: protectedPrice,
        }
        updated = [...currentProducts]
        updated[existingIndex] = sanitizedProduct
      } else {
        sanitizedProduct = product
        updated = [product, ...currentProducts]
      }

      // Upsert directo en la tabla relacional
      const supabase = await createServiceClient()
      try {
        await supabase.from('products').upsert({
          id: sanitizedProduct.id,
          tenant_id: cleanTenantId,
          name: sanitizedProduct.name,
          category: sanitizedProduct.category || 'BEBIDAS',
          price_cents: Math.round(sanitizedProduct.price * 100),
          stock: Math.max(0, sanitizedProduct.stock || 0),
          is_active: sanitizedProduct.is_active ?? true,
          updated_at: new Date().toISOString()
        }, { onConflict: 'id' })
      } catch (upsertErr) {
        console.warn('[saveSingleProduct] Database products upsert warning:', upsertErr)
      }

      await saveCantinaProductsDirect(cleanTenantId, updated)
      return { success: true, products: updated }
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error al guardar producto'
    return { success: false, products: [], error: errorMsg }
  }
}

export async function deleteProduct(
  tenantId: string,
  productId: string
): Promise<{ success: boolean; products: CantinaProduct[]; error?: string }> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, products: [], error: auth.error || 'Sin permisos sobre este club' }
    }

    const cleanTenantId = tenantId.trim()
    return await withTenantStockLock(cleanTenantId, async () => {
      cantinaProductsCache.delete(cleanTenantId)
      const supabase = await createServiceClient()

      // Marcar producto como inactivo en PostgreSQL
      try {
        await supabase
          .from('products')
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq('tenant_id', cleanTenantId)
          .eq('id', productId)
      } catch (delErr) {
        console.warn('[deleteProduct] Inactive update warning:', delErr)
      }

      const currentProducts = await fetchFreshCantinaProducts(cleanTenantId)
      const updated = currentProducts.filter(p => p.id !== productId)
      await saveCantinaProductsDirect(cleanTenantId, updated)
      return { success: true, products: updated }
    })
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error al eliminar producto'
    return { success: false, products: [], error: errorMsg }
  }
}

// ─── GESTIÓN DE PROVEEDORES DE CANTINA ────────────────────────────────────────

export async function getCantinaSuppliers(tenantId: string): Promise<CantinaSupplier[]> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) return DEFAULT_CANTINA_SUPPLIERS

    const cleanTenantId = tenantId.trim()
    const cached = cantinaSuppliersCache.get(cleanTenantId)
    if (cached && Date.now() - cached.timestamp < CANTINA_CACHE_TTL_MS) {
      return cached.data
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', cleanTenantId)
      .eq('action', 'CANTINA_SUPPLIERS')
      .eq('table_name', 'cantina_suppliers')
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0 || !data[0].new_data) {
      return DEFAULT_CANTINA_SUPPLIERS
    }

    const payload = data[0].new_data as { suppliers: CantinaSupplier[] }
    let suppliersList = DEFAULT_CANTINA_SUPPLIERS
    if (Array.isArray(payload.suppliers) && payload.suppliers.length > 0) {
      suppliersList = payload.suppliers
    }

    cantinaSuppliersCache.set(cleanTenantId, { data: suppliersList, timestamp: Date.now() })
    return suppliersList
  } catch (err) {
    console.error('[getCantinaSuppliers] Error:', err)
    return DEFAULT_CANTINA_SUPPLIERS
  }
}

export async function saveCantinaSuppliers(
  tenantId: string,
  suppliers: CantinaSupplier[]
): Promise<{ success: boolean; suppliers: CantinaSupplier[]; error?: string }> {
  try {
    cantinaSuppliersCache.delete(tenantId.trim())
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, suppliers: [], error: auth.error || 'Sin permisos sobre este club' }
    }

    const supabase = await createServiceClient()
    const { data: existing } = await supabase
      .from('audit_log')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('action', 'CANTINA_SUPPLIERS')
      .eq('table_name', 'cantina_suppliers')
      .order('created_at', { ascending: false })
      .limit(1)

    if (existing && existing.length > 0) {
      const updateRes = await supabase
        .from('audit_log')
        .update({
          new_data: { suppliers, updated_at: new Date().toISOString() }
        })
        .eq('id', existing[0].id)

      if (updateRes.error) throw updateRes.error
    } else {
      const insertRes = await supabase.from('audit_log').insert({
        tenant_id: tenantId,
        action: 'CANTINA_SUPPLIERS',
        table_name: 'cantina_suppliers',
        record_id: tenantId,
        new_data: { suppliers, updated_at: new Date().toISOString() }
      })

      if (insertRes.error) throw insertRes.error
    }

    cantinaSuppliersCache.set(tenantId.trim(), { data: suppliers, timestamp: Date.now() })
    revalidatePath('/dashboard/cantina')
    return { success: true, suppliers }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error al guardar proveedores'
    console.error('[saveCantinaSuppliers] Error:', errorMsg)
    return { success: false, suppliers, error: errorMsg }
  }
}

// ─── GESTIÓN DE CATEGORÍAS DE CANTINA ────────────────────────────────────────

export async function getCantinaCategories(tenantId: string): Promise<CantinaCategory[]> {
  try {
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) return DEFAULT_CANTINA_CATEGORIES

    const cleanTenantId = tenantId.trim()
    const cached = cantinaCategoriesCache.get(cleanTenantId)
    if (cached && Date.now() - cached.timestamp < CANTINA_CACHE_TTL_MS) {
      return cached.data
    }

    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', cleanTenantId)
      .eq('action', 'CANTINA_CATEGORIES')
      .eq('table_name', 'cantina_categories')
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0 || !data[0].new_data) {
      return DEFAULT_CANTINA_CATEGORIES
    }

    const payload = data[0].new_data as { categories: CantinaCategory[] }
    let categoriesList = DEFAULT_CANTINA_CATEGORIES
    if (Array.isArray(payload.categories) && payload.categories.length > 0) {
      categoriesList = payload.categories
    }

    cantinaCategoriesCache.set(cleanTenantId, { data: categoriesList, timestamp: Date.now() })
    return categoriesList
  } catch (err) {
    console.error('[getCantinaCategories] Error:', err)
    return DEFAULT_CANTINA_CATEGORIES
  }
}

export async function saveCantinaCategories(
  tenantId: string,
  categories: CantinaCategory[]
): Promise<{ success: boolean; categories: CantinaCategory[]; error?: string }> {
  try {
    const cleanId = tenantId.trim()
    cantinaCategoriesCache.delete(cleanId)
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, categories: [], error: auth.error || 'Sin permisos sobre este club' }
    }

    const supabase = await createServiceClient()
    const { data: existing } = await supabase
      .from('audit_log')
      .select('id')
      .eq('tenant_id', cleanId)
      .eq('action', 'CANTINA_CATEGORIES')
      .eq('table_name', 'cantina_categories')
      .order('created_at', { ascending: false })
      .limit(1)

    if (existing && existing.length > 0) {
      const updateRes = await supabase
        .from('audit_log')
        .update({
          new_data: { categories, updated_at: new Date().toISOString() }
        })
        .eq('id', existing[0].id)

      if (updateRes.error) throw updateRes.error
    } else {
      const insertRes = await supabase.from('audit_log').insert({
        tenant_id: cleanId,
        action: 'CANTINA_CATEGORIES',
        table_name: 'cantina_categories',
        record_id: cleanId,
        new_data: { categories, updated_at: new Date().toISOString() }
      })

      if (insertRes.error) throw insertRes.error
    }

    cantinaCategoriesCache.set(cleanId, { data: categories, timestamp: Date.now() })
    revalidatePath('/dashboard/cantina')
    return { success: true, categories }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error al guardar categorías'
    console.error('[saveCantinaCategories] Error:', errorMsg)
    return { success: false, categories, error: errorMsg }
  }
}

export type { CantinaCategory }


