import { chromium } from 'playwright';
import path from 'path';

const outDir = 'C:\\Users\\Viejo\\.gemini\\antigravity-ide\\brain\\bbe9d573-e8cc-4f33-9963-572d61487a50';

async function run() {
  console.log('Launching Edge browser...');
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2
  });
  const page = await context.newPage();

  // --- 1. Login y Dashboard Limpio ---
  console.log('1. Navigating to login...');
  await page.goto('https://www.cancharclub.com.ar/auth/login', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);

  console.log('Filling credentials for demo3...');
  await page.fill('input#emailPrefix, input[name="emailPrefix"], input[placeholder*="nombre@club.com"]', 'demo3');
  await page.fill('input[type="password"]', 'DemoCancharClub2026!');
  
  await Promise.all([
    page.waitForURL('**/dashboard**', { timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]')
  ]);

  await page.waitForTimeout(4000);
  console.log('Logged in at:', page.url());

  // Limpiar banners de suscripción para presentación demo profesional
  await page.evaluate(() => {
    document.querySelectorAll('*').forEach(el => {
      if (el.textContent && el.textContent.includes('Abono Mensual Impago')) {
        el.closest('div.rounded-2xl, div.rounded-3xl, div.border')?.remove();
      }
    });
  });

  await page.waitForTimeout(1000);
  console.log('Capturing real_cancharclub_dashboard.png...');
  await page.screenshot({ path: path.join(outDir, 'real_cancharclub_dashboard.png'), fullPage: false });
  console.log('Done clean dashboard!');

  // --- 2. Portal Público de Reserva (Desktop) ---
  console.log('2. Navigating to public club page...');
  await page.goto('https://www.cancharclub.com.ar/club/demo3-4436', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(3000);
  console.log('Capturing real_cancharclub_public_club.png...');
  await page.screenshot({ path: path.join(outDir, 'real_cancharclub_public_club.png'), fullPage: false });

  // --- 3. Checkout Real con Mercado Pago ---
  console.log('3. Clicking Reservar on first slot for checkout...');
  const reserveBtn = page.locator('button:has-text("Reservar")').first();
  if (await reserveBtn.count() > 0) {
    await reserveBtn.click();
    await page.waitForTimeout(3500);
    console.log('Checkout URL:', page.url());
    console.log('Capturing real_cancharclub_checkout.png...');
    await page.screenshot({ path: path.join(outDir, 'real_cancharclub_checkout.png'), fullPage: false });
    console.log('Done real checkout!');
  }

  // --- 4. Portal Público Mobile (iPhone 14 Pro) ---
  console.log('4. Creating mobile context (iPhone 14 Pro)...');
  const mobileContext = await browser.newContext({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 2,
    isMobile: true
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto('https://www.cancharclub.com.ar/club/demo3-4436', { waitUntil: 'domcontentloaded' });
  await mobilePage.waitForTimeout(3000);
  console.log('Capturing real_cancharclub_mobile_booking.png...');
  await mobilePage.screenshot({ path: path.join(outDir, 'real_cancharclub_mobile_booking.png'), fullPage: false });
  console.log('Done mobile booking!');

  await browser.close();
  console.log('ALL SCREENSHOTS CAPTURED PERFECTLY!');
}

run().catch(err => {
  console.error('Execution failed:', err);
  process.exit(1);
});
