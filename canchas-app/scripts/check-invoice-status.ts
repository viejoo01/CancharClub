// scripts/check-invoice-status.ts
// ==============================================================================
// VERIFICACIÓN DE ESTADO Y LIQUIDACIÓN DE FACTURA (MERCADO PAGO WEBHOOK)
// ==============================================================================
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.join(__dirname, '..', '.env.local')

function loadEnv(): Record<string, string> {
  const env: Record<string, string> = {}
  if (fs.existsSync(ENV_FILE)) {
    const lines = fs.readFileSync(ENV_FILE, 'utf8').split('\n')
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const eqIdx = line.indexOf('=')
      if (eqIdx !== -1) {
        const key = line.slice(0, eqIdx).trim()
        let val = line.slice(eqIdx + 1).trim()
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        env[key] = val
      }
    }
  }
  return { ...env, ...(process.env as Record<string, string>) }
}

const env = loadEnv()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || ''
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || ''

async function checkInvoiceStatus() {
  console.log('\n==============================================================================')
  console.log('🔍 VERIFICACIÓN DE ESTADO DE FACTURA Y LIQUIDACIÓN EN SUPABASE')
  console.log('==============================================================================\n')

  if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY.includes('placeholder')) {
    console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están configurados en .env.local.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const argInvoiceId = process.argv[2]?.trim()

  let invoice: {
    id: string
    tenant_id: string
    amount: number
    status: string
    paid_at?: string | null
    mp_payment_id?: string | null
    billing_period?: string | null
    due_date?: string | null
    created_at?: string | null
    notes?: string | null
  } | null = null

  if (argInvoiceId) {
    const { data, error } = await supabase
      .from('tenant_invoices')
      .select('*')
      .eq('id', argInvoiceId)
      .maybeSingle()

    if (error || !data) {
      console.error(`❌ Error: No se encontró la factura con ID "${argInvoiceId}":`, error?.message)
      process.exit(1)
    }
    invoice = data
  } else {
    // Si no se pasó argumento, buscar la factura de prueba más reciente
    const { data: latestInvoices, error: listErr } = await supabase
      .from('tenant_invoices')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

    if (listErr || !latestInvoices || latestInvoices.length === 0) {
      console.error('❌ Error: No se encontraron facturas registradas en la base de datos.')
      process.exit(1)
    }

    // Priorizar la factura con 'Prueba' en billing_period o notes, o la primera
    invoice = latestInvoices.find(inv => inv.notes?.includes('Prueba') || inv.billing_period?.includes('Prueba')) || latestInvoices[0] || null
    if (!invoice) {
      console.error('❌ Error: No se encontraron facturas.')
      process.exit(1)
    }
    console.log(`ℹ️ No se especificó ID; consultando la factura más reciente (${invoice.id})...\n`)
  }

  if (!invoice) {
    console.error('❌ Error: Factura no disponible.')
    process.exit(1)
  }

  // Consultar estado del Club (Tenant)
  const { data: tenant, error: tenantErr } = await supabase
    .from('tenants')
    .select('id, name, email, slug, subscription_status, is_active, current_balance')
    .eq('id', invoice.tenant_id)
    .single()

  if (tenantErr || !tenant) {
    console.error(`❌ Error al consultar club asociado (${invoice.tenant_id}):`, tenantErr?.message)
    process.exit(1)
  }

  const isPaid = invoice.status === 'PAID'
  const isClubActive = tenant.is_active === true && tenant.subscription_status === 'ACTIVE'
  const periodLabel = invoice.notes || invoice.billing_period || 'Prueba Checkout Pro ($100)'

  console.log('------------------------------------------------------------------------------')
  console.log('DATOS DE LA FACTURA:')
  console.log(`  • ID Factura:         ${invoice.id}`)
  console.log(`  • Período / Concepto: ${periodLabel}`)
  console.log(`  • Monto:              $${Number(invoice.amount).toFixed(2)} ARS`)
  console.log(`  • Estado Actual:      ${isPaid ? '🟢 PAID (PAGADA)' : `🟡 ${invoice.status}`}`)
  console.log(`  • Fecha de Pago:      ${invoice.paid_at ? new Date(invoice.paid_at).toLocaleString('es-AR') : 'Pendiente'}`)
  console.log(`  • ID Pago MP:         ${invoice.mp_payment_id ? `💳 ${invoice.mp_payment_id}` : 'No registrado aún'}`)
  console.log(`  • Vencimiento:        ${invoice.due_date ? new Date(invoice.due_date).toLocaleDateString('es-AR') : 'N/A'}`)
  console.log('------------------------------------------------------------------------------')
  console.log('ESTADO DEL CLUB (TENANT):')
  console.log(`  • Club:               ${tenant.name} (${tenant.email || tenant.slug})`)
  console.log(`  • Tenant ID:          ${tenant.id}`)
  console.log(`  • Estado SaaS:        ${isClubActive ? '🟢 ACTIVE' : `🟡 ${tenant.subscription_status}`}`)
  console.log(`  • Acceso Habilitado:  ${tenant.is_active ? '✅ SÍ (is_active: true)' : '❌ NO (is_active: false)'}`)
  console.log(`  • Saldo Deudor:       $${Number(tenant.current_balance || 0).toFixed(2)} ARS`)
  console.log('------------------------------------------------------------------------------\n')

  if (isPaid) {
    console.log('==============================================================================')
    console.log('🎉 VALIDACIÓN EXITOSA: La factura está 100% LIQUIDADA')
    console.log('==============================================================================')
    console.log('El Webhook de Mercado Pago acreditó el pago en producción:')
    console.log(`  1. Factura marcada como PAID con ID de pasarela: ${invoice.mp_payment_id}`)
    console.log(`  2. Club regularizado a estado: ${tenant.subscription_status} (is_active: ${tenant.is_active})`)
    console.log(`  3. Saldo deudor actualizado: $${Number(tenant.current_balance || 0).toFixed(2)} ARS`)
    console.log('==============================================================================\n')
  } else {
    console.log('⏳ FACTURA PENDIENTE DE PAGO:')
    console.log('  La factura aún figura con estado UNPAID.')
    console.log('  Ingresá a https://www.cancharclub.com.ar/dashboard/billing para abonar los $100 ARS')
    console.log('  y volvé a ejecutar este script tras completar la operación.')
  }
}

checkInvoiceStatus().catch((err) => {
  console.error('Error fatal en check-invoice-status:', err)
  process.exit(1)
})
