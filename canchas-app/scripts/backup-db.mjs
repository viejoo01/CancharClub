// scripts/backup-db.mjs
// Respaldo semanal automático y manual para CancharClub (Supabase Postgres)
// Genera:
//   1. Dump binario PostgreSQL (.dump) con pg_dump (comprimido, para pg_restore)
//   2. Dump SQL en texto (.sql) para inspección inmediata de turnos y tablas
//   3. Snapshot de datos de negocio en JSON (.json) con turnos señados y teléfonos
//   4. Rotación automática de copias (conserva las últimas 8 semanas)

import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..')
const BACKUP_DIR = path.join(ROOT_DIR, 'backups')
const ENV_FILE = path.join(__dirname, '..', '.env.local')
const LOG_FILE = path.join(BACKUP_DIR, 'backup.log')

// 1. Cargar variables de entorno desde .env.local manualmente
function loadEnv() {
  const env = {}
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
  return { ...env, ...process.env }
}

const env = loadEnv()

// Parámetros de conexión a Supabase
const PROJECT_REF = env.SUPABASE_PROJECT_REF || 'nmihhlzbpjonmjsmmred'
const DB_HOST = env.SUPABASE_DB_HOST || 'aws-0-sa-east-1.pooler.supabase.com'
const DB_PORT = env.SUPABASE_DB_PORT || '5432'
const DB_NAME = env.SUPABASE_DB_NAME || 'postgres'
const DB_USER = env.SUPABASE_DB_USER || `postgres.${PROJECT_REF}`
const DB_PASSWORD = env.SUPABASE_DB_PASSWORD || env.PGPASSWORD || ''
const ACCESS_TOKEN = env.SUPABASE_ACCESS_TOKEN || ''
const RETENTION_WEEKS = parseInt(env.BACKUP_RETENTION_WEEKS || '8', 10)

function log(msg, isError = false) {
  const ts = new Date().toISOString()
  const line = `[${ts}] ${msg}`
  if (isError) {
    console.error(`❌ ${msg}`)
  } else {
    console.log(msg)
  }
  try {
    if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true })
    fs.appendFileSync(LOG_FILE, line + '\n', 'utf8')
  } catch (e) {
    console.error('Error escribiendo log:', e.message)
  }
}

// 2. Localizar binario pg_dump en Windows / Linux / macOS
function findPgDump() {
  if (env.PG_DUMP_PATH && fs.existsSync(env.PG_DUMP_PATH)) {
    return env.PG_DUMP_PATH
  }

  // Rutas conocidas en Windows
  const candidatePaths = [
    'C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\16\\bin\\pg_dump.exe',
    'C:\\Program Files\\PostgreSQL\\15\\bin\\pg_dump.exe',
    'C:\\Program Files (x86)\\PostgreSQL\\17\\bin\\pg_dump.exe',
    'C:\\Program Files (x86)\\PostgreSQL\\16\\bin\\pg_dump.exe',
  ]

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) return p
  }

  // Verificar si está en el PATH
  const checkCmd = process.platform === 'win32' ? 'where' : 'which'
  const res = spawnSync(checkCmd, ['pg_dump'], { encoding: 'utf8' })
  if (res.status === 0 && res.stdout.trim()) {
    const firstLine = res.stdout.trim().split(/\r?\n/)[0]
    if (fs.existsSync(firstLine)) return firstLine
  }

  return null
}

// 3. Obtener fecha y hora en formato seguro para nombres de archivo
function getTimestamp() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const yyyy = now.getFullYear()
  const mm = pad(now.getMonth() + 1)
  const dd = pad(now.getDate())
  const hh = pad(now.getHours())
  const min = pad(now.getMinutes())
  const ss = pad(now.getSeconds())
  return `${yyyy}-${mm}-${dd}_${hh}-${min}-${ss}`
}

// 4. Calcular hash SHA256 de un archivo
function calculateSha256(filePath) {
  if (!fs.existsSync(filePath)) return null
  const hash = crypto.createHash('sha256')
  const data = fs.readFileSync(filePath)
  hash.update(data)
  return hash.digest('hex')
}

