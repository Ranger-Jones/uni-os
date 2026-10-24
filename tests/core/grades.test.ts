import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { courseGrade, gpa, requiredAverage, requiredForCourse, truncate1, validateGrade } from '@core/domain/grades'
import * as grades from '@core/repo/grades'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'

test('course grade is the weighted mean of graded components', () => {
  expect(courseGrade([{ weight: 70, grade: 1.7 }, { weight: 30, grade: 2.3 }]).grade).toBeCloseTo(1.88)
  expect(courseGrade([{ weight: 70, grade: 1.7 }, { weight: 30, grade: null }])).toMatchObject({ grade: 1.7, provisional: true })
  expect(courseGrade([]).grade).toBeNull()
  expect(courseGrade([{ weight: 0, grade: null, passed: true }, { weight: 100, grade: 2.0 }])).toMatchObject({ grade: 2.0, provisional: false })
})

test('GPA is ECTS-weighted and ignores pass/fail, ungraded and failed courses', () => {
  expect(
    gpa([
      { ects: 5, gradingMode: 'graded', grade: 1.0 },
      { ects: 10, gradingMode: 'graded', grade: 2.5 },
      { ects: 5, gradingMode: 'pass_fail', grade: null }
    ])
  ).toMatchObject({ gpa: 2.0, ectsGraded: 15 })
  expect(gpa([{ ects: 5, gradingMode: 'graded', grade: 5.0 }]).gpa).toBeNull()
  expect(gpa([]).gpa).toBeNull()
})

test('truncate to one decimal is float-safe', () => {
  expect(truncate1(1.34)).toBe(1.3)
  expect(truncate1(2.0)).toBe(2.0)
  expect(truncate1(1.7000000000000002)).toBe(1.7)
  expect(truncate1(1.6999999999999)).toBe(1.7)
  expect(truncate1(2.39)).toBe(2.3)
})

test('required average on remaining ECTS', () => {
  expect(requiredAverage(2.0, [{ ects: 30, grade: 2.5 }], 30)).toMatchObject({ required: 1.5, status: 'reachable' })
  expect(requiredAverage(1.0, [{ ects: 30, grade: 2.5 }], 30).status).toBe('unreachable')
  expect(requiredAverage(3.0, [{ ects: 30, grade: 1.0 }], 30).status).toBe('safe')
  expect(requiredAverage(2.0, [{ ects: 30, grade: 1.5 }], 0)).toMatchObject({ required: null, status: 'safe' })
  expect(requiredAverage(1.0, [{ ects: 30, grade: 1.5 }], 0)).toMatchObject({ required: null, status: 'unreachable' })
})

test('required grade on the remaining components of a course', () => {
  expect(requiredForCourse(2.0, [{ weight: 50, grade: 2.5 }, { weight: 50, grade: null }])).toMatchObject({ required: 1.5, status: 'reachable' })
  expect(requiredForCourse(1.0, [{ weight: 50, grade: 2.5 }, { weight: 50, grade: null }]).status).toBe('unreachable')
  expect(requiredForCourse(3.0, [{ weight: 100, grade: 2.0 }]).required).toBeNull()
})

test('grade validation', () => {
  expect(() => validateGrade(6.0)).toThrow()
  expect(() => validateGrade(0.7)).toThrow()
  expect(validateGrade(1.3)).toBe(1.3)
})

let db: Db
beforeEach(() => {
  db = memDb().db
})

test('components CRUD with validation', () => {
  const c = seedCourse(db)
  const exam = grades.createComponent(db, { courseId: c.id, name: 'Klausur', weight: 70 })
  grades.createComponent(db, { courseId: c.id, name: 'Hausarbeit', weight: 30, grade: 2.3 })
  expect(grades.listComponents(db, c.id).map((x) => x.name)).toEqual(['Klausur', 'Hausarbeit'])
  expect(grades.updateComponent(db, exam.id, { grade: 1.7 }).grade).toBe(1.7)
  expect(() => grades.updateComponent(db, exam.id, { grade: 6 })).toThrow()
  expect(() => grades.createComponent(db, { courseId: c.id, name: 'x', weight: -5 })).toThrow()
  expect(() => grades.createComponent(db, { courseId: 'nope', name: 'x', weight: 10 })).toThrow(/course not found/i)
  grades.removeComponent(db, exam.id)
  expect(grades.listComponents(db, c.id)).toHaveLength(1)
})

test('overview: per-course grades (truncated), GPA, earned ECTS', () => {
  const a = seedCourse(db, 'A', { ects: 10 })
  const b = seedCourse(db, 'B', { ects: 5 })
  const p = seedCourse(db, 'P', { ects: 5, gradingMode: 'pass_fail' })
  const empty = seedCourse(db, 'Empty', { ects: 5 })
  grades.createComponent(db, { courseId: a.id, name: 'Exam', weight: 70, grade: 1.7 })
  grades.createComponent(db, { courseId: a.id, name: 'Paper', weight: 30, grade: 2.3 })
  grades.createComponent(db, { courseId: b.id, name: 'Exam', weight: 100, grade: 3.0 })
  grades.createComponent(db, { courseId: p.id, name: 'Attendance', weight: 0, passed: true })
  const o = grades.overview(db, {})
  const row = (id: string) => o.courses.find((r) => r.course.id === id)!
  expect(row(a.id)).toMatchObject({ grade: 1.8, provisional: false, passed: true }) // 1.88 → 1.8
  expect(row(p.id)).toMatchObject({ grade: null, passed: true })
  expect(row(empty.id)).toMatchObject({ grade: null, passed: false })
  expect(o.gpa).toBeCloseTo((10 * 1.8 + 5 * 3.0) / 15)
  expect(o.ectsEarned).toBe(20)
  expect(o.ectsTotal).toBe(25)
  expect(o.remainingEcts).toBe(5)
})
