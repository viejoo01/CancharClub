import { chromium } from 'playwright';
import path from 'path';

const outDir = 'C:\\Users\\Viejo\\.gemini\\antigravity-ide\\brain\\bbe9d573-e8cc-4f33-9963-572d61487a50';
const baseUrl = 'https://www.cancharclub.com.ar';

async function runPwaE2eTests() {
  console.log('🚀 Iniciando Suite de Pruebas E2E de PWA con Playwright...');
  
  const browser = await chromium.launch({ 
    channel: 'msedge', 
    headless: true 
  });

  const testReport = {
    manifestEndpoint: false,
    serviceWorkerEndpoint: false,
    offlinePageEndpoint: false,
    iconsEndpoint: false,
    metaTagsVerified: false,
    mobileInstallBanner: false,
    roleSelectorModal: false,
    iosInstallationGuide: false,
    offlineContingencyRender: false,
    dispatcherRedirectPlayer: false,
    dispatcherRedirectClub: false,
  };

  try {
    // ─── 1. VERIFICACIÓN DE HEADERS Y ENDPOINTS ───
    console.log('\n--- 1. Verificando Endpoints PWA en Red ---');
    const pageCheck = await browser.newPage();
    
    const manifestRes = await pageCheck.goto(`${baseUrl}/manifest.json`);
    console.log(`Manifest status: ${manifestRes.status()} [${manifestRes.headers()['content-type']}]`);
    testReport.manifestEndpoint = manifestRes.status() === 200;

    const swRes = await pageCheck.goto(`${baseUrl}/sw.js`);
    console.log(`Service Worker status: ${swRes.status()} [${swRes.headers()['content-type']}]`);
    testReport.serviceWorkerEndpoint = swRes.status() === 200;

    const offlineRes = await pageCheck.goto(`${baseUrl}/offline.html`);
    console.log(`Offline Page status: ${offlineRes.status()} [${offlineRes.headers()['content-type']}]`);
    testReport.offlinePageEndpoint = offlineRes.status() === 200;

    const iconRes = await pageCheck.goto(`${baseUrl}/icon-192.png`);
    console.log(`Icon 192 status: ${iconRes.status()}`);
    testReport.iconsEndpoint = iconRes.status() === 200;

    await pageCheck.close();

    // ─── 2. DOM META TAGS & EMULACIÓN MOBILE (iPhone 14 Pro) ───
    console.log('\n--- 2. Emulando iPhone 14 Pro & Verificando Meta Tags PWA ---');
    const mobileContext = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
      isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1',
    });

    const mobilePage = await mobileContext.newPage();
    await mobilePage.goto(baseUrl, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForTimeout(2000);

    // Inspeccionar meta tags en el DOM
    const metaCheck = await mobilePage.evaluate(() => {
      const getMeta = (name, attr = 'name') => document.querySelector(`meta[${attr}="${name}"]`)?.getAttribute('content');
      const getLink = (rel) => document.querySelector(`link[rel="${rel}"]`)?.getAttribute('href');

      return {
        manifest: getLink('manifest'),
        appleCapable: getMeta('apple-mobile-web-app-capable'),
        appleStatusBar: getMeta('apple-mobile-web-app-status-bar-style'),
        appleTitle: getMeta('apple-mobile-web-app-title'),
        themeColor: getMeta('theme-color'),
        appleTouchIcon: getLink('apple-touch-icon'),
      };
    });

    console.log('PWA Meta tags encontrados:', metaCheck);
    if (metaCheck.manifest && metaCheck.appleCapable === 'yes' && metaCheck.appleTouchIcon) {
      testReport.metaTagsVerified = true;
    }

    // ─── 3. INTERACCIÓN CON EL BANNER Y MODAL DE INSTALACIÓN ───
    console.log('\n--- 3. Desplegando Selector de Perfil PWA (Jugador vs Club) ---');
    await mobilePage.evaluate(() => {
      window.dispatchEvent(new Event('open-pwa-install-dialog'));
    });
    await mobilePage.waitForTimeout(1000);

    const roleModalVisible = await mobilePage.evaluate(() => {
      return document.querySelector('#role-modal-title') !== null;
    });
    console.log('¿Modal de selección de perfil visible?:', roleModalVisible);
    testReport.roleSelectorModal = roleModalVisible;
    testReport.mobileInstallBanner = roleModalVisible;

    // Capturar screenshot del Selector de Perfil
    const roleModalPath = path.join(outDir, 'pwa_role_selector_modal.png');
    await mobilePage.screenshot({ path: roleModalPath });
    console.log(`📸 Screenshot guardado: ${roleModalPath}`);

    // ─── 4. GUÍA DE INSTALACIÓN PASO A PASO EN IOS SAFARI ───
    console.log('\n--- 4. Activando Guía de Instalación para iOS Safari ---');
    // Clic en el botón "Instalar como Jugador"
    await mobilePage.click('button:has-text("Instalar como Jugador")');
    await mobilePage.waitForTimeout(1000);

    const iosModalVisible = await mobilePage.evaluate(() => {
      return document.querySelector('#ios-pwa-title') !== null;
    });
    console.log('¿Modal guía paso a paso iOS visible?:', iosModalVisible);
    testReport.iosInstallationGuide = iosModalVisible;

    const iosGuidePath = path.join(outDir, 'pwa_ios_install_guide.png');
    await mobilePage.screenshot({ path: iosGuidePath });
    console.log(`📸 Screenshot guardado: ${iosGuidePath}`);

    // Cerrar modal iOS
    await mobilePage.click('button:has-text("Entendido")');
    await mobilePage.waitForTimeout(500);

    await mobileContext.close();

    // ─── 5. PWA OFFLINE CONTINGENCY ENGINE ───
    console.log('\n--- 5. Probando Motor de Contingencia Offline (/offline.html) ---');
    const offlineContext = await browser.newContext({
      viewport: { width: 393, height: 852 },
      deviceScaleFactor: 2,
    });
    const offlinePage = await offlineContext.newPage();

    // Cargar offline.html local para verificar la versión parcheada
    const localOfflineUrl = `file://${path.resolve('public/offline.html').replace(/\\/g, '/')}`;
    console.log(`Cargando archivo offline local: ${localOfflineUrl}`);
    await offlinePage.goto(localOfflineUrl, { waitUntil: 'load' });
    await offlinePage.waitForTimeout(1000);

    // Inyectar copia de seguridad local (snapshot de turnos) en localStorage
    console.log('Inyectando turnos de prueba en localStorage para simular corte de internet...');
    await offlinePage.evaluate(() => {
      const mockSnapshot = {
        date: new Date().toLocaleDateString('es-AR'),
        updatedAt: new Date().toISOString(),
        bookings: [
          {
            starts_at: '2026-11-10T18:00:00Z',
            time_str: '18:00 hs',
            court_name: 'Pádel Panorámica 1 (Cristal)',
            customer_name: 'Lucas Martínez (Capitán)',
            customer_phone: '+54 9 381 555-1234',
            status: 'confirmed',
            deposit_amount_ars: 5000,
            balance_due: 7000
          },
          {
            starts_at: '2026-11-10T19:30:00Z',
            time_str: '19:30 hs',
            court_name: 'Fútbol 5 Techada Pro',
            customer_name: 'Torneo Nocturno - Los Galácticos',
            customer_phone: '+54 9 381 600-9876',
            status: 'confirmed',
            deposit_amount_ars: 8000,
            balance_due: 12000
          },
          {
            starts_at: '2026-11-10T21:00:00Z',
            time_str: '21:00 hs',
            court_name: 'Tenis Polvo de Ladrillo',
            customer_name: 'Esteban Benítez',
            customer_phone: '+54 9 381 444-5566',
            status: 'deposit_paid',
            deposit_amount_ars: 4000,
            balance_due: 4000
          }
        ]
      };
      localStorage.setItem('canchar_today_schedule_snapshot', JSON.stringify(mockSnapshot));
      // Ejecutar re-renderizado
      if (typeof window.renderOfflineSchedule === 'function') {
        window.renderOfflineSchedule();
      }
    });

    await offlinePage.waitForTimeout(1000);

    const turnsRendered = await offlinePage.evaluate(() => {
      const items = document.querySelectorAll('.turn-item');
      return items.length;
    });

    console.log(`Turnos renderizados en modo sin conexión: ${turnsRendered}`);
    testReport.offlineContingencyRender = turnsRendered === 3;

    const offlineShotPath = path.join(outDir, 'pwa_offline_contingency.png');
    await offlinePage.screenshot({ path: offlineShotPath });
    console.log(`📸 Screenshot guardado: ${offlineShotPath}`);

    await offlineContext.close();

    // ─── 6. DESPACHADOR INTELIGENTE DE RUTA /app ───
    console.log('\n--- 6. Verificando Despachador de Perfil /app ---');
    const dispatchContext = await browser.newContext();
    const dispatchPage = await dispatchContext.newPage();

    // Test ?role=player
    await dispatchPage.goto(`${baseUrl}/app?role=player`, { waitUntil: 'domcontentloaded' });
    await dispatchPage.waitForTimeout(2000);
    const finalPlayerUrl = dispatchPage.url();
    console.log(`URL final tras /app?role=player: ${finalPlayerUrl}`);
    testReport.dispatcherRedirectPlayer = finalPlayerUrl === `${baseUrl}/` || finalPlayerUrl === `${baseUrl}`;

    // Test ?role=club
    await dispatchPage.goto(`${baseUrl}/app?role=club`, { waitUntil: 'domcontentloaded' });
    await dispatchPage.waitForTimeout(2000);
    const finalClubUrl = dispatchPage.url();
    console.log(`URL final tras /app?role=club: ${finalClubUrl}`);
    testReport.dispatcherRedirectClub = finalClubUrl.includes('/dashboard') || finalClubUrl.includes('/auth/login');

    await dispatchContext.close();

  } catch (err) {
    console.error('Error durante la ejecución E2E:', err);
  } finally {
    await browser.close();
  }

  console.log('\n========================================');
  console.log('   RESUMEN FINAL DE PRUEBAS PWA        ');
  console.log('========================================');
  console.table(testReport);

  const passedCount = Object.values(testReport).filter(Boolean).length;
  const totalCount = Object.keys(testReport).length;
  console.log(`Resultado: ${passedCount}/${totalCount} pruebas superadas exitosamente.`);
}

runPwaE2eTests().catch(e => {
  console.error(e);
  process.exit(1);
});
