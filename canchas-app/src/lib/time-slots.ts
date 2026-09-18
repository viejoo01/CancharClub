// src/lib/time-slots.ts
// ==============================================================================
// UTILIDADES PARA GENERACIÓN DE FRANJAS HORARIAS DINÁMICAS DEL CLUB
// ==============================================================================

export interface ClubScheduleConfig {
  opening_time: string // e.g. "10:00"
  closing_time: string // e.g. "23:00"
}

export const DEFAULT_CLUB_SCHEDULE: ClubScheduleConfig = {
  opening_time: '08:00',
  closing_time: '23:30',
}

/**
 * Convierte una hora en formato "HH:mm" a minutos desde las 00:00
 */
export function timeStringToMinutes(time: string): number {
  if (!time || !time.includes(':')) return 0
  const [h, m] = time.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

/**
 * Convierte minutos desde las 00:00 a string "HH:mm"
 */
export function minutesToTimeString(minutes: number): string {
  const normalized = ((minutes % (24 * 60)) + (24 * 60)) % (24 * 60)
  const h = Math.floor(normalized / 60).toString().padStart(2, '0')
  const m = (normalized % 60).toString().padStart(2, '0')
  return `${h}:${m}`
}

/**
 * Genera la lista de franjas horarias estrictamente entre opening_time y closing_time.
 * Si el club abre a las 10:00, el primer turno generado es 10:00 (ninguno antes).
 * Si el club cierra a las 23:00, ningún turno supera las 23:00.
 */
export function generateTimeSlots(
  openingTime: string = DEFAULT_CLUB_SCHEDULE.opening_time,
  closingTime: string = DEFAULT_CLUB_SCHEDULE.closing_time,
  stepMinutes: number = 30
): string[] {
  const startMins = timeStringToMinutes(openingTime)
  let endMins = timeStringToMinutes(closingTime)

  // Si el horario de cierre es menor al de apertura (ej: abre 10:00 y cierra 01:00 AM)
  if (endMins < startMins) {
    endMins += 24 * 60
  }

  const slots: string[] = []
  const step = Math.max(15, stepMinutes)

  for (let m = startMins; m <= endMins; m += step) {
    slots.push(minutesToTimeString(m))
  }

  return slots
}

/**
 * Verifica si una hora está dentro del rango operativo del club
 */
export function isTimeWithinSchedule(
  time: string,
  openingTime: string = DEFAULT_CLUB_SCHEDULE.opening_time,
  closingTime: string = DEFAULT_CLUB_SCHEDULE.closing_time
): boolean {
  const t = timeStringToMinutes(time)
  const start = timeStringToMinutes(openingTime)
  let end = timeStringToMinutes(closingTime)

  if (end < start) {
    end += 24 * 60
    return t >= start || t <= (end % (24 * 60))
  }

  return t >= start && t <= end
}

/**
 * Formatea el texto de atención para mostrar en badges o cabeceras (ej: "10:00 a 23:00 hs")
 */
export function formatScheduleHours(
  openingTime?: string,
  closingTime?: string
): string {
  const op = openingTime || DEFAULT_CLUB_SCHEDULE.opening_time
  const cl = closingTime || DEFAULT_CLUB_SCHEDULE.closing_time
  return `${op} a ${cl} hs`
}
