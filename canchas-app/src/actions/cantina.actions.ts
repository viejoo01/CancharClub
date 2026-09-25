'use server'
// src/actions/cantina.actions.ts
// ==============================================================================
// SERVER ACTIONS — Cantina & Kiosco con persistencia en Supabase
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { assertTenantMember } from '@/lib/auth-security'
import type { CantinaProduct } from '@/config/cantina-data'

export type { CantinaProduct }
export type OrderStatus = 'PENDING' | 'PREPARING' | 'DELIVERED' | 'CANCELLED'
export type CantinaPaymentMethod = 'TRANSFER' | 'CASH' | 'QR_MP'
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
  if (order.payment_method === 'TRANSFER' || order.payment_method === 'CASH' || order.payment_method === 'QR_MP') {
    return order.payment_method
  }
  const notes = order.notes || ''
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
    
    // Incluir tag en notas para compatibilidad retroactiva garantizada
    const paymentTag = `[PAGO: ${method}]`
    const combinedNotes = payload.notes 
      ? (payload.notes.includes('[PAGO:') ? payload.notes : `${paymentTag} ${payload.notes}`)
      : paymentTag

    // Intentar insertar con columnas payment_method y payment_status
    const insertData: Record<string, unknown> = {
      tenant_id:     payload.tenant_id,
      court_id:      payload.court_id ?? null,
      court_name:    payload.court_name,
      customer_name: payload.customer_name,
      items:         payload.items,
      total_ars:     payload.total_ars,
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

      revalidatePath('/dashboard/cantina')
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

    revalidatePath('/dashboard/cantina')
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
    const auth = await assertTenantMember()
    if (!auth.authorized) {
      return { success: false, error: auth.error || 'Sin permisos para actualizar pedidos' }
    }

    const supabase = await createServiceClient()

    const { error } = await supabase
      .from('court_orders')
      .update({ status, updated_at: new Date().toISOString() })
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
        const updatedData = { ...currentData, status, updated_at: new Date().toISOString() }
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

    revalidatePath('/dashboard/cantina')
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

export async function getCantinaProducts(tenantId: string): Promise<CantinaProduct[]> {
  try {
    const supabase = await createServiceClient()
    const { data, error } = await supabase
      .from('audit_log')
      .select('new_data')
      .eq('tenant_id', tenantId)
      .eq('action', 'CANTINA_PRODUCT_CATALOG')
      .eq('table_name', 'cantina_products')
      .order('created_at', { ascending: false })
      .limit(1)

    if (error || !data || data.length === 0 || !data[0].new_data) {
      return []
    }

    const catalog = data[0].new_data as { products: CantinaProduct[] }
    if (Array.isArray(catalog.products)) {
      return catalog.products
    }

    return []
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
    const auth = await assertTenantMember(tenantId)
    if (!auth.authorized) {
      return { success: false, products, error: auth.error || 'Sin permisos sobre este club' }
    }

    const supabase = await createServiceClient()
    
    // Verificar si ya existe el registro del catálogo
    const { data: existing } = await supabase
      .from('audit_log')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('action', 'CANTINA_PRODUCT_CATALOG')
      .eq('table_name', 'cantina_products')
      .order('created_at', { ascending: false })
      .limit(1)

    if (existing && existing.length > 0) {
      const updateRes = await supabase
        .from('audit_log')
        .update({
          new_data: { products, updated_at: new Date().toISOString() }
        })
        .eq('id', existing[0].id)

      if (updateRes.error) throw updateRes.error
    } else {
      const insertRes = await supabase.from('audit_log').insert({
        tenant_id: tenantId,
        action: 'CANTINA_PRODUCT_CATALOG',
        table_name: 'cantina_products',
        new_data: { products, updated_at: new Date().toISOString() }
      })

      if (insertRes.error) throw insertRes.error
    }

    revalidatePath('/dashboard/cantina')
    return { success: true, products }
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
    const currentProducts = await getCantinaProducts(tenantId)
    const updated = currentProducts.map(p => {
      if (p.id === productId) {
        const newStock = isDelta ? Math.max(0, p.stock + amount) : Math.max(0, amount)
        return { ...p, stock: newStock }
      }
      return p
    })

    return await saveCantinaProducts(tenantId, updated)
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

    const { getCurrentUserProfile } = await import('@/lib/auth-security')
    const currentUser = await getCurrentUserProfile()
    const isOwner = currentUser?.role === 'TENANT_ADMIN' || currentUser?.role === 'SUPERADMIN'

    const currentProducts = await getCantinaProducts(tenantId)
    const existingIndex = currentProducts.findIndex(p => p.id === product.id)
    let updated: CantinaProduct[]
    if (existingIndex >= 0) {
      const existingProduct = currentProducts[existingIndex]
      // Protección contra fraude: Si el usuario no es Dueño del Club (ej. administrador de turno / canchero), se mantiene estrictamente el precio oficial fijado
      const protectedPrice = (!isOwner && currentUser) ? existingProduct.price : product.price
      const sanitizedProduct: CantinaProduct = {
        ...product,
        price: protectedPrice,
      }
      updated = [...currentProducts]
      updated[existingIndex] = sanitizedProduct
    } else {
      updated = [product, ...currentProducts]
    }
    return await saveCantinaProducts(tenantId, updated)
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

    const currentProducts = await getCantinaProducts(tenantId)
    const updated = currentProducts.filter(p => p.id !== productId)
    return await saveCantinaProducts(tenantId, updated)
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error al eliminar producto'
    return { success: false, products: [], error: errorMsg }
  }
}
