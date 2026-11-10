---
name: playwright-browser-qa
description: Pruebas end-to-end (E2E), automatización de navegador, control de calidad visual y captura de pantallas reales con Playwright para CancharClub.
---

# Playwright Browser QA & Testing — Skill de Pruebas y Automatización

Esta skill rige la automatización de pruebas de extremo a extremo (E2E), auditorías visuales y capturas de demostración mediante Playwright en navegadores reales (Chromium, Edge, WebKit).

---

## 1. Reglas Técnicas Críticas para Aplicaciones con Realtime / WebSockets

Al automatizar páginas de CancharClub (que utilizan conexiones persistentes de Supabase Realtime vía WebSocket):

* **Prohibido usar `waitUntil: 'networkidle'`**:
  Debido a la conexión WebSocket permanente (`wss://`), la red nunca queda "en reposo" (`idle`), lo que provoca que los tests se congelen y terminen en `TimeoutError (30000ms)`.
* **Estrategia Obligatoria de Espera**:
  ```javascript
  // 1. Navegar esperando el DOM básico
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

  // 2. Esperar selectores o elementos clave de la interfaz
  await page.waitForSelector('table, [data-testid="calendar-grid"], main', { timeout: 15000 });

  // 3. Pequeña pausa opcional si se requiere estabilización de render visual
  await page.waitForTimeout(1000);
  ```

---

## 2. Flujos Críticos de Prueba (Test Suites)

### A. Flujo de Autenticación y Panel del Dueño
* Iniciar sesión con credenciales demo en `/auth/login`.
* Verificar redirección exitosa a `/dashboard`.
* Validar que la grilla del calendario cargue los nombres de canchas y turnos del tenant activo.

### B. Flujo Público de Reserva (Experiencia del Jugador)
* Cargar URL pública `/club/[slug]`.
* Seleccionar fecha, cancha y horario libre.
* Completar modal de datos de jugador (nombre, WhatsApp).
* Verificar apertura del modal de bloqueo de 7 minutos con opción de pago de seña por Mercado Pago.

### C. Punto de Venta (Cantina / Kiosco)
* Ingresar a `/dashboard/cantina`.
* Agregar productos al carrito (bebidas, pelotas, snacks).
* Simular cobro en efectivo / MP mostrador y verificar actualización de stock y caja.

---

## 3. Generación de Capturas Reales de Alta Fidelidad

Para capturar material publicitario o reportes visuales del sistema:
* Utilizar `deviceScaleFactor: 2` para resolución Retina / 4K nítida.
* Emular dispositivos móviles usando perfiles oficiales de Playwright:
  ```javascript
  import { devices } from 'playwright';

  const context = await browser.newContext({
    ...devices['iPhone 14 Pro'],
    deviceScaleFactor: 2,
  });
  ```
* Almacenar las capturas en `capturas-demo/` en el proyecto.
