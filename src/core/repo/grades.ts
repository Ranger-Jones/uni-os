import { asc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { gradeComponents } from '../db/schema'
import { courseGrade, gpa, PASS_LIMIT, truncate1 } from '../domain/grades'
import { notFound, parse } from '../errors'
import { dateStr, newId, nowIso } from '../util'
import { type Course, get as getCourse, list as listCourses } from './courses'

export type GradeComponent = typeof gradeComponents.$inferSelect

const grade = z.number().min(1, 'grade must be between 1.0 and 5.0').max(5, 'grade must be between 1.0 and 5.0')
export const ComponentInput = z.object({
  courseId: z.string().min(1),
  name: z.string().trim().min(1),
  weight: z.number().min(0).max(100),
  grade: grade.nullish(),
  passed: z.boolean().nullish(),
  date: dateStr.nullish()
})
export type ComponentInput = z.input<typeof ComponentInput>
export const ComponentPatch = ComponentInput.omit({ courseId: true }).partial()

export function listComponents(db: Db, courseId: string): GradeComponent[] {
  return db.select().from(gradeComponents).where(eq(gradeComponents.courseId, courseId)).orderBy(asc(gradeComponents.createdAt)).all()
}

export function getComponent(db: Db, id: string): GradeComponent {
  const row = db.select().from(gradeComponents).where(eq(gradeComponents.id, id)).get()
  if (!row) throw notFound('Grade component')
  return row
}

export function createComponent(db: Db, input: ComponentInput): GradeComponent {
  const v = parse(ComponentInput, input)
  getCourse(db, v.courseId)
  const t = nowIso()
  return db.insert(gradeComponents).values({ id: newId(), ...v, createdAt: t, updatedAt: t }).returning().get()
}

export function updateComponent(db: Db, id: string, patch: z.input<typeof ComponentPatch>): GradeComponent {
  const v = parse(ComponentPatch, patch)
  getComponent(db, id)
  return db.update(gradeComponents).set({ ...v, updatedAt: nowIso() }).where(eq(gradeComponents.id, id)).returning().get()
}

export function removeComponent(db: Db, id: string): void {
  db.delete(gradeComponents).where(eq(gradeComponents.id, id)).run()
}

export interface CourseGradeRow {
  course: Course
  components: GradeComponent[]
  /** Truncated to one decimal; null when nothing is graded (or pass/fail course). */
  grade: number | null
  rawGrade: number | null
  provisional: boolean
  passed: boolean
}

export function summarize(course: Course, components: GradeComponent[]): CourseGradeRow {
  if (course.gradingMode === 'pass_fail') {
    const passed = components.length > 0 && components.every((c) => c.passed === true || (c.grade !== null && c.grade <= PASS_LIMIT))
    return { course, components, grade: null, rawGrade: null, provisional: !passed && components.some((c) => c.passed == null && c.grade == null), passed }
  }
  const r = courseGrade(components)
  const g = r.grade === null ? null : truncate1(r.grade)
  return { course, components, grade: g, rawGrade: r.grade, provisional: r.provisional, passed: g !== null && !r.provisional && g <= PASS_LIMIT }
}

export function overview(db: Db, opts: { semesterId?: string }) {
  const courses = listCourses(db, { semesterId: opts.semesterId, includeArchived: true })
  const comps = courses.length
    ? db.select().from(gradeComponents).where(inArray(gradeComponents.courseId, courses.map((c) => c.id))).orderBy(asc(gradeComponents.createdAt)).all()
    : []
  const rows = courses.map((c) => summarize(c, comps.filter((x) => x.courseId === c.id)))
  const finals = rows.map((r) => ({ ects: r.course.ects, gradingMode: r.course.gradingMode, grade: r.provisional ? null : r.grade }))
  const all = rows.map((r) => ({ ects: r.course.ects, gradingMode: r.course.gradingMode, grade: r.grade }))
  const ectsEarned = rows.filter((r) => r.passed).reduce((s, r) => s + r.course.ects, 0)
  const ectsTotal = rows.reduce((s, r) => s + r.course.ects, 0)
  return {
    courses: rows,
    gpa: gpa(finals).gpa,
    /** Includes provisional course grades — what the GPA would be if nothing changed. */
    provisionalGpa: gpa(all).gpa,
    ectsEarned,
    ectsTotal,
    remainingEcts: rows.filter((r) => !r.passed && r.course.gradingMode === 'graded').reduce((s, r) => s + r.course.ects, 0)
  }
}

export type GradeOverview = ReturnType<typeof overview>
