import fs from 'fs'
import path from 'path'

// Cargar .env.local manualmente
const envPath = path.resolve('.env.local')
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, 'utf8').split('\n')
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim()
      let val = trimmed.slice(eqIdx + 1).trim()
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1)
      }
      process.env[key] = val
    }
  }
}

const PROJECT_REF = 'nmihhlzbpjonmjsmmred'
const ACCESS_TOKEN = process.env.SUPABASE_ACCESS_TOKEN
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const MGMT_URL = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`

async function run() {
  const sqlFile = path.resolve('supabase/migrations/20261013_commercial_fixes.sql')
  const sql = fs.readFileSync(sqlFile, 'utf8')
  console.log('Ejecutando migración:', sqlFile)

  // Intentar primero con ACCESS_TOKEN
  let res = await fetch(MGMT_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ACCESS_TOKEN}`,
    },
    body: JSON.stringify({ query: sql }),
  })

  let text = await res.text()
  if (!res.ok) {
    console.warn('Status con ACCESS_TOKEN:', res.status, text)
    console.warn('Intentando con SERVICE_KEY...')
    res = await fetch(MGMT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_KEY}`,
      },
      body: JSON.stringify({ query: sql }),
    })
    text = await res.text()
  }

  console.log('Final Status:', res.status)
  console.log('Final Response:', text)
  if (res.ok) {
    console.log('✅ Migración ejecutada con éxito.')
  } else {
    console.error('❌ Error ejecutando migración.')
    process.exit(1)
  }
}

run().catch(err => {
  console.error(err)
  process.exit(1)
})
