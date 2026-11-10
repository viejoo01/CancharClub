// src/actions/club-registration.actions.ts
// ==============================================================================
// SERVER ACTION: REGISTRO DE NUEVO CLUB CON VALIDACIÓN TIPADA ESTRICTA (ZOD)
// ==============================================================================
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createServiceClient } from '@/lib/supabase/server'
import { validatePasswordStrength } from '@/lib/auth-security'
import { formatClubEmail } from '@/lib/utils'
import { sendSuperadminAlert } from '@/lib/superadmin-notifications'
import { SAAS_PLANS, getPlanCapArs, type SaaSPlanId } from '@/config/saas-plans'
import type { SportType, CourtSurface } from '@/types/database'

// ─── 1. SCHEMAS DE VALIDACIÓN ESTRICTA CON ZOD ───────────────────────────────

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

// ─── 2. TIPOS DE RESPUESTA TIPADOS ESTRICTAMENTE ─────────────────────────────

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

// ─── 3. HELPERS DE DOMINIO Y RESILICIÓN ───────────────────────────────────────

export function generateBaseSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '') || 'club'
}

export async function resolveUniqueTenantSlug(
  serviceClient: SupabaseClient,
  baseSlug: string
): Promise<string> {
  const { data: existing } = await serviceClient
    .from('tenants')
    .select('slug')
    .ilike('slug', `${baseSlug}%`)

  if (!existing || existing.length === 0) {
    return baseSlug
  }

  const existingSlugs = new Set(existing.map((r: { slug: string }) => r.slug.toLowerCase()))
  if (!existingSlugs.has(baseSlug)) {
    return baseSlug
  }

  let counter = 2
  while (counter < 200) {
    const candidate = `${baseSlug}-${counter}`
    if (!existingSlugs.has(candidate)) {
      return candidate
    }
    counter++
  }

  return `${baseSlug}-${Date.now().toString(36)}`
}

interface CourtSeedConfig {
  sport: SportType
  surface: CourtSurface
  slotDurationMinutes: number
  sportLabel: string
}

function getCourtSeedConfig(sport: SportType): CourtSeedConfig {
  switch (sport) {
    case 'PADEL':
      return { sport: 'PADEL', surface: 'CRISTAL', slotDurationMinutes: 90, sportLabel: 'Pádel' }
    case 'FUTBOL5':
      return { sport: 'FUTBOL5', surface: 'CESPED_SINTETICO', slotDurationMinutes: 60, sportLabel: 'Fútbol 5' }
    case 'FUTBOL7':
      return { sport: 'FUTBOL7', surface: 'CESPED_SINTETICO', slotDurationMinutes: 60, sportLabel: 'Fútbol 7' }
    case 'FUTBOL11':
      return { sport: 'FUTBOL11', surface: 'CESPED_SINTETICO', slotDurationMinutes: 60, sportLabel: 'Fútbol 11' }
    case 'TENIS':
      return { sport: 'TENIS', surface: 'POLVO_LADRILLO', slotDurationMinutes: 90, sportLabel: 'Tenis' }
    case 'BASQUET':
      return { sport: 'BASQUET', surface: 'CEMENTO', slotDurationMinutes: 60, sportLabel: 'Básquet' }
    case 'SQUASH':
      return { sport: 'SQUASH', surface: 'PARQUET', slotDurationMinutes: 60, sportLabel: 'Squash' }
    default:
      return { sport: 'OTHER', surface: 'SINTETICO', slotDurationMinutes: 60, sportLabel: 'Multideporte' }
  }
}

function normalizeFormData(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  formData.forEach((value, key) => {
    if (key === 'sports') {
      try {
        result[key] = JSON.parse(value.toString())
      } catch {
        result[key] = value.toString().split(',').map(s => s.trim().toUpperCase()).filter(Boolean)
      }
    } else if (key === 'initialCourtsCount' || key === 'defaultSlotPriceArs') {
      const num = Number(value)
      if (!isNaN(num)) result[key] = num
    } else {
      result[key] = typeof value === 'string' ? value.trim() : value
    }
  })
  return result
}

