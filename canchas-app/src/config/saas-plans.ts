// src/config/saas-plans.ts
// ==============================================================================
// CONFIGURACIÓN CENTRAL DE PLANES Y PRESTACIONES SAAS POR TAMAÑO DE PREDIO
// ==============================================================================

export type SaaSPlanId = 'CHICO_1' | 'MEDIANO_2' | 'CONSOLIDADO_3_4' | 'GRANDE_5_PLUS'

export type SaaSFeatureKey = 
  | 'grilla_24_7'
  | 'mercadopago_deposits'
  | 'caja_mostrador'
  | 'soporte_inicial'
  | 'cantina_kiosco'
  | 'protocolo_lluvia'
  | 'lista_espera'
  | 'turnos_fijos'
  | 'control_luces'
  | 'multiusuario'
  | 'reportes_ocupacion'
  | 'sin_limite_canchas'
  | 'torneos_expres'
  | 'tickets_termicos'
  | 'asistencia_whatsapp_vip'

export interface SaaSPlanDefinition {
  id: SaaSPlanId
  name: string
  category: string
  courtsLabel: string
  minCourts: number
  maxCourts: number | null
  isPopular?: boolean
  badge: string
  priceTurnosLabel: string
  priceSubtext: string
  turnosMultiplierMin: number
  turnosMultiplierMax: number
  priceExampleArs: string
  features: string[]
  allowedModules: SaaSFeatureKey[]
}

export const SAAS_PLANS: Record<SaaSPlanId, SaaSPlanDefinition> = {
  CHICO_1: {
    id: 'CHICO_1',
    name: 'Complejos Chicos',
    category: '1 Cancha',
    courtsLabel: '1 Cancha',
    minCourts: 1,
    maxCourts: 1,
    badge: '15 días 100% gratis',
    priceTurnosLabel: '1 Turno / mes',
    priceSubtext: '(Ej. aprox. $25.000 – $35.000 / mes según tu tarifa)',
    turnosMultiplierMin: 1.0,
    turnosMultiplierMax: 1.0,
    priceExampleArs: '$25.000 – $35.000',
    features: [
      'Grilla en vivo y reservas automáticas 24/7.',
      'Cobro de señas automáticas por Mercado Pago (Cero clavadas).',
      'Panel de control de caja y turnos en mostrador.',
      'Soporte técnico y configuración inicial incluida.',
    ],
    allowedModules: [
      'grilla_24_7',
      'mercadopago_deposits',
      'caja_mostrador',
      'soporte_inicial',
    ],
  },
  MEDIANO_2: {
    id: 'MEDIANO_2',
    name: 'Predios Medianos',
    category: '2 Canchas',
    courtsLabel: '2 Canchas',
    minCourts: 2,
    maxCourts: 2,
    isPopular: true,
    badge: '15 días 100% gratis | Más popular',
    priceTurnosLabel: '1.5 Turnos / mes',
    priceSubtext: '(Ej. aprox. $40.000 – $55.000 / mes según tu tarifa)',
    turnosMultiplierMin: 1.5,
    turnosMultiplierMax: 1.5,
    priceExampleArs: '$40.000 – $55.000',
    features: [
      'Todo lo del plan anterior.',
      'Módulo de Cantina y Kiosco (punto de venta y stock).',
      'Protocolo climático: reprogramación masiva por lluvia.',
      'Lista de espera automática para horarios pico.',
    ],
    allowedModules: [
      'grilla_24_7',
      'mercadopago_deposits',
      'caja_mostrador',
      'soporte_inicial',
      'cantina_kiosco',
      'protocolo_lluvia',
      'lista_espera',
    ],
  },
  CONSOLIDADO_3_4: {
    id: 'CONSOLIDADO_3_4',
    name: 'Clubes Consolidados',
    category: '3 a 4 Canchas',
    courtsLabel: '3 a 4 Canchas',
    minCourts: 3,
    maxCourts: 4,
    badge: '15 días 100% gratis',
    priceTurnosLabel: '2 a 2.5 Turnos / mes',
    priceSubtext: '(3 canchas: 2 turnos | 4 canchas: 2.5 turnos)',
    turnosMultiplierMin: 2.0,
    turnosMultiplierMax: 2.5,
    priceExampleArs: '$55.000 – $80.000',
    features: [
      'Todo lo del plan anterior.',
      'Gestión de turnos fijos y abonados semanales automáticos.',
      'Multiusuario: accesos para dueños y cancheros con permisos limitados.',
      'Reportes de ocupación y sugerencias de precios.',
    ],
    allowedModules: [
      'grilla_24_7',
      'mercadopago_deposits',
      'caja_mostrador',
      'soporte_inicial',
      'cantina_kiosco',
      'protocolo_lluvia',
      'lista_espera',
      'turnos_fijos',
      'control_luces',
      'multiusuario',
      'reportes_ocupacion',
    ],
  },
  GRANDE_5_PLUS: {
    id: 'GRANDE_5_PLUS',
    name: 'Grandes Complejos',
    category: '5+ Canchas',
    courtsLabel: '5+ Canchas',
    minCourts: 5,
    maxCourts: null,
    badge: '15 días 100% gratis',
    priceTurnosLabel: '3 Turnos / mes (Tope máximo garantizado)',
    priceSubtext: '(No pagás de más sin importar cuántas canchas sumes)',
    turnosMultiplierMin: 3.0,
    turnosMultiplierMax: 3.0,
    priceExampleArs: 'Tope 3 turnos fijos',
    features: [
      'Plataforma completa sin límites de reservas ni canchas.',
      'Módulo de torneos y cuadros de fin de semana exprés.',
      'Integración de tickets térmicos para mostrador y buffet.',
      'Asistencia prioritaria directa por WhatsApp.',
    ],
    allowedModules: [
      'grilla_24_7',
      'mercadopago_deposits',
      'caja_mostrador',
      'soporte_inicial',
      'cantina_kiosco',
      'protocolo_lluvia',
      'lista_espera',
      'turnos_fijos',
      'control_luces',
      'multiusuario',
      'reportes_ocupacion',
      'sin_limite_canchas',
      'torneos_expres',
      'tickets_termicos',
      'asistencia_whatsapp_vip',
    ],
  },
}

