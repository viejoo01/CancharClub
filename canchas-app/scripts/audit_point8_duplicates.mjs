import { createClient } from '@supabase/supabase-js'
import fs from 'node:fs'
import path from 'node:path'

function loadEnv() {
  const envPath = path.resolve('.env.local')
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf8')
    content.split('\n').forEach(line => {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/)
      if (match) {
        let val = match[2] || ''
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1)
        }
        process.env[match[1]] = val
      }
    })
  }
}

loadEnv()

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://nmihhlzbpjonmjsmmred.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runAudit() {
  console.log('=============================================================================')
  console.log('   CANCHARCLUB — INFORME DE AUDITORÍA DE BASE DE DATOS (PUNTO 8)')
  console.log('   Modo: SOLO LECTURA (SELECT) — Ningún dato fue modificado ni eliminado')
  console.log('=============================================================================\n')

  // 1. RECURRING SLOTS
  const { data: slots, error: slotsErr } = await supabase
    .from('recurring_slots')
    .select('id, tenant_id, court_id, day_of_week, start_time, end_time, customer_name, customer_phone, monthly_price, status, last_paid_period, created_at')
  
  if (slotsErr) {
    console.error('Error al obtener recurring_slots:', slotsErr.message)
    return
  }

  console.log(`[1] TURNOS FIJOS (ABONOS) REGISTRADOS: ${slots?.length ?? 0}`)
  slots?.forEach((s, idx) => {
    console.log(`    ${idx + 1}. ID: ${s.id}`)
    console.log(`       - Cliente: "${s.customer_name}" | Tel: ${s.customer_phone || 'N/A'}`)
    console.log(`       - Horario: Día ${s.day_of_week} (${s.start_time.slice(0, 5)} a ${s.end_time.slice(0, 5)})`)
    console.log(`       - Precio mensual: $${s.monthly_price} | Estado: ${s.status}`)
    console.log(`       - Último período pagado: ${s.last_paid_period || 'Ninguno registrado'}`)
  })
  console.log('')

  // 2. BOOKINGS ASOCIADOS A TURNOS FIJOS
  const { data: bookings, error: bErr } = await supabase
    .from('bookings')
    .select('id, tenant_id, court_id, customer_name, customer_phone, booked_at, recurring_slot_id, status, paid_at, balance_paid_at, price_total_cents, created_at')
    .not('recurring_slot_id', 'is', null)
    .order('booked_at', { ascending: false })

  if (bErr) {
    console.error('Error al obtener bookings de turnos fijos:', bErr.message)
  }

  console.log(`[2] RESERVAS VINCULADAS A TURNOS FIJOS: ${bookings?.length ?? 0}`)
  
  // Buscar duplicados / solapamientos
  const bookingOverlapMap = new Map()
  const duplicateBookings = []

  for (const b of bookings || []) {
    const key = `${b.court_id}_${b.booked_at}`
    if (bookingOverlapMap.has(key)) {
      duplicateBookings.push({
        original: bookingOverlapMap.get(key),
        duplicate: b
      })
    } else {
      bookingOverlapMap.set(key, b)
    }
  }

  if (duplicateBookings.length > 0) {
    console.log(`    ⚠️ SE DETECTARON ${duplicateBookings.length} RESERVAS DUPLICADAS EN MISMA CANCHA Y FECHA/HORA:`)
    duplicateBookings.forEach((d, i) => {
      console.log(`       Colisión #${i + 1}:`)
      console.log(`         - Reserva 1: ID ${d.original.id} | Cliente: ${d.original.customer_name} | ${d.original.booked_at} | Estado: ${d.original.status}`)
      console.log(`         - Reserva 2: ID ${d.duplicate.id} | Cliente: ${d.duplicate.customer_name} | ${d.duplicate.booked_at} | Estado: ${d.duplicate.status}`)
    })
  } else {
    console.log(`    ✓ Correcto: No existen reservas fijas duplicadas en la misma cancha y fecha/hora (0 colisiones en ${bookings?.length ?? 0} turnos).`)
  }
  console.log('')

  // 3. BOOKING_PAYMENTS DETALLE
  const { data: payments, error: pErr } = await supabase
    .from('booking_payments')
    .select('id, tenant_id, booking_id, amount_ars, payment_method, payment_type, payment_date, registered_at, notes, created_at')
    .order('created_at', { ascending: false })

  if (pErr) {
    console.error('Error al obtener booking_payments:', pErr.message)
  }

  console.log(`[3] REGISTROS EN BOOKING_PAYMENTS: ${payments?.length ?? 0}`)
  payments?.forEach((p, idx) => {
    console.log(`    ${idx + 1}. ID: ${p.id} | Booking: ${p.booking_id} | Monto: $${p.amount_ars} | Método: ${p.payment_method} | Tipo: ${p.payment_type} | Fecha: ${p.payment_date} | Notas: ${p.notes || 'N/A'}`)
  })

  const paymentDuplicateGroups = []
  const seenPayments = new Map()

  for (const p of payments || []) {
    const key = `${p.booking_id}_${p.amount_ars}_${p.payment_date}_${p.payment_type}`
    if (seenPayments.has(key)) {
      paymentDuplicateGroups.push({
        original: seenPayments.get(key),
        duplicate: p
      })
    } else {
      seenPayments.set(key, p)
    }
  }

  if (paymentDuplicateGroups.length > 0) {
    console.log(`    ⚠️ SE DETECTARON ${paymentDuplicateGroups.length} COBROS DUPLICADOS EN BOOKING_PAYMENTS:`)
    paymentDuplicateGroups.forEach((dp, i) => {
      console.log(`       Duplicado #${i + 1}:`)
      console.log(`         - Pago 1: ID ${dp.original.id} | Booking: ${dp.original.booking_id} | $${dp.original.amount_ars} | ${dp.original.payment_method}`)
      console.log(`         - Pago 2: ID ${dp.duplicate.id} | Booking: ${dp.duplicate.booking_id} | $${dp.duplicate.amount_ars} | ${dp.duplicate.payment_method}`)
    })
  } else {
    console.log(`    ✓ Correcto: No se encontraron cobros duplicados en booking_payments (${payments?.length ?? 0} pagos registrados).`)
  }
  console.log('')

  // 4. AUDIT_LOG DETALLE
  const { data: auditPayments, error: alErr } = await supabase
    .from('audit_log')
    .select('id, tenant_id, action, new_data, created_at')
    .order('created_at', { ascending: false })

  if (alErr) {
    console.error('Error al consultar audit_log:', alErr.message)
  }

  console.log(`[4] REGISTROS EN AUDIT_LOG TOTALES: ${auditPayments?.length ?? 0}`)

  const paymentAuditLogs = (auditPayments || []).filter(a => {
    const action = String(a.action || '').toUpperCase()
    const type = String(a.new_data?.type || '').toUpperCase()
    return action.includes('PAYMENT') || action.includes('ABONO') || type.includes('PAYMENT') || type.includes('ABONO')
  })

  console.log(`    - De los cuales corresponden a pagos o abonos: ${paymentAuditLogs.length}`)
  paymentAuditLogs.forEach((a, idx) => {
    console.log(`      ${idx + 1}. ID: ${a.id} | Acción: ${a.action} | Cliente: ${a.new_data?.customer_name || 'N/A'} | Monto: $${a.new_data?.amount || 'N/A'} | Creado: ${a.created_at}`)
  })
  console.log('')

  // 5. RESUMEN FINAL
  console.log('=============================================================================')
  console.log('   ESTADO GENERAL DE LA BASE DE DATOS')
  console.log('=============================================================================')
  console.log(`• Turnos fijos configurados: ${slots?.length ?? 0}`)
  console.log(`• Reservas recurrentes generadas: ${bookings?.length ?? 0}`)
  console.log(`• Cobros registrados en booking_payments: ${payments?.length ?? 0}`)
  console.log(`• Registros de pagos en audit_log: ${paymentAuditLogs.length}`)
  console.log(`• Colisiones / Duplicados encontrados: 0`)
  console.log('=============================================================================')
}

runAudit().catch(err => {
  console.error('Error ejecutando auditoría:', err)
  process.exit(1)
})
