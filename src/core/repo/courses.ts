import { and, asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { courses, semesters } from '../db/schema'
import { notFound, parse } from '../errors'
import { newId, nowIso } from '../util'

export type Course = typeof courses.$inferSelect

export const COURSE_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const

export const CourseInput = z.object({
  semesterId: z.string().min(1),
  name: z.string().trim().min(1),
  code: z.string().trim().nullish(),
  ects: z.number().min(0).max(60),
  color: z.enum(COURSE_COLORS).optional(),
  icon: z.string().nullish(),
  lecturer: z.string().nullish(),
  location: z.string().nullish(),
  gradingMode: z.enum(['graded', 'pass_fail']).optional(),
  targetGrade: z.number().min(1).max(4).nullish(),
  archived: z.boolean().optional(),
  overview: z.string().nullish()
})
export type CourseInput = z.input<typeof CourseInput>
export const CoursePatch = CourseInput.partial()

export function list(db: Db, opts: { semesterId?: string; includeArchived?: boolean } = {}): Course[] {
  const where = and(
    opts.semesterId ? eq(courses.semesterId, opts.semesterId) : undefined,
    opts.includeArchived ? undefined : eq(courses.archived, false)
  )
  return db.select().from(courses).where(where).orderBy(asc(courses.name)).all()
}

export function get(db: Db, id: string): Course {
  const row = db.select().from(courses).where(eq(courses.id, id)).get()
  if (!row) throw notFound('Course')
  return row
}

function assertSemester(db: Db, id: string): void {
  if (!db.select({ id: semesters.id }).from(semesters).where(eq(semesters.id, id)).get()) throw notFound('Semester')
}

export function create(db: Db, input: CourseInput): Course {
  const v = parse(CourseInput, input)
  assertSemester(db, v.semesterId)
  const t = nowIso()
  return db.insert(courses).values({ id: newId(), ...v, createdAt: t, updatedAt: t }).returning().get()
}

export function update(db: Db, id: string, patch: z.input<typeof CoursePatch>): Course {
  const v = parse(CoursePatch, patch)
  get(db, id)
  if (v.semesterId) assertSemester(db, v.semesterId)
  return db.update(courses).set({ ...v, updatedAt: nowIso() }).where(eq(courses.id, id)).returning().get()
}

export function remove(db: Db, id: string): void {
  db.delete(courses).where(eq(courses.id, id)).run()
}
