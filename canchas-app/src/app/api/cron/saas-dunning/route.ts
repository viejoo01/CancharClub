// src/app/api/cron/saas-dunning/route.ts
// ==============================================================================
// CRON ROUTE — Motor Escalonado de Cobranzas SaaS (Dunning Engine)
// Evalúa facturas impagas y actualiza el estado de los clubes progresivamente:
// Días 1-7:   PAYMENT_PENDING (Aviso ordinario)
// Días 8-12:  GRACE_PERIOD (Banner informativo en dashboard)
// Días 13-14: PARTIALLY_SUSPENDED (Advertencia de suspensión)
// Días 15+:   LOCKED (Bloqueo de panel y reservas públicas)
// ==============================================================================

import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { verifyCronRequest } from '@/lib/cron-auth'
import type { TenantSubscriptionStatus } from '@/types/database'
import { calculateClubSaaSFee } from '@/lib/saas-pricing'
import { checkAndReleaseOverdueRecurringSlots } from '@/actions/recurring-slots.actions'
import { syncPreapprovalAmountIfNeeded } from '@/actions/saas-billing.actions'
import { getArgentinaTodayIso, parseArgentinaDate } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  return handleDunning(request)
}

export async function POST(request: NextRequest) {
  return handleDunning(request)
}