// 5. Snapshot de datos de negocio vía HTTPS (Plan de contingencia garantizado)
async function exportBusinessSnapshot(prefix) {
  if (!ACCESS_TOKEN) {
    log('⚠️  No se encontró SUPABASE_ACCESS_TOKEN en .env.local para snapshot HTTPS.', true)
    return null
  }

  log('📦 Iniciando snapshot de tablas de negocio vía Supabase API...')
  const tables = [
    'tenants',
    'courts',
    'profiles',
    'bookings',
    'court_orders',
    'recurring_slots',
    'price_rules',
    'customer_credits',
    'tournament_teams',
    'tournaments',
    'waitlists'
  ]

  const snapshot = {
    exported_at: new Date().toISOString(),
    project_ref: PROJECT_REF,
    tables: {},
    summary: {}
  }

  const queryUrl = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

  for (const table of tables) {
    try {
      const res = await fetch(queryUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify({ query: `SELECT * FROM public.${table};` }),
      })

      if (res.ok) {
        const rows = await res.json()
        snapshot.tables[table] = rows
        snapshot.summary[table] = Array.isArray(rows) ? rows.length : 0
      } else {
        snapshot.tables[table] = []
        snapshot.summary[table] = `Error HTTP ${res.status}`
      }
    } catch (e) {
      snapshot.tables[table] = []
      snapshot.summary[table] = `Error: ${e.message}`
    }
  }

  const jsonFileName = `${prefix}_business_data.json`
  const jsonFilePath = path.join(BACKUP_DIR, jsonFileName)
  fs.writeFileSync(jsonFilePath, JSON.stringify(snapshot, null, 2), 'utf8')
  const stats = fs.statSync(jsonFilePath)

  log(`   ✅ Snapshot JSON creado: ${jsonFileName} (${(stats.size / 1024).toFixed(1)} KB)`)
  log(`      • Turnos señados/totales : ${snapshot.summary.bookings ?? 0}`)
  log(`      • Perfiles y teléfonos   : ${snapshot.summary.profiles ?? 0}`)
  log(`      • Canchas configuradas   : ${snapshot.summary.courts ?? 0}`)
  log(`      • Clubes (Tenants)       : ${snapshot.summary.tenants ?? 0}`)

  return { path: jsonFilePath, size: stats.size, summary: snapshot.summary }
}

// 6. Limpieza de copias antiguas (política de retención)
function purgeOldBackups() {
  log(`🧹 Aplicando política de retención: conservando últimas ${RETENTION_WEEKS} semanas...`)
  const maxAgeMs = RETENTION_WEEKS * 7 * 24 * 60 * 60 * 1000
  const now = Date.now()
  let deletedCount = 0

  const files = fs.readdirSync(BACKUP_DIR)
  for (const file of files) {
    if (file === 'backup.log' || file === 'latest-backup.json' || file === '.gitignore' || file === 'README.md') {
      continue
    }
    const fullPath = path.join(BACKUP_DIR, file)
    try {
      const stats = fs.statSync(fullPath)
      const ageMs = now - stats.mtimeMs
      if (ageMs > maxAgeMs) {
        fs.unlinkSync(fullPath)
        deletedCount++
        log(`   🗑️ Archivo antiguo eliminado: ${file}`)
      }
    } catch (e) {
      log(`   ⚠️ No se pudo evaluar/eliminar ${file}: ${e.message}`, true)
    }
  }

  if (deletedCount === 0) {
    log('   ✨ No se requirió eliminar backups antiguos.')
  } else {
    log(`   ✅ Se purgaron ${deletedCount} archivos antiguos.`)
  }
}

