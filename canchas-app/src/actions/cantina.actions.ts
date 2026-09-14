'use server'
// src/actions/cantina.actions.ts
// ==============================================================================
// SERVER ACTIONS — Cantina & Kiosco con persistencia en Supabase
// ==============================================================================

import { createServiceClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type OrderStatus = 'PENDING' | 'PREPARING' | 'DELIVERED' | 'CANCELLED'

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
  notes?: string | null
}

// ─── Crear nuevo pedido ───────────────────────────────────────────────────────

export async function createCourtOrder(
  payload: CreateOrderPayload
): Promise<{ success: boolean; order?: CourtOrder; error?: string }> {
  try {
    const supabase = await createServiceClient()

    const { data, error } = await supabase
      .from('court_orders')
      .insert({
        tenant_id:     payload.tenant_id,
        court_id:      payload.court_id ?? null,
        court_name:    payload.court_name,
        customer_name: payload.customer_name,
        items:         payload.items,
        total_ars:     payload.total_ars,
        status:        'PENDING',
        notes:         payload.notes ?? null,
      })
      .select()
      .single()

    if (error) {
      console.error('[createCourtOrder] Error:', error.message)
      return { success: false, error: error.message }
    }

    revalidatePath('/dashboard/cantina')
    return { success: true, order: data as unknown as CourtOrder }
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

    const { error } = await supabase
      .from('court_orders')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', orderId)

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
    const targetDate = date ?? new Date().toISOString().split('T')[0]
    const dayStart = `${targetDate}T00:00:00`
    const dayEnd   = `${targetDate}T23:59:59`

    const { data, error } = await supabase
      .from('court_orders')
      .select('*')
      .eq('tenant_id', tenantId)
      .gte('created_at', dayStart)
      .lte('created_at', dayEnd)
      .neq('status', 'CANCELLED')
      .order('created_at', { ascending: false })

    if (error) {
      console.warn('[getDailyOrders] Warning:', error.message)
      return []
    }

    return (data as unknown as CourtOrder[]) ?? []
  } catch {
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
