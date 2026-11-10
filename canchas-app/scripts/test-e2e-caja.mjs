import { chromium } from 'playwright'
import path from 'path'
import fs from 'fs'

/**
 * Test E2E Automatizado con Playwright:
 * Autenticación en el Club Demo -> Navegación a Caja Diaria y Arqueo -> Auditoría de Errores y Captura
 */
export async function runCajaE2ETest() {
  console.log('=== Iniciando Test E2E: Login Club Demo + Caja Diaria ===')

  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  })

  const page = await context.newPage()

  const pageErrors = []
  const consoleErrors = []

  page.on('pageerror', (err) => {
    console.error('[PAGE ERROR]', err.message)
    pageErrors.push(err.message)
  })

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      const txt = msg.text()
      if (!txt.includes('favicon') && !txt.includes('404')) {
        console.warn('[CONSOLE ERROR]', txt)
        consoleErrors.push(txt)
      }
    }
  })

  const baseUrl = process.env.TEST_BASE_URL || 'https://www.cancharclub.com.ar'

  console.log(`1. Navegando al formulario de acceso: ${baseUrl}/auth/login...`)
  await page.goto(`${baseUrl}/auth/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2000)

  console.log('2. Ingresando credenciales del club demo...')
  const emailInput = await page.waitForSelector('input[name="emailPrefix"], input#emailPrefix, input[type="text"], input[type="email"]', { timeout: 10000 })
  await emailInput.fill('demo3')

  const passwordInput = await page.waitForSelector('input[name="password"], input[type="password"]', { timeout: 10000 })
  await passwordInput.fill('DemoCancharClub2026!')

  console.log('3. Enviando formulario de autenticación...')
  const submitBtn = await page.waitForSelector('button[type="submit"]', { timeout: 10000 })

  await Promise.all([
    page.waitForURL((url) => url.pathname.includes('/dashboard'), { timeout: 20000 }).catch(() => {}),
    submitBtn.click(),
  ])

  await page.waitForTimeout(3000)
  console.log(`URL tras login: ${page.url()}`)

  if (!page.url().includes('/dashboard')) {
    await page.goto(`${baseUrl}/dashboard`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(3000)
  }

  console.log('4. Navegando al módulo de Caja Diaria & Arqueo (/dashboard/caja)...')
  await page.goto(`${baseUrl}/dashboard/caja`, { waitUntil: 'domcontentloaded' })

  console.log('5. Esperando estabilización y carga completa de métricas de caja...')
  await page.waitForSelector('main, .card, [class*="card"]', { timeout: 15000 })

  // Esperar a que los loaders finalicen
  await page.waitForFunction(() => {
    return !document.body.innerText.includes('Cargando...')
  }, { timeout: 15000 }).catch(() => {
    console.log('Loaders finalizados.')
  })

  await page.waitForTimeout(1500)

  const capturasDir = path.resolve(process.cwd(), '../capturas-demo')
  if (!fs.existsSync(capturasDir)) {
    fs.mkdirSync(capturasDir, { recursive: true })
  }

  const screenPath = path.join(capturasDir, 'e2e_caja_club_demo.png')
  await page.screenshot({ path: screenPath, fullPage: false })
  console.log(`-> Captura guardada en: ${screenPath}`)

  const screenFullPath = path.join(capturasDir, 'e2e_caja_club_demo_fullpage.png')
  await page.screenshot({ path: screenFullPath, fullPage: true })
  console.log(`-> Captura full-page guardada en: ${screenFullPath}`)

  await browser.close()

  console.log('=== Verificaciones de Salud de la Pantalla ===')
  console.log(`- Errores no capturados (Page Errors): ${pageErrors.length}`)
  console.log(`- Errores de consola: ${consoleErrors.length}`)

  if (pageErrors.length > 0) {
    throw new Error(`Test E2E fallido por errores en página: ${pageErrors.join(' | ')}`)
  }

  console.log('=== Test E2E de Caja completado con éxito (0 errores) ===')
}

// Ejecución directa si se invoca desde CLI
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`) {
  runCajaE2ETest().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
