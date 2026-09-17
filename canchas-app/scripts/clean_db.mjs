import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://nmihhlzbpjonmjsmmred.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5taWhobHpicGpvbm1qc21tcmVkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTA1NTgxNiwiZXhwIjoyMTA0NjMxODE2fQ.jxxHGbQU0_e7oEr8agjb3uzW8MHhyVd5kac8ctVsHCA'
)

const superAdminIds = [
  '4c99cd23-4c21-435c-ac2c-bb42b6f9421f',
  'bc3c7f12-4d3b-4bc1-9819-50ac3b14d725'
]

async function main() {
  console.log('\n=== LIMPIEZA TOTAL Y PROFUNDA DE LA BASE DE DATOS ===\n')

  // 0. Limpiar audit_log (cantina, comandas, turnos fijos)
  const { error: alErr } = await supabase.from('audit_log').delete().gt('id', 0)
  console.log('Audit log:', alErr?.message || 'ALL DELETED')

  // 1. Delete all bookings
  const { error: bErr } = await supabase.from('bookings').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Bookings:', bErr?.message || 'ALL DELETED')

  // 2. Delete all price_rules
  const { error: prErr } = await supabase.from('price_rules').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Price rules:', prErr?.message || 'ALL DELETED')

  // 3. Delete all tournaments
  const { error: tErr } = await supabase.from('tournaments').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Tournaments:', tErr?.message || 'ALL DELETED')

  // 4. Delete all courts
  const { error: cErr } = await supabase.from('courts').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Courts:', cErr?.message || 'ALL DELETED')

  // 5. Unlink superadmin profiles from any tenant
  const { error: unlinkErr } = await supabase
    .from('profiles')
    .update({ tenant_id: null })
    .in('id', superAdminIds)
  console.log('Unlink superadmins from tenant:', unlinkErr?.message || 'OK')

  // 6. Delete all non-superadmin profiles
  const { error: pfErr } = await supabase
    .from('profiles')
    .delete()
    .not('id', 'in', `(${superAdminIds.map(id => `"${id}"`).join(',')})`)
  console.log('Profiles (non-superadmin):', pfErr?.message || 'DELETED')

  // 7. Delete non-superadmin auth users
  const { data: usersData } = await supabase.auth.admin.listUsers()
  const toDelete = usersData?.users?.filter(u => !superAdminIds.includes(u.id)) || []
  console.log('Auth users to delete:', toDelete.map(u => u.email))
  for (const u of toDelete) {
    const { error } = await supabase.auth.admin.deleteUser(u.id)
    console.log('  Auth user:', u.email, error?.message || 'DELETED')
  }

  // 8. Delete ALL tenants
  const { error: tenErr } = await supabase.from('tenants').delete().neq('id', '00000000-0000-0000-0000-000000000000')
  console.log('Tenants:', tenErr?.message || 'ALL DELETED')

  // 9. Final verification
  console.log('\n--- VERIFICACIÓN FINAL ---')
  const { data: remainingTenants } = await supabase.from('tenants').select('id, name')
  const { data: remainingCourts } = await supabase.from('courts').select('id')
  const { data: remainingBookings } = await supabase.from('bookings').select('id')
  const { data: remainingProfiles } = await supabase.from('profiles').select('id, full_name, role, tenant_id')
  const { data: remainingUsers } = await supabase.auth.admin.listUsers()

  console.log('Tenants restantes (debe ser 0):', remainingTenants?.length)
  console.log('Courts restantes (debe ser 0):', remainingCourts?.length)
  console.log('Bookings restantes (debe ser 0):', remainingBookings?.length)
  console.log('Profiles restantes (solo 2 superadmins):', remainingProfiles)
  console.log('Auth users restantes (solo 2 superadmins):', remainingUsers?.users?.map(u => ({ id: u.id, email: u.email })))
}

main().catch(err => console.error(err))
