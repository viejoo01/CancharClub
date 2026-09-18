// src/lib/sanitize.ts
// ==============================================================================
// UTILIDADES DE SANITIZACIÓN Y PROTECCIÓN ANTI-XSS (Cross-Site Scripting)
// ==============================================================================

/**
 * Escapa caracteres HTML peligrosos para prevenir inyección de scripts en navegadores.
 */
export function escapeHtml(str: string): string {
  if (!str || typeof str !== 'string') return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

/**
 * Limpia y sanitiza texto simple ingresado por usuarios (nombres, títulos, notas).
 * Elimina tags HTML, scripts embebidos, protocolos javascript: y recorta a longitud máxima.
 */
export function sanitizeText(input: string | null | undefined, maxLength = 255): string {
  if (!input || typeof input !== 'string') return ''

  let sanitized = input
    // 1. Eliminar tags HTML completos
    .replace(/<[^>]*>?/gm, '')
    // 2. Eliminar referencias a javascript: y vbscript:
    .replace(/javascript:/gi, '')
    .replace(/vbscript:/gi, '')
    // 3. Eliminar eventos inline peligrosos (ej: onerror=, onclick=)
    .replace(/on\w+\s*=/gi, '')
    .trim()

  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength)
  }

  return sanitized
}

/**
 * Sanitiza un slug para asegurar que solo contenga minúsculas, números y guiones.
 * Impide cualquier inyección en URLs como /club/[slug].
 */
export function sanitizeSlug(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return ''
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Quitar acentos
    .replace(/[^a-z0-9-]/g, '-')     // Reemplazar caracteres no alfanuméricos con guion
    .replace(/-+/g, '-')             // Colapsar múltiples guiones consecutivos
    .replace(/^-|-$/g, '')           // Quitar guiones al inicio o final
    .slice(0, 60)
}

/**
 * Sanitiza un número de teléfono para asegurar formato E.164 limpio.
 */
export function sanitizePhone(input: string | null | undefined): string {
  if (!input || typeof input !== 'string') return ''
  return input.replace(/[^\d+]/g, '').slice(0, 20)
}
