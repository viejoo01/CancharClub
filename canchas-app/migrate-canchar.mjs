// migrate-canchar.mjs — Ejecuta todas las migraciones necesarias para CancharClub
// Uso: node migrate-canchar.mjs (desde la raíz del proyecto)

const PROJECT_REF = 'nmihhlzbpjonmjsmmred'
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5taWhobHpicGpvbm1qc21tcmVkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4OTA1NTgxNiwiZXhwIjoyMTA0NjMxODE2fQ.jxxHGbQU0_e7oEr8agjb3uzW8MHhyVd5kac8ctVsHCA'
const MGMT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

// Todas las migraciones necesarias para Sprint 1
const MIGRATIONS = [
  {
    name: 'Crear tabla court_orders (Cantina)',
    sql: `
      CREATE TABLE IF NOT EXISTS public.court_orders (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id     UUID NOT NULL,
        court_id      UUID,
        court_name    TEXT NOT NULL DEFAULT 'Mostrador',
        customer_name TEXT NOT NULL DEFAULT 'Mostrador',
        items         JSONB NOT NULL DEFAULT '[]',
        total_ars     NUMERIC(12,2) NOT NULL DEFAULT 0,
        status        TEXT NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING','PREPARING','DELIVERED','CANCELLED')),
        notes         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `
  },
  {
    name: 'Índice tenant_id en court_orders',
    sql: `CREATE INDEX IF NOT EXISTS idx_court_orders_tenant_id ON public.court_orders(tenant_id);`
  },
  {
    name: 'Índice created_at en court_orders',
    sql: `CREATE INDEX IF NOT EXISTS idx_court_orders_created_at ON public.court_orders(created_at);`
  },
  {
    name: 'Índice status en court_orders',
    sql: `CREATE INDEX IF NOT EXISTS idx_court_orders_status ON public.court_orders(status);`
  },
  {
    name: 'Habilitar RLS en court_orders',
    sql: `ALTER TABLE public.court_orders ENABLE ROW LEVEL SECURITY;`
  },
  {
    name: 'Columna light_is_on en courts (IoT luces)',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='courts' AND column_name='light_is_on'
        ) THEN
          ALTER TABLE public.courts ADD COLUMN light_is_on BOOLEAN NOT NULL DEFAULT false;
        END IF;
      END $$;
    `
  },
  {
    name: 'Columna light_updated_at en courts',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='courts' AND column_name='light_updated_at'
        ) THEN
          ALTER TABLE public.courts ADD COLUMN light_updated_at TIMESTAMPTZ;
        END IF;
      END $$;
    `
  },
  {
    name: 'Columna relay_ip en courts (IoT)',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='courts' AND column_name='relay_ip'
        ) THEN
          ALTER TABLE public.courts ADD COLUMN relay_ip TEXT;
        END IF;
      END $$;
    `
  },
  {
    name: 'Columna relay_type en courts',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='courts' AND column_name='relay_type'
        ) THEN
          ALTER TABLE public.courts ADD COLUMN relay_type TEXT DEFAULT 'SHELLY';
        END IF;
      END $$;
    `
  },
  {
    name: 'Columna relay_channel en courts',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='courts' AND column_name='relay_channel'
        ) THEN
          ALTER TABLE public.courts ADD COLUMN relay_channel INTEGER DEFAULT 0;
        END IF;
      END $$;
    `
  },
  {
    name: 'Columna has_lighting en courts',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='courts' AND column_name='has_lighting'
        ) THEN
          ALTER TABLE public.courts ADD COLUMN has_lighting BOOLEAN NOT NULL DEFAULT true;
        END IF;
      END $$;
    `
  },
  {
    name: 'Columna balance_paid_at en bookings (Caja)',
    sql: `
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_schema='public' AND table_name='bookings' AND column_name='balance_paid_at'
        ) THEN
          ALTER TABLE public.bookings ADD COLUMN balance_paid_at TIMESTAMPTZ;
        END IF;
      END $$;
    `
  },
  {
    name: 'Verificar court_orders — listar columnas',
    sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_schema='public' AND table_name='court_orders' ORDER BY ordinal_position;`,
    isCheck: true
  },
]

async function execSQL(sql) {
  const res = await fetch(MGMT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({ query: sql }),
  })
  const text = await res.text()
  let json
  try { json = JSON.parse(text) } catch { json = text }
  return { ok: res.ok, status: res.status, body: json }
}

async function main() {
  console.log('═══════════════════════════════════════════════')
  console.log('  CancharClub — Ejecutor de Migraciones SQL')
  console.log(`  Proyecto: ${PROJECT_REF}`)
  console.log('═══════════════════════════════════════════════\n')

  let passed = 0, failed = 0

  for (const m of MIGRATIONS) {
    process.stdout.write(`  ⏳  ${m.name} ... `)
    try {
      const { ok, status, body } = await execSQL(m.sql)

      if (ok) {
        console.log(`✅  OK`)
        if (m.isCheck && Array.isArray(body)) {
          console.log(`       Columnas en court_orders:`)
          body.forEach(r => console.log(`         • ${r.column_name.padEnd(20)} ${r.data_type}`))
        }
        passed++
      } else {
        const msg = typeof body === 'string' ? body : JSON.stringify(body)
        if (msg.includes('already exists') || msg.includes('duplicate')) {
          console.log(`✅  Ya existía`)
          passed++
        } else {
          console.log(`⚠️  HTTP ${status}`)
          console.log(`       ${msg.slice(0, 200)}`)
          failed++
        }
      }
    } catch (e) {
      console.log(`❌  ${e.message}`)
      failed++
    }
  }

  console.log('\n═══════════════════════════════════════════════')
  console.log(`  ✅ Exitosas : ${passed}`)
  console.log(`  ❌ Fallidas : ${failed}`)
  console.log('═══════════════════════════════════════════════')

  if (failed === 0) {
    console.log('\n  🎉 ¡Migraciones completadas! La BD está lista.\n')
  } else {
    console.log('\n  ⚠️  Revisá los errores arriba.\n')
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
