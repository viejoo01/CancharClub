// src/types/notifications.ts
// ==============================================================================
// TIPOS PARA EL HISTORIAL DE NOTIFICACIONES Y ALERTAS DEL CLUB
// ==============================================================================

export type NotificationCategory = 'ALL' | 'BOOKINGS' | 'PAYMENTS' | 'ALERTS' | 'SYSTEM'

export type NotificationType =
  | 'BOOKING_CREATED'         // Turno reservado en el calendario (online o mostrador)
  | 'BOOKING_CONFIRMED'       // Turno confirmado con seña o pago
  | 'BOOKING_CANCELLED'       // Turno cancelado por el club o por el cliente
  | 'PAYMENT_RECEIVED'        // Pago registrado (Mercado Pago, transferencia bancaria, efectivo)
  | 'WEATHER_ALERT'           // Alerta climática / protocolo de lluvia enviado a jugadores
  | 'WAITLIST_NOTIFIED'       // Alerta enviada a lista de espera con prioridad de 10 minutos
  | 'REMINDER_SENT'           // Recordatorio de turno enviado
  | 'AUTODEBIT_ALERT'         // Alerta de cobro mensual o débito automático
  | 'CANTINA_ORDER'           // Pedido de cantina por QR
  | 'STOCK_ALERT'             // Alerta de stock crítico o bajo en cantina
  | 'SYSTEM_ALERT'            // Alerta general del sistema

export interface NotificationMetadata {
  booking_id?: string
  customer_name?: string
  customer_phone?: string
  customer_email?: string
  court_name?: string
  sport?: string
  amount_ars?: number
  payment_method?: string
  starts_at?: string
  booked_date?: string
  booked_time?: string
  reason?: string
  whatsapp_url?: string
  action_url?: string
  status_badge?: string
  waitlist_id?: string
  affected_count?: number
  credited_total_ars?: number
  [key: string]: unknown
}

export interface ClubNotification {
  id: string
  tenant_id: string
  type: NotificationType
  category: NotificationCategory
  title: string
  message: string
  created_at: string
  read: boolean
  read_at?: string | null
  metadata?: NotificationMetadata
}

export interface NotificationsStats {
  total: number
  unread: number
  bookingsCount: number
  paymentsCount: number
  alertsCount: number
  systemCount: number
}
