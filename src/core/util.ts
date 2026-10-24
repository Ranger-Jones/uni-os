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
