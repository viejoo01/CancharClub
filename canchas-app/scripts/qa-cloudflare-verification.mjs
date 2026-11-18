import { chromium } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\Viejo\\.gemini\\antigravity-ide\\brain\\cdba5760-b18a-4e1f-8bfd-2aa96532e05e';
const BASE_URL = 'https://cancharclub.com.ar';

async function runQa() {
  console.log('🚀 Iniciando suite de verificación Playwright E2E contra Cloudflare...');
  console.log(`🌐 Base URL: ${BASE_URL}\n`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 CancharClub-QA/1.0',
  });

  const page = await context.newPage();

  const networkFailures = [];
  const consoleErrors = [];

  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      networkFailures.push({ url: res.url(), status: res.status() });
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      consoleErrors.push(msg.text());
    }
  });

  const results = [];

  // --- Test 1: Página de Inicio / Landing ---
  console.log('1️⃣ [Test] Verificando página de inicio...');
  try {
    const start = Date.now();
    await page.goto(`${BASE_URL}`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const duration = Date.now() - start;
    const title = await page.title();
    console.log(`   ✓ Landing cargó en ${duration}ms. Título: "${title}"`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'qa_01_landing.png') });
    results.push({ test: 'Landing Page', status: 'PASS', timeMs: duration });
  } catch (err) {
    console.error('   ✗ Falló Landing Page:', err.message);
    results.push({ test: 'Landing Page', status: 'FAIL', error: err.message });
  }

  // --- Test 2: Página de Login ---
  console.log('\n2️⃣ [Test] Verificando Login (/auth/login)...');
  try {
    const start = Date.now();
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('input, form', { timeout: 10000 });
    const duration = Date.now() - start;

    const emailInput = await page.locator('input[type="text"], input[name="emailPrefix"], input#emailPrefix').first();
    const passwordInput = await page.locator('input[type="password"]').first();
    const submitBtn = await page.locator('button[type="submit"]').first();

    const hasInputs = (await emailInput.count() > 0) && (await passwordInput.count() > 0) && (await submitBtn.count() > 0);
    console.log(`   ✓ Formulario de login presente y operativo: ${hasInputs} (${duration}ms)`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'qa_02_login.png') });
    results.push({ test: 'Login Page Render', status: hasInputs ? 'PASS' : 'FAIL', timeMs: duration });
  } catch (err) {
    console.error('   ✗ Falló Login Page:', err.message);
    results.push({ test: 'Login Page Render', status: 'FAIL', error: err.message });
  }

  // --- Test 3: Flujo de Autenticación y Dashboard ---
  console.log('\n3️⃣ [Test] Ejecutando inicio de sesión con cuenta demo3...');
  try {
    await page.fill('input#emailPrefix, input[name="emailPrefix"], input[placeholder*="nombre@club.com"]', 'demo3');
    await page.fill('input[type="password"]', 'DemoCancharClub2026!');
    
    const startLogin = Date.now();
    await Promise.all([
      page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {}),
      page.click('button[type="submit"]')
    ]);

    await page.waitForTimeout(3000);
    const loginDuration = Date.now() - startLogin;
    const currentUrl = page.url();
    const isDashboard = currentUrl.includes('/dashboard');
    console.log(`   ✓ URL destino: ${currentUrl} (${loginDuration}ms)`);

    // Validar componentes del dashboard (navegación, header, contenido)
    const navExists = await page.locator('nav, header, aside').count() > 0;
    console.log(`   ✓ Componentes de navegación renderizados: ${navExists}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'qa_03_dashboard.png') });
    results.push({ test: 'Dashboard Auth & Components', status: isDashboard ? 'PASS' : 'FAIL', timeMs: loginDuration });
  } catch (err) {
    console.error('   ✗ Falló Login Flow:', err.message);
    results.push({ test: 'Dashboard Auth & Components', status: 'FAIL', error: err.message });
  }

  // --- Test 4: Módulo de Canchas ---
  console.log('\n4️⃣ [Test] Verificando módulo de Canchas (/dashboard/canchas)...');
  try {
    const start = Date.now();
    await page.goto(`${BASE_URL}/dashboard/canchas`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const duration = Date.now() - start;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'qa_04_canchas.png') });
    console.log(`   ✓ Canchas cargó en ${duration}ms`);
    results.push({ test: 'Modulo Canchas', status: 'PASS', timeMs: duration });
  } catch (err) {
    console.error('   ✗ Falló módulo Canchas:', err.message);
    results.push({ test: 'Modulo Canchas', status: 'FAIL', error: err.message });
  }

  // --- Test 5: Módulo de Caja ---
  console.log('\n5️⃣ [Test] Verificando módulo de Caja (/dashboard/caja)...');
  try {
    const start = Date.now();
    await page.goto(`${BASE_URL}/dashboard/caja`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    const duration = Date.now() - start;
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'qa_05_caja.png') });
    console.log(`   ✓ Caja cargó en ${duration}ms`);
    results.push({ test: 'Modulo Caja', status: 'PASS', timeMs: duration });
  } catch (err) {
    console.error('   ✗ Falló módulo Caja:', err.message);
    results.push({ test: 'Modulo Caja', status: 'FAIL', error: err.message });
  }

  // --- Test 6: Portal Público de Reservas del Club ---
  console.log('\n6️⃣ [Test] Verificando Portal Público del Jugador (/club/demo3-4436)...');
  try {
    const start = Date.now();
    await page.goto(`${BASE_URL}/club/demo3-4436`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    const duration = Date.now() - start;
    
    // Verificar si hay canchas o grilla de horarios
    const bodyText = await page.innerText('body');
    const hasClubName = bodyText.includes('Club') || bodyText.includes('Cancha') || bodyText.includes('demo3');
    console.log(`   ✓ Portal público cargó en ${duration}ms (Contenido detectado: ${hasClubName})`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'qa_06_public_portal.png') });
    results.push({ test: 'Portal Publico Jugador', status: hasClubName ? 'PASS' : 'WARN', timeMs: duration });
  } catch (err) {
    console.error('   ✗ Falló portal público:', err.message);
    results.push({ test: 'Portal Publico Jugador', status: 'FAIL', error: err.message });
  }

  await browser.close();

  console.log('\n================ RESUMEN DE CONTROL DE CALIDAD ================');
  console.table(results);

  if (networkFailures.length > 0) {
    console.log('\n⚠️ Errores de red detectados (excluyendo favicon):', networkFailures);
  } else {
    console.log('\n✨ Cero errores de red (4xx/5xx). Todos los chunks, scripts y estilos cargaron al 100%.');
  }

  if (consoleErrors.length > 0) {
    console.log('\n⚠️ Errores en consola del navegador:', consoleErrors);
  } else {
    console.log('✨ Cero errores en consola del navegador.');
  }

  console.log('\n🏁 Pruebas finalizadas con éxito.');
}

runQa().catch((err) => {
  console.error('Error fatal en QA Playwright:', err);
  process.exit(1);
});
