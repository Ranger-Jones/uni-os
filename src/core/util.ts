import { z } from 'zod'

export const newId = (): string => crypto.randomUUID()
export const nowIso = (): string => new Date().toISOString()

export const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'expected YYYY-MM-DD')
export const timeStr = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'expected HH:MM')
export const isoDateTime = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'expected ISO date-time')

/** Local calendar date (YYYY-MM-DD) of a Date. */
export function localDate(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

/** Local date or local date-time without timezone: YYYY-MM-DD or YYYY-MM-DDTHH:MM. */
export const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}(T([01]\d|2[0-3]):[0-5]\d)?$/, 'expected YYYY-MM-DD or YYYY-MM-DDTHH:MM')

/** Current local time as YYYY-MM-DDTHH:MM. */
export function localNow(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${localDate(d)}T${p(d.getHours())}:${p(d.getMinutes())}`
}