async function handleDunning(request: NextRequest) {
  const startTime = Date.now()

  // 1. Verificación segura del cron (Bearer token o ?secret=)
  const cronAuth = verifyCronRequest(request)
  if (!cronAuth.authorized) {
    return NextResponse.json({ error: cronAuth.error || 'Unauthorized cron invocation' }, { status: 401 })
  }

  try {
    const supabase = await createServiceClient()
    const now = new Date()
    const todayIso = getArgentinaTodayIso(now)
    const [currentYearStr, currentMonthStr, currentDayStr] = todayIso.split('-')
    const currentYear = Number(currentYearStr)
    const currentMonth = Number(currentMonthStr)
    const currentDay = Number(currentDayStr)

    // 2. Obtener todos los tenants registrados
    const { data: tenants, error: tenantsErr } = await supabase
      .from('tenants')
      .select('id, name, slug, subscription_status, is_active, created_at, description')

    if (tenantsErr || !tenants) {
      console.error('[SaaS Dunning] Error al listar tenants:', tenantsErr)
      return NextResponse.json({ error: 'Error al consultar tenants', detail: tenantsErr?.message }, { status: 500 })
    }

    // 3. Obtener todas las facturas impagas activas
    const { data: unpaidInvoices, error: invErr } = await supabase
      .from('tenant_invoices')
      .select('id, tenant_id, due_date, amount, status')
      .in('status', ['UNPAID', 'DRAFT'])
      .order('due_date', { ascending: true })

    if (invErr) {
      console.error('[SaaS Dunning] Error al listar facturas impagas:', invErr)
      return NextResponse.json({ error: 'Error al consultar facturas', detail: invErr?.message }, { status: 500 })
    }

    // Mapear la factura más vencida de cada tenant
    const oldestInvoiceByTenant = new Map<string, { id: string; due_date: string; amount: number }>()
    for (const inv of unpaidInvoices || []) {
      if (!oldestInvoiceByTenant.has(inv.tenant_id) && inv.due_date) {
        oldestInvoiceByTenant.set(inv.tenant_id, {
          id: inv.id,
          due_date: inv.due_date,
          amount: Number(inv.amount) || 0,
        })
      }
    }

    const updates: Array<{
      tenantId: string
      clubName: string
      oldStatus: string
      newStatus: TenantSubscriptionStatus
      daysOverdue: number
    }> = []

    for (const tenant of tenants) {
      // 1. Resolver período de prueba oficial (15 días corridos desde creación o trial_ends_at)
      let trialEnd: Date
      let meta: Record<string, unknown> = {}
      if (tenant.description) {
        try {
          meta = JSON.parse(tenant.description)
        } catch {}
      }

      const createdAt = tenant.created_at ? new Date(tenant.created_at) : now
      if (meta.trial_ends_at && typeof meta.trial_ends_at === 'string') {
        trialEnd = new Date(meta.trial_ends_at)
      } else {
        trialEnd = new Date(createdAt.getTime() + 15 * 24 * 60 * 60 * 1000)
      }

      // A. Auditoría automática diaria de turnos fijos: liberar turnos de abonados impagos tras período de tolerancia
      try {
        await checkAndReleaseOverdueRecurringSlots(tenant.id, { skipAuth: true })
      } catch (fixedErr) {
        console.warn(`[SaaS Dunning] Aviso auditoría turnos fijos para ${tenant.id}:`, fixedErr)
      }

      // B. Roll-forward automático diario de turnos fijos: pre-generar turnos para asegurar la grilla
      try {
        const { rollForwardActiveRecurringSlots } = await import('@/actions/recurring-slots.actions')
        await rollForwardActiveRecurringSlots(tenant.id, { skipAuth: true })
      } catch (rollErr) {
        console.warn(`[SaaS Dunning] Aviso roll-forward turnos fijos para ${tenant.id}:`, rollErr)
      }

      // Si aún está dentro del período de prueba gratis de 15 días:
      if (now < trialEnd) {
        if (!tenant.subscription_status || tenant.subscription_status === 'TRIAL') {
          continue
        }
      }

      let oldestInv = oldestInvoiceByTenant.get(tenant.id)

      // Ciclo mensual de cobro a los clubes: 15 días gratis de trial, y desde el día 16 se factura cada 30 días
      // en la misma fecha ancla de cada mes (ej. si el trial termina el 24 de octubre, se factura los 24 de cada mes)
      if (now >= trialEnd) {
        const anchorDay = trialEnd.getDate()
        const lastDayOfCurrentMonth = new Date(currentYear, currentMonth, 0).getDate()
        const effectiveAnchorDay = Math.min(anchorDay, lastDayOfCurrentMonth)
        const isAnchorDateReached = currentDay >= effectiveAnchorDay

        // Verificar si ya existe factura emitida para el período mensual actual
        const { data: currentPeriodInvoices } = await supabase
          .from('tenant_invoices')
          .select('id, due_date, amount, status')
          .eq('tenant_id', tenant.id)
          .eq('month', currentMonth)
          .eq('year', currentYear)
          .limit(1)

        const hasInvoiceForCurrentMonth = currentPeriodInvoices && currentPeriodInvoices.length > 0

        // Si ya llegamos a la fecha ancla del mes y aún no se emitió la factura del período:
        if (!hasInvoiceForCurrentMonth && isAnchorDateReached) {
          // Generar factura del período mensual actual con vencimiento en la fecha ancla
          const mm = String(currentMonth).padStart(2, '0')
          const dd = String(effectiveAnchorDay).padStart(2, '0')
          const dueDateIso = `${currentYear}-${mm}-${dd}`

          // Consultar cantidad de canchas y precio más alto del club para facturar el importe real (sin pisos fijos)
          const { data: tenantCourts } = await supabase
            .from('courts')
            .select('price_per_turn_cents, is_active')
            .eq('tenant_id', tenant.id)
            .eq('is_active', true)

          const { data: priceRules } = await supabase
            .from('price_rules')
            .select('price_cents, is_active')
            .eq('tenant_id', tenant.id)
            .eq('is_active', true)

          let highestSlotArs = 0
          const courtsCount = Math.max(1, tenantCourts?.length || 1)
          for (const c of tenantCourts || []) {
            const priceArs = Math.round(Number(c.price_per_turn_cents || 0) / 100)
            if (priceArs > highestSlotArs) highestSlotArs = priceArs
          }
          for (const r of priceRules || []) {
            const priceArs = Math.round(Number(r.price_cents || 0) / 100)
            if (priceArs > highestSlotArs) highestSlotArs = priceArs
          }

          const pricing = calculateClubSaaSFee(courtsCount, highestSlotArs, tenant.created_at, trialEnd)
          const dueAmount = pricing.monthlyFeeArs

          // Si el club aún no cargó el precio de sus canchas, la cuota proporcional no puede determinarse.
          // Se pospone la emisión de la factura mensual para no generar cobros de $0 ni mora injustificada.
          if (dueAmount <= 0 || !pricing.hasPriceConfigured) {
            console.log(`[SaaS Dunning] Club ${tenant.name || tenant.id}: tarifas de canchas no configuradas. Facturación mensual pospuesta.`)
            continue
          }

          const isFirstInvoice = tenant.subscription_status === 'TRIAL'
          const noteText = isFirstInvoice
            ? `Primer abono mensual SaaS tras 15 días gratis (${pricing.formulaDescription})`
            : `Abono mensual SaaS - Período ${currentMonth}/${currentYear} (Vence día ${effectiveAnchorDay}) - ${pricing.formulaDescription}`

          const { data: newInv } = await supabase
            .from('tenant_invoices')
            .insert({
              tenant_id: tenant.id,
              month: currentMonth,
              year: currentYear,
              amount: dueAmount,
              status: 'UNPAID',
              reference_slot_price: pricing.highestSlotPriceArs,
              slots_multiplier: pricing.multiplier,
              due_date: dueDateIso,
              notes: noteText,
            })
            .select('id, due_date, amount')
            .maybeSingle()

          if (newInv && !oldestInv) {
            oldestInv = {
              id: newInv.id,
              due_date: newInv.due_date,
              amount: Number(newInv.amount) || 0,
            }
          }

          // Sincronizar dinámicamente el monto del débito recurrente en Mercado Pago
          // si las tarifas del club o cantidad de canchas activas cambiaron
          syncPreapprovalAmountIfNeeded(tenant.id, dueAmount).catch(syncErr => {
            console.warn(`[SaaS Dunning] Aviso al sincronizar cuota en Mercado Pago para ${tenant.id}:`, syncErr)
          })
        }
      }

      if (!oldestInv || oldestInv.amount <= 0) {
        // El tenant no tiene facturas impagas válidas (> 0): si estaba en dunning, regularizar
        const dunningStatuses: TenantSubscriptionStatus[] = ['PAYMENT_PENDING', 'GRACE_PERIOD', 'PARTIALLY_SUSPENDED', 'PAUSED', 'LOCKED']
        if (dunningStatuses.includes(tenant.subscription_status as TenantSubscriptionStatus)) {
          const targetCleanStatus = now < trialEnd ? 'TRIAL' : 'ACTIVE'
          await supabase
            .from('tenants')
            .update({
              subscription_status: targetCleanStatus,
              is_active: true,
              updated_at: now.toISOString(),
            })
            .eq('id', tenant.id)

          updates.push({
            tenantId: tenant.id,
            clubName: tenant.name || tenant.id,
            oldStatus: tenant.subscription_status || 'UNKNOWN',
            newStatus: targetCleanStatus,
            daysOverdue: 0,
          })
        }
        continue
      }

      // Calcular días de mora respecto a due_date usando la fecha civil oficial de Argentina
      const cleanDueDate = oldestInv.due_date.split('T')[0]
      let targetStatus: TenantSubscriptionStatus = 'ACTIVE'
      let isActive = true
      let daysOverdue = 0

      if (todayIso <= cleanDueDate) {
        // La factura aún no venció: el club permanece activo y sin penalizaciones
        targetStatus = tenant.subscription_status === 'TRIAL' ? 'TRIAL' : 'ACTIVE'
        isActive = true
        daysOverdue = 0
      } else {
        const dueMs = parseArgentinaDate(cleanDueDate).getTime()
        const todayMs = parseArgentinaDate(todayIso).getTime()
        daysOverdue = Math.max(1, Math.round((todayMs - dueMs) / (1000 * 60 * 60 * 24)))

        if (daysOverdue >= 15) {
          targetStatus = 'LOCKED'
          isActive = false
        } else if (daysOverdue >= 13) {
          targetStatus = 'PARTIALLY_SUSPENDED'
          isActive = true
        } else if (daysOverdue >= 8) {
          targetStatus = 'GRACE_PERIOD'
          isActive = true
        } else {
          // Días 1 a 7 desde la fecha de vencimiento mensual
          targetStatus = 'PAYMENT_PENDING'
          isActive = true
        }
      }

      // Actualizar si el estado cambió
      if (tenant.subscription_status !== targetStatus || tenant.is_active !== isActive) {
        const { error: updateErr } = await supabase
          .from('tenants')
          .update({
            subscription_status: targetStatus,
            is_active: isActive,
            updated_at: now.toISOString(),
          })
          .eq('id', tenant.id)

        if (!updateErr) {
          updates.push({
            tenantId: tenant.id,
            clubName: tenant.name || tenant.id,
            oldStatus: tenant.subscription_status || 'UNKNOWN',
            newStatus: targetStatus,
            daysOverdue,
          })

          // Registrar en auditoría
          try {
            await supabase.from('audit_log').insert({
              tenant_id: tenant.id,
              action: 'SAAS_DUNNING_STATUS_UPDATE',
              entity_type: 'tenants',
              entity_id: tenant.id,
              changes: {
                old_status: tenant.subscription_status,
                new_status: targetStatus,
                days_overdue: daysOverdue,
                invoice_id: oldestInv.id,
              },
            })
          } catch {
            // Ignorar error de audit_log opcional
          }
        }
      }
    }

    const durationMs = Date.now() - startTime
    console.log(`[SaaS Dunning] Cron completado en ${durationMs}ms. ${updates.length} clubes actualizados.`)

    return NextResponse.json({
      success: true,
      action: 'saas-dunning',
      totalTenantsScanned: tenants.length,
      updatesApplied: updates.length,
      updates,
      durationMs,
      timestamp: now.toISOString(),
    })
  } catch (err: unknown) {
    console.error('[SaaS Dunning] Excepción no controlada en cron:', err)
    return NextResponse.json(
      { error: 'Error interno en cron dunning', detail: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  }
}
