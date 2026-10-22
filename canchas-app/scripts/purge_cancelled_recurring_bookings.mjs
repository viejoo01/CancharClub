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

if (!supabaseServiceKey) {
  console.error('ERROR: SUPABASE_SERVICE_ROLE_KEY is missing.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function purgeCancelledRecurringBookings() {
  console.log('=============================================================================')
  console.log('   CANCHARCLUB — EJECUCIÓN DE PURGA SEGURA (OPCIÓN B)')
  console.log('   Condición: recurring_slot_id IS NOT NULL AND status = "cancelled"')
  console.log('=============================================================================\n')

  // 1. Pre-verificación: listar exactamente qué se va a eliminar
  const { data: targets, error: targetErr } = await supabase
    .from('bookings')
    .select('id, tenant_id, booked_at, status, customer_name, recurring_slot_id')
    .not('recurring_slot_id', 'is', null)
    .eq('status', 'cancelled')

  if (targetErr) {
    console.error('Error al consultar registros objetivo:', targetErr.message)
    process.exit(1)
  }

  console.log(`[1] Registros identificados para eliminación: ${targets.length}`)
  targets.forEach((t, i) => {
    console.log(`    ${i + 1}. ID: ${t.id} | Cliente: ${t.customer_name} | Fecha: ${t.booked_at} | Estado: ${t.status}`)
  })

  if (targets.length === 0) {
    console.log('\n✓ No hay registros cancelados de turnos fijos para eliminar.')
    return
  }

  // 2. Ejecutar eliminación específica por IDs
  const targetIds = targets.map(t => t.id)
  const { error: delErr } = await supabase
    .from('bookings')
    .delete()
    .in('id', targetIds)

  if (delErr) {
    console.error('Error durante la eliminación:', delErr.message)
    process.exit(1)
  }

  console.log(`\n[2] Se eliminaron exitosamente ${targetIds.length} registros cancelados.`)

  // 3. Post-verificación: comprobar el estado de las reservas del turno fijo
  const { data: remaining, error: remErr } = await supabase
    .from('bookings')
    .select('id, booked_at, status, customer_name, recurring_slot_id')
    .not('recurring_slot_id', 'is', null)
    .order('booked_at', { ascending: true })

  if (remErr) {
    console.error('Error al verificar reservas remanentes:', remErr.message)
    return
  }

  console.log(`\n[3] Reservas de turnos fijos remanentes en base de datos: ${remaining.length}`)
  remaining.forEach((r, i) => {
    console.log(`    ${i + 1}. ID: ${r.id} | Cliente: ${r.customer_name} | Fecha: ${r.booked_at} | Estado: ${r.status}`)
  })

  console.log('\n=============================================================================')
  console.log('   PURGA COMPLETADA CON ÉXITO — BASE DE DATOS SANEADA')
  console.log('=============================================================================')
}

purgeCancelledRecurringBookings().catch(err => {
  console.error('Error inesperado:', err)
  process.exit(1)
})
