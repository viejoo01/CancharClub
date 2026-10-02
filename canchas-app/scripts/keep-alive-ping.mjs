// scripts/keep-alive-ping.mjs
// Envía un ping de wake-up a Supabase para evitar el auto-pausado por inactividad.
// Uso: node scripts/keep-alive-ping.mjs

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ENV_FILE = path.join(__dirname, '..', '.env.local')

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
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL || 'https://nmihhlzbpjonmjsmmred.supabase.co'
const ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || ''
const APP_URL = env.NEXT_PUBLIC_APP_URL || 'https://www.cancharclub.com.ar'

async function pingEndpoint(name, url, options = {}) {
  const start = Date.now()
  try {
    const res = await fetch(url, options)
    const latency = Date.now() - start
    const isOk = res.ok
    console.log(`[${isOk ? '✅ OK' : '⚠️ ' + res.status}] ${name.padEnd(25)} (${latency}ms) -> ${url}`)
    try {
      const data = await res.json()
      console.log('    Respuesta:', JSON.stringify(data).slice(0, 140))
    } catch {
      // no es JSON
    }
    return isOk
  } catch (err) {
    console.error(`[❌ ERROR] ${name.padEnd(25)} -> ${err.message}`)
    return false
  }
}

async function main() {
  console.log('════════════════════════════════════════════════════════════════')
  console.log('  CancharClub — Test de Keep-Alive / Wake-up Supabase')
  console.log('════════════════════════════════════════════════════════════════\n')

  const keyToUse = SERVICE_KEY || ANON_KEY

  // 1. Ping directo a Supabase PostgREST (SELECT 1 equivalente sobre tenants)
  if (SUPABASE_URL && keyToUse) {
    await pingEndpoint('Supabase PostgREST Direct', `${SUPABASE_URL}/rest/v1/tenants?select=id,name&limit=1`, {
      headers: {
        'apikey': keyToUse,
        'Authorization': `Bearer ${keyToUse}`,
      }
    })
  }

  // 2. Ping a la URL de producción de la Web App
  if (APP_URL && !APP_URL.includes('localhost')) {
    const cronSecret = (env.CRON_SECRET || '').trim()
    const cronHeaders = cronSecret ? { Authorization: `Bearer ${cronSecret}` } : {}

    await pingEndpoint('Web App /api/health', `${APP_URL}/api/health`)
    await pingEndpoint('Web App /api/cron', `${APP_URL}/api/cron/keep-alive`, { headers: cronHeaders })
  }

  console.log('\n════════════════════════════════════════════════════════════════')
  console.log('  🎉 Proceso de keep-alive ejecutado.')
  console.log('════════════════════════════════════════════════════════════════\n')
}

main().catch(console.error)
