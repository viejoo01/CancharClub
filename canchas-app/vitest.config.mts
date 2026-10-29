import { defineConfig } from 'vitest/config'
import path from 'path'
import fs from 'fs'

// Cargar variables de .env.test.local, .env.test o .env.local para entorno de pruebas
const testEnvCandidates = [
  path.resolve(import.meta.dirname, './.env.test.local'),
  path.resolve(import.meta.dirname, './.env.test'),
  path.resolve(import.meta.dirname, './.env.local'),
]

const hasDedicatedTestEnv = fs.existsSync(testEnvCandidates[0]) || fs.existsSync(testEnvCandidates[1])
if (!hasDedicatedTestEnv && fs.existsSync(testEnvCandidates[2])) {
  console.warn('\n⚠️  [Vitest] ADVERTENCIA DE SEGURIDAD: No se detectó .env.test.local ni .env.test.')
  console.warn('   Las pruebas se ejecutarán utilizando credenciales de .env.local.')
  console.warn('   Para aislar completamente las pruebas de desarrollo/producción, creá .env.test.local (ver .env.test.example).\n')
}

for (const envPath of testEnvCandidates) {
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8')
    content.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) return
      const eqIdx = trimmed.indexOf('=')
      if (eqIdx > 0) {
        const key = trimmed.slice(0, eqIdx).trim()
        const val = trimmed.slice(eqIdx + 1).trim()
        if (!process.env[key]) {
          process.env[key] = val
        }
      }
    })
  }
}

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
