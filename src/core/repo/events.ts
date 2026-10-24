import { and, asc, eq, gte, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { events } from '../db/schema'
import { notFound, parse } from '../errors'
import { localDateTime, newId, nowIso } from '../util'
import { get as getCourse } from './courses'

export type CalendarEvent = typeof events.$inferSelect
export const EVENT_KINDS = ['exam', 'deadline', 'appointment', 'other'] as const

const base = z.object({
  courseId: z.string().nullish(),
  title: z.string().trim().min(1),
  kind: z.enum(EVENT_KINDS),
  startsAt: localDateTime,
  endsAt: localDateTime.nullish(),
  allDay: z.boolean().optional(),
  location: z.string().nullish(),
  description: z.string().nullish()
})
const ordered = (v: { startsAt?: string; endsAt?: string | null }) => !v.startsAt || !v.endsAt || v.endsAt >= v.startsAt
export const EventInput = base.refine(ordered, { message: 'end must not be before start', path: ['endsAt'] })
export type EventInput = z.input<typeof EventInput>
export const EventPatch = base.partial()

/** Events overlapping the inclusive date range [from, to]. */
export function list(db: Db, f: { from: string; to: string; courseId?: string }): CalendarEvent[] {
  return db
    .select()
    .from(events)
    .where(
      and(
        lte(events.startsAt, `${f.to}T23:59`),
        gte(sql`coalesce(${events.endsAt}, ${events.startsAt})`, f.from),
        f.courseId ? eq(events.courseId, f.courseId) : undefined
      )
    )
    .orderBy(asc(events.startsAt))
    .all()
}

export function get(db: Db, id: string): CalendarEvent {
  const row = db.select().from(events).where(eq(events.id, id)).get()
  if (!row) throw notFound('Event')
  return row
}

export function create(db: Db, input: EventInput): CalendarEvent {
  const v = parse(EventInput, input)
  if (v.courseId) getCourse(db, v.courseId)
  const t = nowIso()
  return db.insert(events).values({ id: newId(), ...v, createdAt: t, updatedAt: t }).returning().get()
}

export function update(db: Db, id: string, patch: z.input<typeof EventPatch>): CalendarEvent {
  const v = parse(EventPatch, patch)
  parse(EventInput, { ...get(db, id), ...v })
  if (v.courseId) getCourse(db, v.courseId)
  return db.update(events).set({ ...v, updatedAt: nowIso() }).where(eq(events.id, id)).returning().get()
}

export function remove(db: Db, id: string): void {
  db.delete(events).where(eq(events.id, id)).run()
}
