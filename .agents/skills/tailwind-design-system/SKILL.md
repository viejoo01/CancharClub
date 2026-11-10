---
name: tailwind-design-system
description: Guía de diseño de interfaces, sintaxis canónica de Tailwind CSS v4, tokens estéticos, accesibilidad y diseño responsive para CancharClub y aplicaciones web modernas.
---

# Tailwind CSS v4 & UI Design System — Skill de Diseño y Estilos

Esta skill establece las directivas visuales y las reglas de codificación CSS para lograr una interfaz moderna, pulida y compatible con las especificaciones de Tailwind CSS v4.

---

## 1. Reglas Canónicas de Tailwind CSS v4

Para mantener el código libre de advertencias del linter y optimizado para el compilador de Tailwind v4:

### A. Gradientes Lineales
* **Prohibido**: `bg-gradient-to-r`, `bg-gradient-to-b`, `bg-gradient-to-tr`.
* **Obligatorio**: Utilizar la sintaxis canónica de v4:
  - `bg-linear-to-r`
  - `bg-linear-to-b`
  - `bg-linear-to-tr`
  - `bg-linear-to-br`

### B. Escala Canónica vs Clases Arbitrarias
* Siempre que una medida en píxeles coincida con la escala estándar de Tailwind (pasos de 4px o medios pasos de 2px), utilizar la clase canónica en lugar de corchetes arbitrarios:
  - `h-[74px]` ➔ `h-18.5`
  - `w-[62px]` ➔ `w-15.5`
  - `max-w-[270px]` ➔ `max-w-67.5`
  - `p-[14px]` ➔ `p-3.5`

---

## 2. Principios Estéticos y de Experiencia Visual

* **Paleta y Temas**:
  - Modo Oscuro Profundo (Dark Mode): Usar fondos con tonalidades ricas (`bg-slate-950`, `bg-zinc-900`) en lugar de negro puro sin matices.
  - Acentos de Color: Verde esmeralda deportivo (`emerald-500`, `emerald-400`), azules vibrantes y toques ámbar/dorados para estados de alerta.
* **Glassmorphism y Elevación**:
  - Tarjetas y paneles flotantes con `backdrop-blur-md`, `bg-white/5` o `bg-slate-900/80` y bordes sutiles `border border-white/10`.
* **Micro-interacciones y Animaciones**:
  - Efectos `hover:scale-[1.02] active:scale-[0.98] transition-all duration-200`.
  - Estados de foco claros y visibles para navegación por teclado (`focus-visible:ring-2 focus-visible:ring-emerald-500`).

---

## 3. Diseño Mobile-First y Touch Targets

* **Áreas de Toque Táctil**:
  - Todos los botones interactivos, slots de turnos y enlaces en vista móvil deben tener un tamaño mínimo de toque de 44x44px para evitar pulsaciones erróneas.
* **Barras de Acción Inferiores**:
  - En vistas de checkout o confirmación móvil, fijar las acciones primarias en la parte inferior de la pantalla (`fixed bottom-0 left-0 right-0 p-4 border-t border-slate-800 bg-slate-900/95 backdrop-blur-lg`).
* **Iconografía Profesional**:
  - Utilizar exclusivamente iconos de `lucide-react` con tamaño armónico (`size-4`, `size-5`).
  - Prohibido el uso de emojis dentro de botones del sistema, encabezados de tablas o badges transaccionales.
