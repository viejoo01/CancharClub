// ==============================================================================
// src/types/database.ts
// Tipos TypeScript que mapean exactamente el schema PostgreSQL
// ==============================================================================

export type UserRole = 'SUPERADMIN' | 'TENANT_ADMIN' | 'TENANT_STAFF' | 'CUSTOMER'
export type TenantStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED' | 'CANCELLED'
export type SportType = 'PADEL' | 'FUTBOL_5' | 'FUTBOL_7' | 'TENIS' | 'SQUASH' | 'OTHER'
export type CourtSurface = 'CEMENTO' | 'SINTETICO' | 'POLVO_LADRILLO' | 'ALFOMBRA' | 'PARQUET' | 'OTHER'
export type SlotDuration = 'MIN_60' | 'MIN_90' | 'MIN_120'
export type PriceRuleType = 'STANDARD' | 'PEAK' | 'OFF_PEAK' | 'WEEKEND' | 'HOLIDAY' | 'PROMO'
export type BookingStatus =
  | 'SLOT_LOCKED'
  | 'PENDING_DEPOSIT'
  | 'DEPOSIT_PAID'
  | 'CONFIRMED'
  | 'PARTIAL_PAID'
  | 'FULLY_PAID'
  | 'CANCELLED_USER'
  | 'CANCELLED_CLUB'
  | 'RAIN_CANCELLED'
  | 'NO_SHOW'
  | 'COMPLETED'
export type BookingOrigin = 'ONLINE_PORTAL' | 'ADMIN_MANUAL' | 'WHATSAPP' | 'PHONE' | 'WALK_IN'
export type PaymentMethod = 'CASH' | 'TRANSFER' | 'MERCADOPAGO' | 'DEBIT_CARD' | 'CREDIT_CARD' | 'QR_MP' | 'OTHER'
export type SubscriptionPaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'WAIVED'

// Estados del inquilino según el ciclo de cobranza escalonado (Dunning)
export type TenantSubscriptionStatus = 
  | 'ACTIVE'               // Al día y operativo
  | 'PAYMENT_PENDING'      // Días 1 al 7: Factura emitida, período ordinario de pago
  | 'GRACE_PERIOD'         // Días 8 al 12: Aviso suave (banner flotante sin bloqueo)
  | 'PARTIALLY_SUSPENDED'  // Días 13 al 14: Degradación parcial (pausa de reservas públicas)
  | 'LOCKED'               // Día 15+: Bloqueo total del panel de administración

export type InvoiceStatus = 'DRAFT' | 'UNPAID' | 'PAID' | 'VOID'

export interface TenantInvoice {
  id: string
  tenant_id: string
  month: number
  year: number
  amount: number
  status: InvoiceStatus
  reference_slot_price: number
  slots_multiplier: number
  mp_preference_id: string | null
  mp_payment_id: string | null
  due_date: string
  paid_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}


// ─── Interfaces de fila de base de datos ──────────────────────────────────────

export interface Tenant {
  id: string
  slug: string
  name: string
  legal_name: string | null
  cuit: string | null
  logo_url: string | null
  primary_color: string
  phone: string | null
  whatsapp_number: string | null
  email: string | null
  website_url: string | null
  instagram_handle: string | null
  address: string | null
  city: string
  province: string
  country: string
  timezone: string
  google_maps_url: string | null
  status: TenantStatus
  subscription_status?: TenantSubscriptionStatus
  is_active?: boolean
  plan_id?: 'CHICO_1' | 'MEDIANO_2' | 'CONSOLIDADO_3_4' | 'GRANDE_5_PLUS' | null
  base_slots_plan?: number
  minimum_floor_ars?: number
  current_balance?: number
  trial_ends_at: string | null
  suspended_at: string | null
  suspension_reason: string | null
  advance_booking_days: number
  cancellation_hours: number
  deposit_percentage: number
  min_deposit_amount_ars: number | null
  business_hours: BusinessHours
  // mp_access_token: NUNCA se envía al cliente
  mp_access_token?: string | null
  mp_public_key: string | null
  mp_marketplace_fee_pct: number
  mp_collector_id?: string | null
  mp_connected_at?: string | null
  mp_refresh_token?: string | null
  // Datos bancarios y de cobro propios del club para señas directas
  bank_name?: string | null
  bank_account_holder?: string | null
  bank_cbu?: string | null
  bank_alias?: string | null
  bank_cuit?: string | null
  payment_methods?: ('TRANSFER' | 'MERCADOPAGO')[]
  created_at: string
  updated_at: string
}

