// scripts/apply-all-supabase-migrations.mjs
// ==============================================================================
// EJECUTOR Y REGISTRADOR OFICIAL DE MIGRACIONES SUPABASE
// ==============================================================================

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
  console.error('ERROR: No se encontró SUPABASE_ACCESS_TOKEN en .env.local');
  process.exit(1);
}

const endpoint = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;

async function executeQuery(sql) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: sql })
  });

  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { ok: res.ok, status: res.status, body: json, raw: text };
}

async function main() {
  console.log('══════════════════════════════════════════════════════════════════');
  console.log('  CancharClub — Sincronización y Registro de Migraciones Supabase');
  console.log(`  Proyecto: ${PROJECT_REF}`);
  console.log('══════════════════════════════════════════════════════════════════\n');

  // 1. Inicializar esquema de tracking de migraciones de Supabase
  console.log('1. Inicializando esquema oficial "supabase_migrations"...');
  const initSchemaSql = `
    CREATE SCHEMA IF NOT EXISTS supabase_migrations;

    CREATE TABLE IF NOT EXISTS supabase_migrations.schema_migrations (
        version text NOT NULL PRIMARY KEY,
        name text,
        statements text[]
    );
  `;
  const initRes = await executeQuery(initSchemaSql);
  if (!initRes.ok) {
    console.error('Error al inicializar schema_migrations:', initRes.raw);
    process.exit(1);
  }
  console.log('   ✓ Tabla supabase_migrations.schema_migrations lista.\n');

  // 2. Obtener migraciones ya registradas
  const existingRes = await executeQuery('SELECT version FROM supabase_migrations.schema_migrations;');
  const recordedVersions = new Set();
  if (existingRes.ok && Array.isArray(existingRes.body)) {
    existingRes.body.forEach(r => recordedVersions.add(r.version));
  }
  console.log(`   Migraciones previamente registradas en BD: ${recordedVersions.size}\n`);

  // 3. Leer archivos de migración locales ordenados cronológicamente
  const migrationsDir = path.resolve('supabase/migrations');
  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  console.log(`2. Procesando ${files.length} archivos de migración...\n`);

  let appliedCount = 0;
  let alreadyRecordedCount = 0;
  let failedCount = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const baseName = file.replace('.sql', '');
    const parts = baseName.split('_');
    const version = baseName; // Usar baseName completo como versión para evitar colisiones de fecha
    const descriptiveName = parts.slice(1).join('_') || parts[0];

    process.stdout.write(`  [${i + 1}/${files.length}] ${file} ... `);

    if (recordedVersions.has(version)) {
      console.log('✓ Ya registrada');
      alreadyRecordedCount++;
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf8');

    // Ejecutar el SQL de la migración
    const execRes = await executeQuery(sql);

    const isSuccess = execRes.ok;
    const errorMsg = execRes.raw || '';
    const isAlreadyExisted = errorMsg.includes('already exists') || errorMsg.includes('duplicate');

    if (isSuccess || isAlreadyExisted) {
      // Registrar la migración en la tabla oficial de Supabase
      const recordSql = `
        INSERT INTO supabase_migrations.schema_migrations (version, name)
        VALUES ('${version}', '${descriptiveName}')
        ON CONFLICT (version) DO UPDATE SET name = EXCLUDED.name;
      `;
      await executeQuery(recordSql);

      if (isSuccess) {
        console.log('✅ APLICADA Y REGISTRADA');
      } else {
        console.log('✅ Ya existían objetos -> REGISTRADA');
      }
      appliedCount++;
    } else {
      console.log(`⚠️ ERROR (HTTP ${execRes.status})`);
      console.log(`     Detalle: ${errorMsg.slice(0, 250)}`);
      failedCount++;
    }
  }

  // 4. Recargar schema cache en PostgREST
  console.log('\n3. Recargando schema cache en PostgREST...');
  await executeQuery("NOTIFY pgrst, 'reload schema';");
  console.log('   ✓ PostgREST schema cache actualizado.');

  // 5. Verificación final de migraciones registradas
  const finalCheck = await executeQuery('SELECT version, name FROM supabase_migrations.schema_migrations ORDER BY version;');
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log(`  Resumen de Migraciones:`);
  console.log(`  • Nuevas registradas/aplicadas: ${appliedCount}`);
  console.log(`  • Ya presentes: ${alreadyRecordedCount}`);
  console.log(`  • Fallos: ${failedCount}`);
  if (finalCheck.ok && Array.isArray(finalCheck.body)) {
    console.log(`  • Total registradas en Supabase Dashboard: ${finalCheck.body.length}`);
  }
  console.log('══════════════════════════════════════════════════════════════════\n');

  if (failedCount === 0) {
    console.log('🎉 ¡Todas las migraciones están 100% sincronizadas en Supabase!\n');
  } else {
    console.log('⚠️ Hubo advertencias o errores en algunas migraciones. Revisar arriba.\n');
  }
}

main().catch(err => {
  console.error('Fallo fatal:', err);
  process.exit(1);
});
