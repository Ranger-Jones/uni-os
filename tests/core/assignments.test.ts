import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import * as assignments from '@core/repo/assignments'
import * as events from '@core/repo/events'
import * as search from '@core/repo/search'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'

let db: Db
let courseId: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db).id
})

test('assignments: create with defaults, list sorted by due date with undated last', () => {
  assignments.create(db, { courseId, title: 'Undated' })
  assignments.create(db, { courseId, title: 'Later', dueAt: '2026-11-10T23:59' })
  const a = assignments.create(db, { courseId, title: 'Sooner', dueAt: '2026-11-03' })
  expect(a).toMatchObject({ status: 'todo', priority: 'medium' })
  expect(assignments.list(db, { courseId }).map((x) => x.title)).toEqual(['Sooner', 'Later', 'Undated'])
})

test('assignments: filter by status and due range', () => {
  assignments.create(db, { courseId, title: 'A', dueAt: '2026-11-01T10:00' })
  const b = assignments.create(db, { courseId, title: 'B', dueAt: '2026-11-05T10:00' })
  assignments.create(db, { courseId, title: 'C', dueAt: '2026-11-20T10:00' })
  assignments.update(db, b.id, { status: 'done' })
  expect(assignments.list(db, { status: ['todo', 'in_progress'] }).map((x) => x.title)).toEqual(['A', 'C'])
  expect(assignments.list(db, { dueFrom: '2026-11-02', dueTo: '2026-11-19' }).map((x) => x.title)).toEqual(['B'])
  expect(assignments.list(db, { dueTo: '2026-11-01' }).map((x) => x.title)).toEqual(['A'])
})

test('assignments: overdue only when open and due before now', () => {
  const now = '2026-11-02T12:00'
  expect(assignments.isOverdue({ dueAt: '2026-11-01T23:59', status: 'todo' }, now)).toBe(true)
  expect(assignments.isOverdue({ dueAt: '2026-11-02', status: 'todo' }, now)).toBe(false) // all-day due today
  expect(assignments.isOverdue({ dueAt: '2026-11-01', status: 'done' }, now)).toBe(false)
  expect(assignments.isOverdue({ dueAt: null, status: 'todo' }, now)).toBe(false)
})

test('assignments: invalid input and unknown course are rejected; search index follows', () => {
  expect(() => assignments.create(db, { courseId, title: ' ' })).toThrow()
  expect(() => assignments.create(db, { courseId, title: 'x', dueAt: 'tomorrow' })).toThrow()
  expect(() => assignments.create(db, { courseId: 'nope', title: 'x' })).toThrow(/course not found/i)
  const a = assignments.create(db, { courseId, title: 'Übungsblatt 3', description: 'Integralrechnung' })
  expect(search.query(db, 'integral')[0]).toMatchObject({ entityType: 'assignment', entityId: a.id })
  assignments.remove(db, a.id)
  expect(search.query(db, 'integral')).toHaveLength(0)
})

test('events: list by overlapping range, all-day and multi-day', () => {
  events.create(db, { courseId, title: 'Klausur', kind: 'exam', startsAt: '2027-02-10T09:00', endsAt: '2027-02-10T11:00' })
  events.create(db, { courseId: null, title: 'Exkursion', kind: 'other', startsAt: '2027-02-08', endsAt: '2027-02-12', allDay: true })
  events.create(db, { courseId: null, title: 'Später', kind: 'appointment', startsAt: '2027-03-01T10:00' })
  expect(events.list(db, { from: '2027-02-10', to: '2027-02-10' }).map((e) => e.title)).toEqual(['Exkursion', 'Klausur'])
  expect(events.list(db, { from: '2027-02-11', to: '2027-02-28' }).map((e) => e.title)).toEqual(['Exkursion'])
  expect(events.list(db, { from: '2027-01-01', to: '2027-12-31', courseId }).map((e) => e.title)).toEqual(['Klausur'])
  expect(() => events.create(db, { title: 'x', kind: 'exam', startsAt: '2027-02-10T11:00', endsAt: '2027-02-10T09:00' })).toThrow(/end/i)
})