// ─── 4. SERVER ACTION PRINCIPAL: REGISTRO TIPADO DE CLUB ─────────────────────

/**
 * Server Action para registrar un nuevo club con validación tipada estricta.
 * - Valida schema Zod con reporte de errores por campo (`fieldErrors`).
 * - Genera slug limpio y verifica colisiones de forma determinista.
 * - Registra la cuenta administrativa en Supabase Auth y crea el perfil `TENANT_ADMIN`.
 * - Inicializa el inquilino con 15 días bonificados de prueba gratuita (`TRIAL` activo sin tarjeta requerida).
 * - Siembra canchas y price_rules estándar para habilitar el uso inmediato del sistema.
 * - Notifica la telemetría al Superadmin y revalida la caché de rutas.
 */
export async function registerClubStrictAction(
  rawInput: RegisterClubInput | FormData
): Promise<RegisterClubActionResult> {
  try {
    // 1. Normalización de entrada si proviene de FormData
    const inputObject = rawInput instanceof FormData ? normalizeFormData(rawInput) : rawInput

    // 2. Validación de schema estricto con Zod
    const parseResult = registerClubSchema.safeParse(inputObject)
    if (!parseResult.success) {
      const flattened = parseResult.error.flatten()
      const firstErrorMessage = parseResult.error.issues[0]?.message || 'Datos de registro inválidos'
      return {
        success: false,
        error: firstErrorMessage,
        fieldErrors: flattened.fieldErrors as Partial<Record<keyof RegisterClubInput, string[]>>,
      }
    }

    const data = parseResult.data

    // 3. Validación de robustez de contraseña bancaria
    const pwdCheck = validatePasswordStrength(data.password)
    if (!pwdCheck.valid) {
      return {
        success: false,
        error: pwdCheck.error || 'La contraseña no cumple los requisitos de seguridad.',
        fieldErrors: {
          password: [pwdCheck.error || 'Contraseña insegura.'],
        },
      }
    }

    // 4. Formatear email oficial del club
    const effectiveEmail = formatClubEmail(data.email, data.clubName)

    const serviceClient = await createServiceClient()

    // 5. Invariante: no pueden coexistir dos clubes con el mismo correo oficial
    const { data: existingTenant } = await serviceClient
      .from('tenants')
      .select('id, name')
      .ilike('email', effectiveEmail)
      .maybeSingle()

    if (existingTenant) {
      return {
        success: false,
        error: `El correo "${effectiveEmail}" ya está registrado por el club "${existingTenant.name}". Por favor elegí otro nombre o correo.`,
        fieldErrors: {
          email: ['El correo ya se encuentra en uso por otra cuenta.'],
        },
      }
    }

    // 6. Generación y resolución de colisión de slug único
    const baseSlug = data.customSlug ? generateBaseSlug(data.customSlug) : generateBaseSlug(data.clubName)
    const resolvedSlug = await resolveUniqueTenantSlug(serviceClient, baseSlug)

    // 7. Gestión de usuario en Supabase Auth
    let userId: string | null = null
    let isNewlyCreatedUser = false

    const { data: userData, error: userError } = await serviceClient.auth.admin.createUser({
      email: effectiveEmail,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.clubName,
        phone: data.phone || undefined,
        assigned_password: data.password,
        initial_password: data.password,
      },
      app_metadata: {
        assigned_password: data.password,
      },
    })

    if (!userError && userData?.user) {
      userId = userData.user.id
      isNewlyCreatedUser = true
    } else if (userError) {
      const isAlreadyExists =
        userError.message?.toLowerCase().includes('already') ||
        userError.message?.toLowerCase().includes('exists') ||
        userError.status === 422

      if (isAlreadyExists) {
        // Verificar si el usuario ya está asociado a un tenant activo
        const { data: existingProfile } = await serviceClient
          .from('profiles')
          .select('id, tenant_id')
          .ilike('email', effectiveEmail)
          .maybeSingle()

        if (existingProfile?.tenant_id) {
          return {
            success: false,
            error: `El usuario "${effectiveEmail}" ya pertenece a un club activo. Utilizá otro correo para registrar una nueva sede.`,
            fieldErrors: {
              email: ['Usuario ya asociado a un club activo.'],
            },
          }
        }

        if (existingProfile?.id) {
          userId = existingProfile.id
          await serviceClient.auth.admin.updateUserById(existingProfile.id, {
            password: data.password,
            email_confirm: true,
            user_metadata: {
              full_name: data.clubName,
              phone: data.phone || undefined,
              assigned_password: data.password,
              initial_password: data.password,
            },
          })
        } else {
          return {
            success: false,
            error: `El correo "${effectiveEmail}" ya se encuentra registrado en el sistema de autenticación.`,
          }
        }
      } else {
        return {
          success: false,
          error: `Error al crear la cuenta administrativa: ${userError.message}`,
        }
      }
    }

    if (!userId) {
      return { success: false, error: 'No se pudo generar la cuenta de usuario administrativa.' }
    }

    // 8. Calcular parámetros de prueba gratuita (15 días bonificados) y capacidad de canchas
    const now = new Date()
    const trialDays = 15
    const trialEndsAt = new Date(now.getTime() + trialDays * 86400000).toISOString()

    const baseSlotsMap: Record<SaaSPlanId, number> = {
      CHICO_1: 1,
      MEDIANO_2: 2,
      CONSOLIDADO_3_4: 4,
      GRANDE_5_PLUS: 5,
    }
    const courtsCountToSeed = data.initialCourtsCount || baseSlotsMap[data.planId] || 2
    const initialPlanCapArs = getPlanCapArs(courtsCountToSeed)

    // 9. Inserción de la entidad Club (`tenants`) en Supabase
    const { data: tenant, error: tenantError } = await serviceClient
      .from('tenants')
      .insert({
        name: data.clubName,
        slug: resolvedSlug,
        email: effectiveEmail,
        phone_whatsapp: data.phone || null,
        city: data.city,
        province: data.province,
        address: data.address || null,
        country: 'Argentina',
        timezone: 'America/Argentina/Tucuman',
        is_active: true,
        subscription_status: 'ACTIVE',
        plan_id: data.planId,
        base_slots_plan: courtsCountToSeed,
        payment_methods: ['CARD', 'MERCADO_PAGO', 'CASH', 'TRANSFER'],
        description: JSON.stringify({
          card_linked: false,
          plan_id: data.planId,
          pending_card: false,
          selected_sports: data.sports,
          is_trial: true,
          trial_days: trialDays,
          trial_activated_at: now.toISOString(),
          trial_ends_at: trialEndsAt,
          billing_cycle_max_price_cents: Math.round(data.defaultSlotPriceArs * 100),
          auto_debit_alerts: [],
          auto_debit_attempts: [],
        }),
      })
      .select()
      .single()

    if (tenantError || !tenant) {
      console.error('[registerClubStrictAction] Error insertando tenant:', tenantError)
      if (isNewlyCreatedUser && userId) {
        await serviceClient.auth.admin.deleteUser(userId).catch(() => {})
      }
      return {
        success: false,
        error: tenantError?.message || 'Error al persistir el club en la base de datos.',
      }
    }

    // 10. Asignación del perfil administrativo (`profiles`) vinculado al nuevo tenant
    const { error: profileError } = await serviceClient
      .from('profiles')
      .upsert({
        id: userId,
        tenant_id: tenant.id,
        full_name: data.clubName,
        role: 'TENANT_ADMIN',
        phone: data.phone || null,
      })

    if (profileError) {
      console.error('[registerClubStrictAction] Error asociando profile a tenant:', profileError)
      try {
        await serviceClient.from('tenants').delete().eq('id', tenant.id)
      } catch {}
      if (isNewlyCreatedUser && userId) {
        await serviceClient.auth.admin.deleteUser(userId).catch(() => {})
      }
      return {
        success: false,
        error: 'Error al vincular el usuario administrador al club creado.',
      }
    }

    // 11. Sembrado automático de canchas y reglas de precios base iniciales
    let seededCourts = 0
    try {
      const courtsToInsert = []
      for (let i = 0; i < courtsCountToSeed; i++) {
        const sportEnum = data.sports[i % data.sports.length] || 'PADEL'
        const config = getCourtSeedConfig(sportEnum)

        courtsToInsert.push({
          tenant_id: tenant.id,
          name: `Cancha ${i + 1} (${config.sportLabel})`,
          sport: config.sport,
          surface: config.surface,
          slot_duration_minutes: config.slotDurationMinutes,
          has_lights: true,
          is_indoor: false,
          is_active: true,
          display_order: i + 1,
        })
      }

      const { data: insertedCourts, error: courtInsertErr } = await serviceClient
        .from('courts')
        .insert(courtsToInsert)
        .select('id')

      if (courtInsertErr) {
        console.warn('[registerClubStrictAction] Advertencia sembrando canchas:', courtInsertErr.message)
      } else if (insertedCourts && insertedCourts.length > 0) {
        seededCourts = insertedCourts.length

        // Sembrar tarifas estándar diarias para evitar la vulnerabilidad de turnos a $0
        const priceRulesToInsert = insertedCourts.map((c: { id: string }) => ({
          tenant_id: tenant.id,
          court_id: c.id,
          name: 'Tarifa Estándar Diaria',
          day_of_week: [1, 2, 3, 4, 5, 6, 7],
          time_from: '08:00:00',
          time_to: '23:59:59',
          price_cents: Math.round(data.defaultSlotPriceArs * 100),
          priority: 0,
          is_active: true,
        }))

        const { error: ruleErr } = await serviceClient.from('price_rules').insert(priceRulesToInsert)
        if (ruleErr) {
          console.warn('[registerClubStrictAction] Advertencia sembrando price_rules:', ruleErr.message)
        }
      }
    } catch (seedErr) {
      console.warn('[registerClubStrictAction] Excepción no crítica en sembrado de canchas:', seedErr)
    }

    // 12. Registro en tabla de auditoría para trazabilidad inmutable
    try {
      await serviceClient.from('audit_log').insert({
        tenant_id: tenant.id,
        action: 'TENANT_CREATED',
        table_name: 'tenants',
        record_id: tenant.id,
        actor_id: userId,
        new_data: {
          name: tenant.name,
          slug: tenant.slug,
          email: tenant.email,
          plan_id: tenant.plan_id,
          trial_ends_at: trialEndsAt,
          seeded_courts: seededCourts,
        },
      })
    } catch {}

    // 13. Telemetría instantánea y alerta al Superadmin
    sendSuperadminAlert({
      event: 'NEW_CLUB_REGISTRATION',
      title: '¡Nuevo Club Registrado con Validación Estricta!',
      clubName: tenant.name,
      clubSlug: tenant.slug,
      details: {
        Email: tenant.email,
        Teléfono: tenant.phone_whatsapp || 'No informado',
        Ciudad: `${tenant.city}, ${tenant.province}`,
        Plan: SAAS_PLANS[data.planId]?.name || data.planId,
        'Canchas Iniciales': seededCourts,
        Prueba: '15 días gratis bonificados',
        'Vencimiento Prueba': trialEndsAt,
      },
      priority: 'HIGH',
    }).catch(() => {})

    // 14. Revalidar rutas clave de la aplicación
    try {
      revalidatePath('/dashboard')
      revalidatePath('/admin/tenants')
      revalidatePath(`/club/${tenant.slug}`)
    } catch {}

    return {
      success: true,
      message: `¡Club "${tenant.name}" registrado con éxito! Tu período de prueba de 15 días está activo.`,
      data: {
        tenantId: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        email: tenant.email,
        ownerUserId: userId,
        planId: data.planId,
        city: tenant.city,
        province: tenant.province,
        trialEndsAt,
        isTrialActive: true,
        seededCourtsCount: seededCourts,
        initialPlanCapArs,
        dashboardUrl: '/dashboard',
        publicUrl: `/club/${tenant.slug}`,
      },
    }
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Error inesperado durante el registro'
    console.error('[registerClubStrictAction] Excepción fatal:', err)
    return {
      success: false,
      error: `Error interno de servidor: ${errorMsg}`,
    }
  }
}
