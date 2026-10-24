import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import * as courses from '@core/repo/courses'
import * as semesters from '@core/repo/semesters'
import * as sessions from '@core/repo/sessions'
import { memDb } from '../helpers/db'

let db: Db
beforeEach(() => {
  db = memDb().db
})

const ws = { name: 'WS 26/27', startDate: '2026-10-01', endDate: '2027-03-31' }
const ss = { name: 'SS 26', startDate: '2026-04-01', endDate: '2026-09-30' }

test('semesters: create, list sorted by start date desc, update, remove', () => {
  const a = semesters.create(db, ss)
  const b = semesters.create(db, ws)
  expect(semesters.list(db).map((s) => s.id)).toEqual([b.id, a.id])
  expect(semesters.update(db, a.id, { name: 'Summer 26' }).name).toBe('Summer 26')
  semesters.remove(db, a.id)
  expect(semesters.list(db)).toHaveLength(1)
})

test('semesters: end before start is rejected', () => {
  expect(() => semesters.create(db, { ...ws, endDate: '2026-01-01' })).toThrow(/end/i)
})

test('semesters.current picks the semester containing today, else the latest', () => {
  const a = semesters.create(db, ss)
  const b = semesters.create(db, ws)
  expect(semesters.current(db, '2026-05-10')?.id).toBe(a.id)
  expect(semesters.current(db, '2026-11-10')?.id).toBe(b.id)
  expect(semesters.current(db, '2030-01-01')?.id).toBe(b.id)
  expect(semesters.current(memDb().db, '2026-01-01')).toBeNull()
})

test('courses: create with defaults, list by semester sorted by name, get, update, remove', () => {
  const s = semesters.create(db, ws)
  const c1 = courses.create(db, { semesterId: s.id, name: 'Lineare Algebra', ects: 9 })
  courses.create(db, { semesterId: s.id, name: 'Analysis', ects: 9, color: 'red', icon: '📐' })
  expect(c1).toMatchObject({ gradingMode: 'graded', color: 'blue', archived: false })
  expect(courses.list(db, { semesterId: s.id }).map((c) => c.name)).toEqual(['Analysis', 'Lineare Algebra'])
  expect(courses.update(db, c1.id, { archived: true }).archived).toBe(true)
  expect(courses.list(db, { semesterId: s.id })).toHaveLength(1)
  expect(courses.list(db, { semesterId: s.id, includeArchived: true })).toHaveLength(2)
  courses.remove(db, c1.id)
  expect(() => courses.get(db, c1.id)).toThrow(/not found/i)
})

test('courses: negative ECTS and out-of-range target grade are rejected', () => {
  const s = semesters.create(db, ws)
  expect(() => courses.create(db, { semesterId: s.id, name: 'X', ects: -1 })).toThrow()
  expect(() => courses.create(db, { semesterId: s.id, name: 'X', ects: 5, targetGrade: 0.7 })).toThrow()
  expect(() => courses.create(db, { semesterId: 'nope', name: 'X', ects: 5 })).toThrow(/semester not found/i)
})

test('sessions: create, list for course sorted by weekday/time, end must be after start', () => {
  const s = semesters.create(db, ws)
  const c = courses.create(db, { semesterId: s.id, name: 'Analysis', ects: 9 })
  sessions.create(db, { courseId: c.id, kind: 'tutorial', weekday: 3, startTime: '14:00', endTime: '16:00' })
  sessions.create(db, { courseId: c.id, kind: 'lecture', weekday: 1, startTime: '10:00', endTime: '12:00', location: 'H1' })
  expect(sessions.listForCourse(db, c.id).map((x) => x.weekday)).toEqual([1, 3])
  expect(sessions.listAll(db)).toHaveLength(2)
  expect(() =>
    sessions.create(db, { courseId: c.id, kind: 'lecture', weekday: 1, startTime: '12:00', endTime: '10:00' })
  ).toThrow(/end/i)
  expect(() =>
    sessions.create(db, { courseId: c.id, kind: 'lecture', weekday: 8, startTime: '10:00', endTime: '11:00' })
  ).toThrow()
})

test('sessions.replaceForCourse swaps the whole schedule atomically', () => {
  const s = semesters.create(db, ws)
  const c = courses.create(db, { semesterId: s.id, name: 'Analysis', ects: 9 })
  sessions.create(db, { courseId: c.id, kind: 'lecture', weekday: 1, startTime: '10:00', endTime: '12:00' })
  const out = sessions.replaceForCourse(db, c.id, [
    { kind: 'lecture', weekday: 2, startTime: '08:00', endTime: '10:00' },
    { kind: 'tutorial', weekday: 4, startTime: '12:00', endTime: '14:00' }
  ])
  expect(out.map((x) => x.weekday)).toEqual([2, 4])
  // invalid row → nothing changes
  expect(() =>
    sessions.replaceForCourse(db, c.id, [{ kind: 'lecture', weekday: 1, startTime: '10:00', endTime: '09:00' }])
  ).toThrow()
  expect(sessions.listForCourse(db, c.id)).toHaveLength(2)
})
