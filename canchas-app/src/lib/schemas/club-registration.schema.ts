// src/lib/schemas/club-registration.schema.ts
// ==============================================================================
// SCHEMAS Y TIPOS DE VALIDACIÓN PARA EL REGISTRO DE NUEVO CLUB (ZOD)
// Separado de Server Actions para total compatibilidad con Next.js App Router
// ==============================================================================

import { z } from 'zod'
import type { SaaSPlanId } from '@/config/saas-plans'

export const SaaSPlanIdSchema = z.enum([
  'CHICO_1',
  'MEDIANO_2',
  'CONSOLIDADO_3_4',
  'GRANDE_5_PLUS'
])

export const SportTypeSchema = z.enum([
  'PADEL',
  'FUTBOL5',
  'FUTBOL7',
  'FUTBOL11',
  'TENIS',
  'SQUASH',
  'BASQUET',
  'OTHER'
])

export const registerClubSchema = z.object({
  clubName: z
    .string()
    .trim()
    .min(1, 'El nombre del club es obligatorio')
    .min(3, 'El nombre del club debe tener al menos 3 caracteres')
    .max(60, 'El nombre del club no puede superar los 60 caracteres'),
  email: z
    .string()
    .trim()
    .email('Ingresá un correo electrónico con formato válido')
    .optional()
    .or(z.literal('')),
  password: z
    .string()
    .min(1, 'La contraseña es obligatoria')
    .min(8, 'La contraseña debe tener al menos 8 caracteres')
    .max(64, 'La contraseña no puede superar los 64 caracteres'),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\s\-()]{7,25}$/, 'Ingresá un número de teléfono o WhatsApp válido (mín. 7 dígitos)')
    .optional()
    .or(z.literal('')),
  city: z
    .string()
    .trim()
    .min(2, 'La ciudad debe tener al menos 2 caracteres')
    .default('San Miguel de Tucumán'),
  province: z
    .string()
    .trim()
    .min(2, 'La provincia debe tener al menos 2 caracteres')
    .default('Tucumán'),
  address: z
    .string()
    .trim()
    .max(120, 'La dirección no puede superar los 120 caracteres')
    .optional()
    .or(z.literal('')),
  planId: SaaSPlanIdSchema.default('MEDIANO_2'),
  sports: z
    .array(SportTypeSchema)
    .min(1, 'Seleccioná al menos un deporte para las canchas iniciales')
    .default(['PADEL', 'FUTBOL5']),
  customSlug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'El slug solo puede contener letras minúsculas, números y guiones medios')
    .optional()
    .or(z.literal('')),
  initialCourtsCount: z
    .number()
    .int()
    .min(1, 'Debe inicializarse al menos 1 cancha')
    .max(20, 'No se pueden inicializar más de 20 canchas en el alta inicial')
    .optional(),
  defaultSlotPriceArs: z
    .number()
    .positive('La tarifa de referencia debe ser mayor a 0')
    .default(30000),
})

export type RegisterClubInput = z.infer<typeof registerClubSchema>

export interface RegisteredClubData {
  tenantId: string
  slug: string
  name: string
  email: string
  ownerUserId: string
  planId: SaaSPlanId
  city: string
  province: string
  trialEndsAt: string
  isTrialActive: boolean
  seededCourtsCount: number
  initialPlanCapArs: number
  dashboardUrl: string
  publicUrl: string
}

export type RegisterClubActionResult =
  | {
      success: true
      data: RegisteredClubData
      message: string
    }
  | {
      success: false
      error: string
      fieldErrors?: Partial<Record<keyof RegisterClubInput, string[]>>
    }

export function generateBaseSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'club'
}
