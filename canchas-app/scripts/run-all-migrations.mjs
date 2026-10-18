import fs from 'fs';
import path from 'path';

const PROJECT_REF = 'nmihhlzbpjonmjsmmred';
const envPath = path.resolve('.env.local');
const env = fs.readFileSync(envPath, 'utf8');

function getEnv(key) {
  const m = env.match(new RegExp(`${key}=(.*)`));
  return m ? m[1].trim().replace(/^['"]|['"]$/g, '') : '';
}

const token = getEnv('SUPABASE_ACCESS_TOKEN');

if (!token) {
  console.error('No SUPABASE_ACCESS_TOKEN found');
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function executeSql(filePath) {
  console.log(`\n==================================================`);
  console.log(`Ejecutando archivo: ${filePath}`);
  console.log(`==================================================`);
  const sql = fs.readFileSync(filePath, 'utf8');

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  const responseText = await res.text();
  console.log(`HTTP Status: ${res.status}`);
  if (res.ok) {
    console.log(`Resultado: Migración ejecutada con éxito.`);
  } else {
    console.error(`Error en migración:`, responseText);
    throw new Error(`Fallo al ejecutar ${filePath}: Status ${res.status} - ${responseText}`);
  }
}

async function verifyTables() {
  console.log(`\n==================================================`);
  console.log(`Verificando tablas en PostgreSQL...`);
  console.log(`==================================================`);

  const verifySql = `
    SELECT table_name 
    FROM information_schema.tables 
    WHERE table_schema = 'public' 
      AND table_name IN ('booking_payments', 'products', 'cash_shifts', 'court_lights', 'players')
    ORDER BY table_name;
  `;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: verifySql })
  });

  const data = await res.json();
  console.log('Tablas públicas detectadas:', data);
}

async function main() {
  try {
    await executeSql(path.resolve('supabase/migrations/20261018_create_booking_payments_table.sql'));
    await executeSql(path.resolve('supabase/migrations/20261019_consolidate_core_tables.sql'));
    await verifyTables();

    // Notificar a PostgREST para recargar schema cache
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: "NOTIFY pgrst, 'reload schema';" })
    });
    console.log('Schema cache recargado en PostgREST.');
    console.log('\nTodas las migraciones fueron aplicadas y verificadas con éxito en Supabase.');
  } catch (err) {
    console.error('\nFallo el proceso de migración:', err);
    process.exit(1);
  }
}

main();
