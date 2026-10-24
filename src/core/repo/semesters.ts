import { desc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { semesters } from '../db/schema'
import { notFound, parse } from '../errors'
import { dateStr, localDate, newId, nowIso } from '../util'

export type Semester = typeof semesters.$inferSelect

const base = z.object({ name: z.string().trim().min(1), startDate: dateStr, endDate: dateStr, sortOrder: z.number().optional() })
const ordered = <T extends { startDate?: string; endDate?: string }>(v: T) => !v.startDate || !v.endDate || v.endDate > v.startDate
export const SemesterInput = base.refine(ordered, { message: 'end date must be after start date', path: ['endDate'] })
export type SemesterInput = z.input<typeof SemesterInput>
export const SemesterPatch = base.partial()

export function list(db: Db): Semester[] {
  return db.select().from(semesters).orderBy(desc(semesters.startDate)).all()
}

export function get(db: Db, id: string): Semester {
  const row = db.select().from(semesters).where(eq(semesters.id, id)).get()
  if (!row) throw notFound('Semester')
  return row
}

export function create(db: Db, input: SemesterInput): Semester {
  const v = parse(SemesterInput, input)
  const t = nowIso()
  return db.insert(semesters).values({ id: newId(), ...v, createdAt: t, updatedAt: t }).returning().get()
}

export function update(db: Db, id: string, patch: z.input<typeof SemesterPatch>): Semester {
  const v = parse(SemesterPatch, patch)
  const merged = { ...get(db, id), ...v }
  parse(SemesterInput, merged)
  return db.update(semesters).set({ ...v, updatedAt: nowIso() }).where(eq(semesters.id, id)).returning().get()
}

export function remove(db: Db, id: string): void {
  db.delete(semesters).where(eq(semesters.id, id)).run()
}

/** The semester containing `today`, otherwise the one that starts latest. */
export function current(db: Db, today: string = localDate()): Semester | null {
  const all = list(db)
  return all.find((s) => s.startDate <= today && today <= s.endDate) ?? all[0] ?? null
}