export interface BusinessHours {
  monday: DaySchedule
  tuesday: DaySchedule
  wednesday: DaySchedule
  thursday: DaySchedule
  friday: DaySchedule
  saturday: DaySchedule
  sunday: DaySchedule
}

export interface DaySchedule {
  open: string   // "08:00"
  close: string  // "23:00"
}

export interface Profile {
  id: string
  tenant_id: string | null
  full_name: string | null
  avatar_url: string | null
  phone: string | null
  dni: string | null
  role: UserRole
  preferred_sport: SportType | null
  notification_prefs: { email: boolean; whatsapp: boolean }
  is_active: boolean
  last_seen_at: string | null
  created_at: string
  updated_at: string
}

export interface Court {
  id: string
  tenant_id: string
  name: string
  sport: SportType
  surface: CourtSurface | null
  slot_duration: SlotDuration
  is_indoor: boolean
  has_lighting: boolean
  has_blindex: boolean
  max_players: number | null
  description: string | null
  image_url: string | null
  is_active: boolean
  is_bookable_online: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export interface PriceRule {
  id: string
  tenant_id: string
  court_id: string | null
  name: string
  rule_type: PriceRuleType
  applies_to_days: number[]
  time_from: string   // "HH:MM"
  time_to: string     // "HH:MM"
  price_ars: number
  valid_from: string  // ISO date
  valid_to: string | null
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Booking {
  id: string
  tenant_id: string
  court_id: string
  price_rule_id: string | null
  customer_profile_id: string | null
  customer_name: string
  customer_phone: string | null
  customer_email: string | null
  booking_range: string  // Postgres tstzrange string "[start,end)"
  starts_at: string      // ISO timestamp (generated column)
  ends_at: string        // ISO timestamp (generated column)
  status: BookingStatus
  origin: BookingOrigin
  total_amount_ars: number
  deposit_amount_ars: number
  balance_due_ars: number  // generated column
  deposit_paid_at: string | null
  deposit_mp_payment_id: string | null
  deposit_mp_preference_id: string | null
  deposit_mp_external_ref: string | null
  balance_paid_at: string | null
  redis_lock_key: string | null
  lock_expires_at: string | null
  internal_notes: string | null
  customer_notes: string | null
  created_by_profile_id: string | null
  cancelled_by_profile_id: string | null
  cancelled_at: string | null
  cancellation_reason: string | null
  recurring_slot_id?: string | null
  created_at: string
  updated_at: string
  // Joins opcionales
  court?: Court
  tenant?: Pick<Tenant, 'id' | 'name' | 'slug' | 'whatsapp_number' | 'primary_color'>
}

export interface BookingPayment {
  id: string
  tenant_id: string
  booking_id: string
  amount_ars: number
  payment_method: PaymentMethod
  payment_date: string
  registered_at: string
  received_by_profile_id: string | null
  reference_number: string | null
  mp_payment_id: string | null
  mp_status: string | null
  notes: string | null
  created_at: string
}

export interface CourtBlock {
  id: string
  tenant_id: string
  court_id: string
  block_range: string
  reason: string
  created_by_profile_id: string | null
  created_at: string
}

export interface SaasSubscription {
  id: string
  tenant_id: string
  billing_period_start: string
  billing_period_end: string
  plan_name: string
  plan_multiplier: number
  plan_description: string | null
  peak_price_snapshot_ars: number
  calculated_amount_ars: number
  min_floor_amount_ars: number
  final_amount_ars: number
  discount_amount_ars: number
  total_due_ars: number
  payment_status: SubscriptionPaymentStatus
  paid_at: string | null
  payment_method: PaymentMethod | null
  payment_reference: string | null
  superadmin_notes: string | null
  generated_at: string
  updated_at: string
}

// ─── Turnos Fijos (Abonados Anuales / Semanales) ──────────────────────────────
export interface RecurringBooking {
  id: string
  tenant_id: string
  court_id: string
  court?: Court
  day_of_week: number // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  start_time: string  // "20:00"
  end_time: string    // "21:30"
  customer_name: string
  customer_phone: string
  customer_email?: string
  total_amount_ars: number
  deposit_amount_ars: number
  is_active: boolean
  notes?: string
  created_at?: string
  updated_at?: string
}

// ─── Turnos Fijos Recurrentes (Modelo v2) ─────────────────────────────────────
export interface RecurringSlot {
  id: string
  tenant_id: string
  court_id: string
  court?: Court
  day_of_week: number // 0 = Domingo, 1 = Lunes, ..., 6 = Sábado
  start_time: string  // "20:00:00" o "20:00"
  end_time: string    // "21:30:00" o "21:30"
  customer_name: string
  customer_phone: string
  customer_email?: string | null
  monthly_price: number
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED'
  payment_due_day: number // Día del mes (1-28)
  last_generated_month?: string | null // Ej: "2026-09"
  notes?: string | null
  created_at?: string
  updated_at?: string
}

// ─── Créditos de Jugadores (Protocolo Climático / Cancelaciones) ──────────────
export interface CustomerCredit {
  id: string
  tenant_id: string
  customer_phone: string
  customer_name: string
  amount_ars: number
  status: 'AVAILABLE' | 'USED' | 'EXPIRED' | 'REFUNDED'
  source_booking_id?: string | null
  reason: string
  expires_at: string
  created_at: string
  used_at?: string | null
}

// ─── Lista de Espera Automática para Horarios Pico ───────────────────────────
export interface WaitlistEntry {
  id: string
  tenant_id: string
  court_id?: string | null
  court?: Court
  date: string        // "YYYY-MM-DD"
  time_slot: string   // "20:00"
  customer_name: string
  customer_phone: string
  status: 'WAITING' | 'NOTIFIED' | 'EXPIRED' | 'CLAIMED'
  priority_expires_at?: string | null
  notified_at?: string | null
  created_at: string
}

// ─── Torneos y Cuadros Exprés (Fútbol y Pádel) ───────────────────────────────
export interface Tournament {
  id: string
  tenant_id: string
  name: string
  sport: string
  format: 'PLAYOFFS' | 'GROUPS_AND_PLAYOFFS'
  start_date: string
  end_date: string
  status: 'REGISTRATION' | 'IN_PROGRESS' | 'COMPLETED'
  created_at: string
  categories?: TournamentCategory[]
}

export interface TournamentCategory {
  id: string
  tournament_id: string
  name: string
  max_teams: number
  teams?: TournamentTeam[]
  matches?: TournamentMatch[]
}

export interface TournamentTeam {
  id: string
  category_id: string
  name: string
  player_1: string
  player_2?: string | null
  phone: string
  created_at: string
}

export interface TournamentMatch {
  id: string
  category_id: string
  round: 'GRUPO_A' | 'GRUPO_B' | 'CUARTOS' | 'SEMIFINAL' | 'FINAL' | string
  match_number: number
  team_a_id?: string | null
  team_b_id?: string | null
  team_a?: TournamentTeam | null
  team_b?: TournamentTeam | null
  score_team_a?: string | null
  score_team_b?: string | null
  winner_team_id?: string | null
  winner_team?: TournamentTeam | null
  court_name?: string | null
  scheduled_time?: string | null
  status: 'SCHEDULED' | 'PLAYING' | 'FINISHED'
}

// ─── Comandas de Cantina por QR de Cancha ───────────────────────────────────
export interface CourtOrderItem {
  id: string
  name: string
  quantity: number
  unit_price: number
  subtotal: number
}

export interface CourtOrder {
  id: string
  tenant_id: string
  court_id: string
  court_name: string
  customer_name: string
  customer_phone?: string
  status: 'PENDING' | 'PREPARING' | 'DELIVERED' | 'CANCELLED'
  items: CourtOrderItem[]
  total_ars: number
  notes?: string
  created_at: string
}

// ─── Reputación y No-Show de Jugadores ──────────────────────────────────────
export interface PlayerReputation {
  phone: string
  name: string
  total_bookings: number
  completed_bookings: number
  no_show_count: number
  score_percentage: number
  is_high_risk: boolean
}

// ─── Domótica e Iluminación IoT de Canchas ──────────────────────────────────
export interface CourtLightConfig {
  court_id: string
  court_name: string
  is_on: boolean
  is_auto_mode: boolean
  pre_turn_minutes: number
  post_turn_minutes: number
  relay_ip_or_id?: string
  last_state_change: string
}

// ─── Tipos de utilidad ────────────────────────────────────────────────────────

/** Slot de disponibilidad retornado por la RPC get_court_availability */
export interface AvailabilitySlot {
  slot_start: string
  slot_end: string
  is_available: boolean
  block_reason: string | null
}

/** Booking enriquecido para el calendario del admin */
export interface BookingWithDetails extends Booking {
  court: Court
  customer_profile?: Profile | null
}

/** Payload para crear una reserva nueva */
export interface CreateBookingPayload {
  tenant_id: string
  court_id: string
  court_name?: string
  customer_name: string
  customer_phone?: string
  customer_email?: string
  customer_profile_id?: string
  starts_at: string  // ISO timestamp
  total_amount_ars: number
  deposit_amount_ars: number
  origin: BookingOrigin
  internal_notes?: string
  customer_notes?: string
  price_rule_id?: string
  payment_method?: 'TRANSFER' | 'MERCADOPAGO'
}

/** Respuesta del Server Action de checkout */
export interface CheckoutResponse {
  success: boolean
  booking_id?: string
  mp_preference_id?: string
  mp_init_point?: string  // URL de redirección a MP
  total_amount_ars?: number
  deposit_amount_ars?: number
  lock_expires_at?: string
  payment_type?: 'TRANSFER' | 'MERCADOPAGO'
  bank_details?: {
    bank_name: string
    account_holder: string
    cbu: string
    alias: string
    cuit?: string
    whatsapp_phone?: string
  }
  error?: string
  error_code?: 'SLOT_UNAVAILABLE' | 'LOCK_FAILED' | 'MP_ERROR' | 'VALIDATION_ERROR' | 'CLUB_SUSPENDED_DUNNING' | 'CLUB_PENDING_ACTIVATION'
}

/** Notificación de webhook de Mercado Pago */
export interface MercadoPagoWebhookNotification {
  id: string
  live_mode: boolean
  type: string           // "payment"
  date_created: string
  application_id: string
  user_id: string
  version: number
  api_version: string
  action: string         // "payment.created" | "payment.updated"
  data: {
    id: string           // payment_id
  }
}

/** Pago de Mercado Pago (respuesta de la API /v1/payments/:id) */
export interface MercadoPagoPayment {
  id: number
  status: 'pending' | 'approved' | 'authorized' | 'in_process' | 'in_mediation' | 'rejected' | 'cancelled' | 'refunded' | 'charged_back'
  status_detail: string
  external_reference: string  // = booking.deposit_mp_external_ref
  transaction_amount: number
  date_approved: string | null
  payment_method_id: string
  payment_type_id: string
  payer: {
    email: string
    identification: { type: string; number: string }
  }
}
