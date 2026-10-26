// scripts/seed-test-invoice.ts
// ==============================================================================
// SEED: FACTURA DE PRUEBA REAL DE BAJO MONTO ($100 ARS) PARA CHECKOUT PRO
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

async function seedTestInvoice() {
  console.log('\n==============================================================================')
  console.log('🧾 CREACIÓN DE FACTURA DE PRUEBA ($100 ARS) PARA MERCADO PAGO CHECKOUT PRO')
  console.log('==============================================================================\n')

  if (!SUPABASE_URL || !SERVICE_KEY || SERVICE_KEY.includes('placeholder')) {
    console.error('❌ Error: NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no están configurados en .env.local.')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY)
  const argTarget = process.argv[2]?.trim()

  // 1. Obtener club de destino
  let tenant: {
    id: string
    name: string
    email?: string | null
    slug?: string | null
    subscription_status?: string | null
    is_active?: boolean | null
  } | null = null

  if (argTarget) {
    console.log(`🔍 Buscando club por argumento: "${argTarget}"...`)
    // Buscar por ID si es UUID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(argTarget)) {
      const { data } = await supabase
        .from('tenants')
        .select('id, name, email, slug, subscription_status, is_active')
        .eq('id', argTarget)
        .maybeSingle()
      tenant = data
    } else {
      // Buscar por email o slug
      const { data } = await supabase
        .from('tenants')
        .select('id, name, email, slug, subscription_status, is_active')
        .or(`email.eq.${argTarget},slug.eq.${argTarget}`)
        .maybeSingle()
      tenant = data
    }
  }

  // Si no se pasó argumento o no se encontró, seleccionar el club principal / más reciente
  if (!tenant) {
    console.log('🔍 Buscando clubs activos en Supabase...')
    const { data: tenants, error: tErr } = await supabase
      .from('tenants')
      .select('id, name, email, slug, subscription_status, is_active')
      .order('created_at', { ascending: false })
      .limit(10)

    if (tErr || !tenants || tenants.length === 0) {
      console.error('❌ Error: No se encontraron clubes registrados en la base de datos.', tErr?.message)
      process.exit(1)
    }

    // Priorizar club activo o el primero
    tenant = tenants.find(t => t.is_active === true) || tenants[0]
  }

  console.log(`✅ Club seleccionado: "${tenant.name}" (${tenant.email || tenant.slug || tenant.id})`)
  console.log(`   - Tenant ID:            ${tenant.id}`)
  console.log(`   - Estado Suscripción:   ${tenant.subscription_status || 'N/A'}`)
  console.log(`   - Club Activo:          ${tenant.is_active ? 'SÍ' : 'NO'}\n`)

  const now = new Date()
  const currentMonth = now.getMonth() + 1
  const currentYear = now.getFullYear()

  // Inspeccionar columnas existentes de tenant_invoices
  const { data: sampleRow } = await supabase.from('tenant_invoices').select('*').limit(1)
  const existingCols = sampleRow && sampleRow.length > 0 ? Object.keys(sampleRow[0]) : []
  console.log('📋 Columnas detectadas en tenant_invoices:', existingCols.length > 0 ? existingCols.join(', ') : '(tabla vacía)')

  const insertPayload: Record<string, unknown> = {
    tenant_id: tenant.id,
    amount: 100.00,
    status: 'UNPAID',
    month: currentMonth,
    year: currentYear,
    due_date: now.toISOString(),
    notes: 'Prueba Checkout Pro ($100)',
  }

  if (existingCols.includes('billing_period') || existingCols.length === 0) {
    insertPayload.billing_period = 'Prueba Checkout Pro ($100)'
  }

  interface InvoiceRecord {
    id: string
    tenant_id: string
    amount: number
    status: string
    billing_period?: string | null
    due_date?: string | null
    created_at?: string | null
    notes?: string | null
  }

  let invoice: InvoiceRecord | null = null
  let invErr: { message: string } | null = null

  const res1 = await supabase
    .from('tenant_invoices')
    .insert(insertPayload)
    .select('*')
    .single()

  if (res1.error && res1.error.message.includes('billing_period')) {
    delete insertPayload.billing_period
    const res2 = await supabase
      .from('tenant_invoices')
      .insert(insertPayload)
      .select('*')
      .single()
    invoice = res2.data as InvoiceRecord | null
    invErr = res2.error
  } else {
    invoice = res1.data as InvoiceRecord | null
    invErr = res1.error
  }

  if (invErr || !invoice) {
    console.error('❌ Error creando la factura en tenant_invoices:', invErr?.message)
    process.exit(1)
  }

  console.log('==============================================================================')
  console.log('🎉 FACTURA DE PRUEBA CREADA EXITOSAMENTE')
  console.log('==============================================================================')
  console.log(`   • ID Factura:        ${invoice.id}`)
  console.log(`   • Club:              ${tenant.name}`)
  console.log(`   • Tenant ID:         ${invoice.tenant_id}`)
  console.log(`   • Monto:             $${Number(invoice.amount).toFixed(2)} ARS`)
  console.log(`   • Estado:            ${invoice.status}`)
  console.log(`   • Período:           ${invoice.billing_period}`)
  console.log(`   • Fecha Vencimiento: ${invoice.due_date}`)
  console.log('==============================================================================\n')

  console.log('👉 Pasos siguientes para realizar la prueba real:')
  console.log('1. Ingresá al panel de facturación con la cuenta del club:')
  console.log('   🔗 https://www.cancharclub.com.ar/dashboard/billing')
  console.log('   (Verás la factura "Prueba Checkout Pro ($100)" con el botón "Pagar con Mercado Pago")')
  console.log('\n2. Hacé clic en "Pagar con Mercado Pago" y completá el pago de $100 ARS en Checkout Pro.')
  console.log('\n3. Una vez completado el pago, ejecutá el script de verificación:')
  console.log(`   💻 npx tsx scripts/check-invoice-status.ts ${invoice.id}\n`)
}

seedTestInvoice().catch((err) => {
  console.error('Error fatal en seed-test-invoice:', err)
  process.exit(1)
})
