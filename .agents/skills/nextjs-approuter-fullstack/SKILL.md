---
name: nextjs-approuter-fullstack
description: Arquitectura, TypeScript estricto, Server Components, Server Actions y convenciones de desarrollo en Next.js App Router para CancharClub y aplicaciones full-stack.
---

# Next.js App Router & Full-Stack Architecture — Skill de Desarrollo

Esta skill define las mejores prácticas de ingeniería para el desarrollo de aplicaciones web sobre Next.js (App Router), React 19 y TypeScript.

---

## 1. Reglas de Entorno y Directorio de Trabajo

* **Directorio Raíz de la Aplicación**: Toda operación de instalación (`npm install`), compilación (`npm run build`), verificación de tipos (`npx tsc --noEmit`) o ejecución de scripts debe realizarse con el directorio de trabajo en:
  `canchas-app/`
* **Compilación Limpia Obligatoria**: Antes de dar por finalizada cualquier tarea o cambio en el código, es mandatario ejecutar:
  ```bash
  cd canchas-app
  npx tsc --noEmit
  ```
  No se aceptan advertencias que rompan el tipado o errores de compilación pendientes.

---

## 2. Tipado Estricto (Cero `any`)

* **Prohibición de `any`**: Está terminantemente prohibido utilizar el tipo `any`.
* Si se manejan datos dinámicos provenientes de Supabase, utilizar los tipos inferidos:
  ```typescript
  import type { Database } from '@/types/database.types';

  type Booking = Database['public']['Tables']['bookings']['Row'];
  type BookingInsert = Database['public']['Tables']['bookings']['Insert'];
  ```
* Para validar payloads de peticiones externas o formularios, utilizar schemas con **Zod**:
  ```typescript
  import { z } from 'zod';

  export const createBookingSchema = z.object({
    canchaId: z.string().uuid(),
    bookingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    startTime: z.string().regex(/^\d{2}:\d{2}$/),
    customerName: z.string().min(2),
    customerPhone: z.string().min(8),
  });
  ```

---

## 3. Server Components vs Client Components

* **Server Components por Defecto**: Todos los componentes son de servidor a menos que requieran explícitamente:
  - Hooks de estado (`useState`, `useReducer`).
  - Hooks de ciclo de vida o efectos (`useEffect`).
  - Listeners de eventos de usuario (`onClick`, `onChange`, `onSubmit`).
  - Acceso a APIs del navegador (`window`, `localStorage`, WebSockets).
* **Directiva `'use client'`**: Ubicarla exclusivamente en los componentes hoja interactivos (botones, formularios, modales, grillas interactivas) para mantener el bundle de JavaScript lo más liviano posible.
* **Server Actions**:
  - Ubicar en archivos dedicados con la directiva `'use server'`.
  - Revalidar la caché de Next.js inmediatamente tras mutar datos:
    ```typescript
    revalidatePath('/dashboard/reservas');
    ```

---

## 4. Experiencia de Usuario y Rendimiento Visual

* **Cero Parpadeos (Flicker-Free)**:
  - Utilizar skeletons (`SkeletonLoader`) que repliquen la forma real del componente durante la carga de datos.
  - Implementar transiciones suaves (`framer-motion` o transiciones de Tailwind).
* **Feedback Inmediato**:
  - Los botones de acción deben deshabilitarse y mostrar un spinner de carga (`Loader2` animado) mientras la promesa esté pendiente para prevenir dobles envíos.
  - Notificar resultados mediante toasts profesionales (éxito o error explícito con mensaje amigable).
* **Iconografía**:
  - Utilizar exclusivamente `lucide-react`.
  - Evitar emojis innecesarios en la interfaz del sistema comercial.