export const SAAS_PLANS_LIST: SaaSPlanDefinition[] = [
  SAAS_PLANS.CHICO_1,
  SAAS_PLANS.MEDIANO_2,
  SAAS_PLANS.CONSOLIDADO_3_4,
  SAAS_PLANS.GRANDE_5_PLUS,
]

/**
 * Obtiene el plan asignado automáticamente según la cantidad de canchas activas del club.
 */
export function getPlanByCourtsCount(courtsCount: number): SaaSPlanDefinition {
  if (courtsCount <= 1) return SAAS_PLANS.CHICO_1
  if (courtsCount === 2) return SAAS_PLANS.MEDIANO_2
  if (courtsCount <= 4) return SAAS_PLANS.CONSOLIDADO_3_4
  return SAAS_PLANS.GRANDE_5_PLUS
}

/**
 * Retorna el multiplicador de turnos exacto según la regla escalonada:
 * - 1 Cancha: 1.0 turno
 * - 2 Canchas: 1.5 turnos
 * - 3 Canchas: 2.0 turnos
 * - 4 Canchas: 2.5 turnos
 * - 5+ Canchas: 3.0 turnos (Tope máximo)
 */
export function getPlanMultiplier(courtsCount: number): number {
  if (courtsCount <= 1) return 1.0
  if (courtsCount === 2) return 1.5
  if (courtsCount === 3) return 2.0
  if (courtsCount === 4) return 2.5
  return 3.0 // Tope máximo garantizado
}

/**
 * Verifica si una funcionalidad o módulo está habilitado para un determinado plan
 */
export function isFeatureAllowedForPlan(planId: SaaSPlanId, feature: SaaSFeatureKey): boolean {
  const plan = SAAS_PLANS[planId]
  if (!plan) return false
  return plan.allowedModules.includes(feature)
}