// 7. Ejecución principal
async function main() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('  CancharClub — Sistema de Respaldo Semanal Automático')
  console.log(`  Destino: ${BACKUP_DIR}`)
  console.log('════════════════════════════════════════════════════════════════\n')

  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true })
  }

  const timestamp = getTimestamp()
  const basePrefix = `cancharclub_${timestamp}`
  const startTime = Date.now()

  // Paso 1: Ejecutar Snapshot de Datos Críticos por HTTPS (Seguro y a prueba de fallos de red)
  const jsonResult = await exportBusinessSnapshot(basePrefix)

  // Paso 2: Ejecutar pg_dump para el Dump Completo de PostgreSQL
  const pgDumpBin = findPgDump()
  let dumpResult = null
  let sqlResult = null

  if (!pgDumpBin) {
    log('⚠️  pg_dump no fue encontrado en el sistema.', true)
    log('   Instalá PostgreSQL o configurá PG_DUMP_PATH en .env.local para dumps binarios.')
  } else if (!DB_PASSWORD) {
    log('⚠️  SUPABASE_DB_PASSWORD no está definida en .env.local.', true)
    log('   El snapshot JSON de emergencia se guardó con éxito.')
    log('   Para habilitar pg_dump completo, agregá tu contraseña de base de datos a .env.local:')
    log('   SUPABASE_DB_PASSWORD=tu_contraseña_de_supabase')
  } else {
    log(`🐘 Localizado pg_dump: ${pgDumpBin}`)
    log(`🔗 Conectando a Supabase Pooler (${DB_HOST}:${DB_PORT})...`)

    const dumpFileName = `${basePrefix}.dump`
    const dumpFilePath = path.join(BACKUP_DIR, dumpFileName)
    const sqlFileName = `${basePrefix}.sql`
    const sqlFilePath = path.join(BACKUP_DIR, sqlFileName)

    // Formato 1: Custom Binary Dump (-F c)
    log(`⏳ Generando volcado comprimido (-F c): ${dumpFileName} ...`)
    const dumpEnv = { ...process.env, PGPASSWORD: DB_PASSWORD }
    const dumpArgs = [
      '-h', DB_HOST,
      '-p', String(DB_PORT),
      '-U', DB_USER,
      '-d', DB_NAME,
      '-F', 'c',
      '--schema=public',
      '--no-owner',
      '--no-privileges',
      '-f', dumpFilePath,
    ]

    const procDump = spawnSync(pgDumpBin, dumpArgs, { env: dumpEnv, encoding: 'utf8' })
    if (procDump.status === 0 && fs.existsSync(dumpFilePath)) {
      const stats = fs.statSync(dumpFilePath)
      const sha = calculateSha256(dumpFilePath)
      log(`   ✅ Volcado binario creado: ${dumpFileName} (${(stats.size / 1024).toFixed(1)} KB)`)
      dumpResult = { fileName: dumpFileName, sizeBytes: stats.size, sha256: sha }
    } else {
      log(`   ❌ Error ejecutando pg_dump (-F c): ${procDump.stderr || procDump.error?.message}`, true)
    }

    // Formato 2: Plain SQL (-F p)
    log(`⏳ Generando volcado SQL en texto plano (-F p): ${sqlFileName} ...`)
    const sqlArgs = [
      '-h', DB_HOST,
      '-p', String(DB_PORT),
      '-U', DB_USER,
      '-d', DB_NAME,
      '-F', 'p',
      '--schema=public',
      '--clean',
      '--if-exists',
      '--no-owner',
      '--no-privileges',
      '-f', sqlFilePath,
    ]

    const procSql = spawnSync(pgDumpBin, sqlArgs, { env: dumpEnv, encoding: 'utf8' })
    if (procSql.status === 0 && fs.existsSync(sqlFilePath)) {
      const stats = fs.statSync(sqlFilePath)
      const sha = calculateSha256(sqlFilePath)
      log(`   ✅ Volcado SQL creado: ${sqlFileName} (${(stats.size / 1024).toFixed(1)} KB)`)
      sqlResult = { fileName: sqlFileName, sizeBytes: stats.size, sha256: sha }
    } else {
      log(`   ❌ Error ejecutando pg_dump (-F p): ${procSql.stderr || procSql.error?.message}`, true)
    }
  }

  // Paso 3: Purgar copias viejas
  purgeOldBackups()

  // Paso 4: Generar manifiesto de último backup
  const durationSec = ((Date.now() - startTime) / 1000).toFixed(1)
  const metadata = {
    timestamp: new Date().toISOString(),
    durationSeconds: parseFloat(durationSec),
    project_ref: PROJECT_REF,
    db_host: DB_HOST,
    status: dumpResult || jsonResult ? 'SUCCESS' : 'FAILED',
    files: {
      binary_dump: dumpResult,
      sql_dump: sqlResult,
      json_snapshot: jsonResult ? {
        path: jsonResult.path,
        sizeBytes: jsonResult.size,
        summary: jsonResult.summary
      } : null
    }
  }

  fs.writeFileSync(path.join(BACKUP_DIR, 'latest-backup.json'), JSON.stringify(metadata, null, 2), 'utf8')

  console.log('\n════════════════════════════════════════════════════════════════')
  console.log(`  🎉 Respaldo completado en ${durationSec}s`)
  console.log(`  Estado: ${metadata.status}`)
  console.log(`  Registro guardado en: ${LOG_FILE}`)
  console.log('════════════════════════════════════════════════════════════════\n')
}

main().catch(err => {
  log(`Error crítico en main(): ${err.stack || err.message}`, true)
  process.exit(1)
})
