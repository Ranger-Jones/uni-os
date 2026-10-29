import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { assignments } from '../db/schema'
import { notFound, parse } from '../errors'
import { localDateTime, newId, nowIso } from '../util'
import { get as getCourse } from './courses'
import * as search from './search'

export type Assignment = typeof assignments.$inferSelect
export const ASSIGNMENT_STATUS = ['todo', 'in_progress', 'done', 'submitted'] as const
export type AssignmentStatus = (typeof ASSIGNMENT_STATUS)[number]
export const OPEN_STATUS: AssignmentStatus[] = ['todo', 'in_progress']

export const AssignmentInput = z.object({
  courseId: z.string().min(1),
  title: z.string().trim().min(1),
  description: z.string().nullish(),
  dueAt: localDateTime.nullish(),
  status: z.enum(ASSIGNMENT_STATUS).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  gradeComponentId: z.string().nullish()
})
export type AssignmentInput = z.input<typeof AssignmentInput>
export const AssignmentPatch = AssignmentInput.partial()

export interface AssignmentFilter {
  courseId?: string
  status?: AssignmentStatus[]
  dueFrom?: string
  dueTo?: string
}

function reindex(db: Db, a: Assignment): void {
  search.index(db, { entityType: 'assignment', entityId: a.id, courseId: a.courseId, title: a.title, body: a.description ?? '' })
}

export function list(db: Db, f: AssignmentFilter = {}): Assignment[] {
  const where = and(
    f.courseId ? eq(assignments.courseId, f.courseId) : undefined,
    f.status?.length ? inArray(assignments.status, f.status) : undefined,
    f.dueFrom ? gte(assignments.dueAt, f.dueFrom) : undefined,
    f.dueTo ? lte(assignments.dueAt, `${f.dueTo}T23:59`) : undefined
  )
  return db
    .select()
    .from(assignments)
    .where(where)
    .orderBy(sql`${assignments.dueAt} IS NULL`, asc(assignments.dueAt), asc(assignments.createdAt))
    .all()
}

export function get(db: Db, id: string): Assignment {
  const row = db.select().from(assignments).where(eq(assignments.id, id)).get()
  if (!row) throw notFound('Assignment')
  return row
}

export function create(db: Db, input: AssignmentInput): Assignment {
  const v = parse(AssignmentInput, input)
  getCourse(db, v.courseId)
  const t = nowIso()
  const row = db.insert(assignments).values({ id: newId(), ...v, createdAt: t, updatedAt: t }).returning().get()
  reindex(db, row)
  return row
}

export function update(db: Db, id: string, patch: z.input<typeof AssignmentPatch>): Assignment {
  const v = parse(AssignmentPatch, patch)
  get(db, id)
  if (v.courseId) getCourse(db, v.courseId)
  const row = db.update(assignments).set({ ...v, updatedAt: nowIso() }).where(eq(assignments.id, id)).returning().get()
  reindex(db, row)
  return row
}

export function remove(db: Db, id: string): void {
  db.delete(assignments).where(eq(assignments.id, id)).run()
}

/** Open and due before `now` (local YYYY-MM-DDTHH:MM). Date-only deadlines count until the end of that day. */
export function isOverdue(a: Pick<Assignment, 'dueAt' | 'status'>, now: string): boolean {
  if (!a.dueAt || !OPEN_STATUS.includes(a.status)) return false
  const due = a.dueAt.length === 10 ? `${a.dueAt}T23:59` : a.dueAt
  return due < now
}

/** Rebuild the search entry of a row written by sync. */
export function reindexById(db: Db, id: string): void {
  const row = db.select().from(assignments).where(eq(assignments.id, id)).get()
  if (row) reindex(db, row)
}
