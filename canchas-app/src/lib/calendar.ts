/**
 * CancharClub - Utilidad de sincronización de Calendarios (Google Calendar y .ics)
 */

export interface CalendarEventParams {
  title: string
  description?: string
  location?: string
  date: string // YYYY-MM-DD
  startTime: string // HH:mm
  endTime?: string // HH:mm (default +90 min)
  rrule?: string // Ej: 'FREQ=WEEKLY;BYDAY=MO' para turnos fijos
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

function formatToCalendarDate(dateStr: string, timeStr: string): string {
  // dateStr: YYYY-MM-DD, timeStr: HH:mm
  const [year, month, day] = dateStr.split('-').map(Number)
  const [hours, minutes] = timeStr.split(':').map(Number)

  return `${year}${pad(month)}${pad(day)}T${pad(hours)}${pad(minutes)}00`
}

function calculateEndTime(startTime: string): string {
  const [h, m] = startTime.split(':').map(Number)
  const totalMinutes = h * 60 + m + 90 // 90 min por defecto
  const endH = Math.floor(totalMinutes / 60) % 24
  const endM = totalMinutes % 60
  return `${pad(endH)}:${pad(endM)}`
}

/**
 * Genera el enlace directo para agregar el turno a Google Calendar con un solo clic
 */
export function buildGoogleCalendarLink(params: CalendarEventParams): string {
  const end = params.endTime || calculateEndTime(params.startTime)
  const startDt = formatToCalendarDate(params.date, params.startTime)
  const endDt = formatToCalendarDate(params.date, end)

  const url = new URL('https://calendar.google.com/calendar/render')
  url.searchParams.set('action', 'TEMPLATE')
  url.searchParams.set('text', params.title)
  url.searchParams.set('dates', `${startDt}/${endDt}`)
  
  if (params.description) {
    url.searchParams.set('details', params.description)
  }
  if (params.location) {
    url.searchParams.set('location', params.location)
  }
  if (params.rrule) {
    url.searchParams.set('recur', `RRULE:${params.rrule}`)
  }

  return url.toString()
}

/**
 * Genera el contenido de un archivo .ics (iCalendar) compatible con Apple Calendar, Outlook y Google Calendar
 */
export function generateIcsContent(params: CalendarEventParams): string {
  const end = params.endTime || calculateEndTime(params.startTime)
  const startDt = formatToCalendarDate(params.date, params.startTime)
  const endDt = formatToCalendarDate(params.date, end)
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}@cancharclub.com`
  const nowDt = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CancharClub//Gestión Deportiva//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${nowDt}`,
    `DTSTART:${startDt}`,
    `DTEND:${endDt}`,
    `SUMMARY:${params.title}`,
    `DESCRIPTION:${(params.description || '').replace(/\n/g, '\\n')}`,
    `LOCATION:${params.location || 'Predio Deportivo'}`,
    params.rrule ? `RRULE:${params.rrule}` : '',
    'STATUS:CONFIRMED',
    'END:VEVENT',
    'END:VCALENDAR'
  ].filter(Boolean)

  return lines.join('\r\n')
}

/**
 * Descarga en el navegador un archivo .ics
 */
export function downloadIcs(params: CalendarEventParams, filename = 'reserva-cancharclub.ics') {
  if (typeof window === 'undefined') return
  const content = generateIcsContent(params)
  const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' })
  const link = document.createElement('a')
  link.href = window.URL.createObjectURL(blob)
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}
