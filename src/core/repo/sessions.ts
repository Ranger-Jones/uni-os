import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { courseSessions } from '../db/schema'
import { notFound, parse } from '../errors'
import { dateStr, newId, nowIso, timeStr } from '../util'
import { get as getCourse } from './courses'

export type CourseSession = typeof courseSessions.$inferSelect
export const SESSION_KINDS = ['lecture', 'tutorial', 'lab', 'seminar', 'other'] as const

const base = z.object({
  courseId: z.string().min(1),
  kind: z.enum(SESSION_KINDS),
  weekday: z.number().int().min(1).max(7),
  startTime: timeStr,
  endTime: timeStr,
  location: z.string().nullish(),
  startDate: dateStr.nullish(),
  endDate: dateStr.nullish()
})
const endAfterStart = (v: { startTime?: string; endTime?: string }) => !v.startTime || !v.endTime || v.endTime > v.startTime
export const SessionInput = base.refine(endAfterStart, { message: 'end time must be after start time', path: ['endTime'] })
export type SessionInput = z.input<typeof SessionInput>
export const SessionPatch = base.partial()

const order = [asc(courseSessions.weekday), asc(courseSessions.startTime)]

export function listForCourse(db: Db, courseId: string): CourseSession[] {
  return db.select().from(courseSessions).where(eq(courseSessions.courseId, courseId)).orderBy(...order).all()
}

export function listAll(db: Db): CourseSession[] {
  return db.select().from(courseSessions).orderBy(...order).all()
}

export function get(db: Db, id: string): CourseSession {
  const row = db.select().from(courseSessions).where(eq(courseSessions.id, id)).get()
  if (!row) throw notFound('Session')
  return row
}

export function create(db: Db, input: SessionInput): CourseSession {
  const v = parse(SessionInput, input)
  getCourse(db, v.courseId)
  const t = nowIso()
  return db.insert(courseSessions).values({ id: newId(), ...v, createdAt: t, updatedAt: t }).returning().get()
}

export function update(db: Db, id: string, patch: z.input<typeof SessionPatch>): CourseSession {
  const v = parse(SessionPatch, patch)
  parse(SessionInput, { ...get(db, id), ...v })
  return db.update(courseSessions).set({ ...v, updatedAt: nowIso() }).where(eq(courseSessions.id, id)).returning().get()
}

export function remove(db: Db, id: string): void {
  db.delete(courseSessions).where(eq(courseSessions.id, id)).run()
}

/** Replace a course's weekly schedule in one transaction (used by the course dialog). */
export function replaceForCourse(db: Db, courseId: string, rows: Omit<SessionInput, 'courseId'>[]): CourseSession[] {
  const parsed = rows.map((r) => parse(SessionInput, { ...r, courseId }))
  getCourse(db, courseId)
  db.transaction((tx) => {
    tx.delete(courseSessions).where(eq(courseSessions.courseId, courseId)).run()
    const t = nowIso()
    for (const v of parsed) tx.insert(courseSessions).values({ id: newId(), ...v, createdAt: t, updatedAt: t }).run()
  })
  return listForCourse(db, courseId)
}
