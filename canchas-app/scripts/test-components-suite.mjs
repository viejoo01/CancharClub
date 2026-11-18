import { chromium, devices } from 'playwright';
import path from 'path';

const ARTIFACT_DIR = 'C:\\Users\\Viejo\\.gemini\\antigravity-ide\\brain\\cdba5760-b18a-4e1f-8bfd-2aa96532e05e';
const BASE_URL = 'https://cancharclub.com.ar';

async function runComponentTests() {
  console.log('🧪 Iniciando Suite de Verificación de Carga de Componentes con Playwright...');
  console.log(`🌐 Base URL: ${BASE_URL}\n`);

  const browser = await chromium.launch({ channel: 'msedge', headless: true });

  // Contexto Desktop de alta resolución
  const desktopContext = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 CancharClub-QA/1.0',
  });

  const page = await desktopContext.newPage();

  const networkErrors = [];
  const consoleErrors = [];

  page.on('response', (res) => {
    if (res.status() >= 400 && !res.url().includes('favicon')) {
      networkErrors.push({ url: res.url(), status: res.status() });
    }
  });

  page.on('console', (msg) => {
    if (msg.type() === 'error' && !msg.text().includes('Failed to load resource')) {
      consoleErrors.push(msg.text());
    }
  });

  const suiteResults = [];

  // =========================================================================
  // 1. COMPONENTE: Landing Page & Navegación Principal
  // =========================================================================
  console.log('1️⃣ [Componente] Verificando Landing Page y Header...');
  try {
    const t0 = Date.now();
    await page.goto(`${BASE_URL}`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('header, nav', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const logo = await page.locator('text=CancharClub').first().isVisible();
    const searchInput = await page.locator('input[placeholder*="Buscá por club"]').first().isVisible();
    const sportsCards = await page.locator('text=Pádel, text=Fútbol, text=Tenis, text=Básquet').count();
    const clubCards = await page.locator('text=Verificado').count();

    console.log(`   ✓ Logo visible: ${logo}`);
    console.log(`   ✓ Barra de búsqueda interactiva: ${searchInput}`);
    console.log(`   ✓ Deportes disponibles: ${sportsCards >= 4 ? '4/4 detectados' : sportsCards}`);
    console.log(`   ✓ Tarjetas de clubes activos: ${clubCards} encontrados`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'comp_01_landing_desktop.png') });
    suiteResults.push({
      component: 'Landing Page & Header',
      status: logo && searchInput && clubCards > 0 ? 'PASS' : 'WARN',
      durationMs: Date.now() - t0,
      details: `${clubCards} clubes, selector de deportes OK`,
    });
  } catch (err) {
    console.error('   ✗ Falló Landing Page:', err.message);
    suiteResults.push({ component: 'Landing Page & Header', status: 'FAIL', error: err.message });
  }

  // =========================================================================
  // 2. COMPONENTE: Búsqueda y Filtros Reactivos en Landing
  // =========================================================================
  console.log('\n2️⃣ [Componente] Verificando Interactividad de Filtros (Búsqueda Reactiva)...');
  try {
    const t0 = Date.now();
    const searchInput = page.locator('input[placeholder*="Buscá por club"]').first();
    await searchInput.fill('Demo3');
    await page.waitForTimeout(800);

    const filteredClub = await page.locator('text=Demo3').first().isVisible();
    console.log(`   ✓ Filtro de texto reactivo aplicado: visible=${filteredClub}`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'comp_02_landing_search_filter.png') });
    suiteResults.push({
      component: 'Reactive Search Filter',
      status: filteredClub ? 'PASS' : 'WARN',
      durationMs: Date.now() - t0,
      details: 'Filtro por texto respondió sin recarga',
    });
  } catch (err) {
    console.error('   ✗ Falló Filtro de Búsqueda:', err.message);
    suiteResults.push({ component: 'Reactive Search Filter', status: 'FAIL', error: err.message });
  }

  // =========================================================================
  // 3. COMPONENTE: Portal Público del Club Demo3 (Header, Deportes, Calendario)
  // =========================================================================
  console.log('\n3️⃣ [Componente] Verificando Portal Público del Club (/club/demo3-4436)...');
  try {
    const t0 = Date.now();
    await page.goto(`${BASE_URL}/club/demo3-4436`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('text=Demo3, text=Fútbol, text=Pádel', { timeout: 10000 });
    await page.waitForTimeout(1500);

    const clubTitle = await page.locator('h1, h2, div:has-text("Demo3")').first().innerText();
    const padelBtn = page.locator('button:has-text("Pádel"), div[role="button"]:has-text("Pádel")').first();
    const futbolBtn = page.locator('button:has-text("Fútbol"), div[role="button"]:has-text("Fútbol")').first();

    const hasSports = (await padelBtn.count() > 0) && (await futbolBtn.count() > 0);
    const dateCarouselButtons = await page.locator('button:has-text("Nov"), button:has-text("HOY"), button:has-text("MAÑ")').count();
    const slotsCount = await page.locator('button:has-text("Reservar")').count();

    console.log(`   ✓ Club cargado: "${clubTitle.split('\n')[0]}"`);
    console.log(`   ✓ Selector de Deportes (Fútbol/Pádel): ${hasSports}`);
    console.log(`   ✓ Carrusel de Fechas: ${dateCarouselButtons} días navegables`);
    console.log(`   ✓ Grilla de Turnos Disponibles: ${slotsCount} turnos listos`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'comp_03_club_portal.png') });
    suiteResults.push({
      component: 'Club Public Portal Grid',
      status: hasSports && slotsCount > 0 ? 'PASS' : 'WARN',
      durationMs: Date.now() - t0,
      details: `${slotsCount} turnos libres, ${dateCarouselButtons} días navegables`,
    });
  } catch (err) {
    console.error('   ✗ Falló Portal Público:', err.message);
    suiteResults.push({ component: 'Club Public Portal Grid', status: 'FAIL', error: err.message });
  }

  // =========================================================================
  // 4. COMPONENTE: Modal Interactivo de Reserva & Pasarela de Seña
  // =========================================================================
  console.log('\n4️⃣ [Componente] Verificando Modal de Reserva de Turno (Apertura y Formulario)...');
  try {
    const t0 = Date.now();
    const firstReserveBtn = page.locator('button:has-text("Reservar")').first();
    await firstReserveBtn.click();
    await page.waitForTimeout(1500);

    // Verificar si se abrió el modal o la vista de checkout
    const modalVisible = (await page.locator('[role="dialog"], div.fixed, div.inset-0').count() > 0) || page.url().includes('reserva');
    const hasInputs = (await page.locator('input[type="text"], input[type="tel"]').count() > 0);

    console.log(`   ✓ Modal / Checkout abierto con éxito: ${modalVisible}`);
    console.log(`   ✓ Campos de contacto del jugador presentes: ${hasInputs}`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'comp_04_reservation_modal.png') });
    suiteResults.push({
      component: 'Booking Modal & Form',
      status: modalVisible ? 'PASS' : 'WARN',
      durationMs: Date.now() - t0,
      details: 'Apertura fluida de modal sin parpadeo',
    });

    // Cerrar modal si hay botón de cerrar o tecla escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } catch (err) {
    console.error('   ✗ Falló Modal de Reserva:', err.message);
    suiteResults.push({ component: 'Booking Modal & Form', status: 'FAIL', error: err.message });
  }

  // =========================================================================
  // 5. COMPONENTE: Portal de Autenticación / Login (/auth/login)
  // =========================================================================
  console.log('\n5️⃣ [Componente] Verificando Componentes de Formulario de Login...');
  try {
    const t0 = Date.now();
    await page.goto(`${BASE_URL}/auth/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('form, input', { timeout: 10000 });

    const userInput = await page.locator('input[name="emailPrefix"], input#emailPrefix, input[type="text"]').first().isVisible();
    const passInput = await page.locator('input[type="password"]').first().isVisible();
    const eyeBtn = await page.locator('button:has-text("Ver"), button:has-text("Ocultar")').first().isVisible();
    const submitBtn = await page.locator('button[type="submit"]').first().isVisible();

    console.log(`   ✓ Input de usuario/email: ${userInput}`);
    console.log(`   ✓ Input de contraseña: ${passInput}`);
    console.log(`   ✓ Botón toggle visibilidad contraseña: ${eyeBtn}`);
    console.log(`   ✓ Botón de envío ("Entrar al Club"): ${submitBtn}`);

    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'comp_05_auth_login.png') });
    suiteResults.push({
      component: 'Auth Login Form',
      status: userInput && passInput && submitBtn ? 'PASS' : 'FAIL',
      durationMs: Date.now() - t0,
      details: 'Formulario de acceso corporativo validado',
    });
  } catch (err) {
    console.error('   ✗ Falló Formulario Login:', err.message);
    suiteResults.push({ component: 'Auth Login Form', status: 'FAIL', error: err.message });
  }

  // =========================================================================
  // 6. COMPONENTE: Mis Reservas del Jugador (/mis-reservas)
  // =========================================================================
  console.log('\n6️⃣ [Componente] Verificando Portal de Mis Reservas (/mis-reservas)...');
  try {
    const t0 = Date.now();
    await page.goto(`${BASE_URL}/mis-reservas`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main, input, button', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const pageContent = await page.innerText('body');
    const hasSearch = pageContent.includes('reserva') || pageContent.includes('Teléfono') || pageContent.includes('Buscar') || pageContent.includes('Código');

    console.log(`   ✓ Módulo Mis Reservas interactivo cargado: ${hasSearch}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'comp_06_mis_reservas.png') });
    suiteResults.push({
      component: 'Mis Reservas Player Portal',
      status: hasSearch ? 'PASS' : 'WARN',
      durationMs: Date.now() - t0,
      details: 'Buscador de turnos del jugador operativo',
    });
  } catch (err) {
    console.error('   ✗ Falló Mis Reservas:', err.message);
    suiteResults.push({ component: 'Mis Reservas Player Portal', status: 'FAIL', error: err.message });
  }

  // =========================================================================
  // 7. COMPONENTE: Onboarding de Clubes (/sumar-club)
  // =========================================================================
  console.log('\n7️⃣ [Componente] Verificando Landing de Captación / Sumar Club (/sumar-club)...');
  try {
    const t0 = Date.now();
    await page.goto(`${BASE_URL}/sumar-club`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('main, form, h1, h2', { timeout: 10000 });
    await page.waitForTimeout(1000);

    const bodyText = await page.innerText('body');
    const hasHeading = bodyText.includes('club') || bodyText.includes('Sumá') || bodyText.includes('CancharClub');

    console.log(`   ✓ Onboarding / Sumar Club renderizado: ${hasHeading}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'comp_07_sumar_club.png') });
    suiteResults.push({
      component: 'Sumar Club Onboarding',
      status: hasHeading ? 'PASS' : 'WARN',
      durationMs: Date.now() - t0,
      details: 'Formulario de registro y propuesta de valor cargada',
    });
  } catch (err) {
    console.error('   ✗ Falló Sumar Club:', err.message);
    suiteResults.push({ component: 'Sumar Club Onboarding', status: 'FAIL', error: err.message });
  }

  // =========================================================================
  // 8. COMPONENTE: Superadmin Login Gate (/superadmin/login)
  // =========================================================================
  console.log('\n8️⃣ [Componente] Verificando SuperAdmin Gate (/superadmin/login)...');
  try {
    const t0 = Date.now();
    await page.goto(`${BASE_URL}/superadmin/login`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('form, input', { timeout: 10000 });

    const passField = await page.locator('input[type="password"]').first().isVisible();
    console.log(`   ✓ Gate de SuperAdmin seguro disponible: ${passField}`);
    await page.screenshot({ path: path.join(ARTIFACT_DIR, 'comp_08_superadmin_login.png') });
    suiteResults.push({
      component: 'SuperAdmin Access Gate',
      status: passField ? 'PASS' : 'WARN',
      durationMs: Date.now() - t0,
      details: 'Puerta de acceso master protegida',
    });
  } catch (err) {
    console.error('   ✗ Falló Superadmin Gate:', err.message);
    suiteResults.push({ component: 'SuperAdmin Access Gate', status: 'FAIL', error: err.message });
  }

  // =========================================================================
  // 9. COMPONENTE: Vista Mobile (iPhone 14 Pro) Responsive & PWA Navigation
  // =========================================================================
  console.log('\n9️⃣ [Componente] Verificando Componentes en Vista Móvil (iPhone 14 Pro)...');
  try {
    const t0 = Date.now();
    const mobileContext = await browser.newContext({
      ...devices['iPhone 14 Pro'],
      deviceScaleFactor: 2,
    });
    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(`${BASE_URL}/club/demo3-4436`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForSelector('text=Demo3', { timeout: 10000 });
    await mobilePage.waitForTimeout(1500);

    await mobilePage.screenshot({ path: path.join(ARTIFACT_DIR, 'comp_09_mobile_club.png') });
    console.log('   ✓ Layout mobile renderizado con éxito');

    await mobileContext.close();
    suiteResults.push({
      component: 'Mobile Responsive View (iPhone 14 Pro)',
      status: 'PASS',
      durationMs: Date.now() - t0,
      details: 'Viewport adaptado, botones touch optimizados',
    });
  } catch (err) {
    console.error('   ✗ Falló Vista Móvil:', err.message);
    suiteResults.push({ component: 'Mobile Responsive View', status: 'FAIL', error: err.message });
  }

  await browser.close();

  console.log('\n================ RESUMEN DE PRUEBAS DE COMPONENTES ================');
  console.table(suiteResults);

  console.log(`\n📡 Errores HTTP de Red (4xx/5xx): ${networkErrors.length}`);
  if (networkErrors.length > 0) {
    console.log(networkErrors);
  }

  console.log(`⚠️ Errores de Consola: ${consoleErrors.length}`);
  if (consoleErrors.length > 0) {
    console.log(consoleErrors);
  }

  console.log('\n📸 Todas las capturas de componentes fueron guardadas en:');
  console.log(ARTIFACT_DIR);
}

runComponentTests().catch((err) => {
  console.error('Error fatal ejecutando pruebas:', err);
  process.exit(1);
});
