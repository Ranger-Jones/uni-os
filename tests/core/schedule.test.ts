import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { addDays, eachDay, expandSessions, weekdayOf } from '@core/domain/schedule'
import * as courses from '@core/repo/courses'
import * as sessions from '@core/repo/sessions'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'

test('date helpers', () => {
  expect(weekdayOf('2026-10-26')).toBe(1) // Monday
  expect(weekdayOf('2026-11-01')).toBe(7) // Sunday
  expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
  expect(addDays('2026-10-25', 1)).toBe('2026-10-26') // DST change in Europe
  expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02'])
})

test('expands weekly sessions within range and semester bounds', () => {
  const s = { id: 's1', courseId: 'c', kind: 'lecture' as const, weekday: 1, startTime: '10:00', endTime: '12:00', location: 'H1', startDate: null, endDate: null }
  const occ = expandSessions([{ ...s, boundsStart: '2026-10-12', boundsEnd: '2026-11-15' }], { from: '2026-10-01', to: '2026-11-30' })
  expect(occ.map((o) => o.date)).toEqual(['2026-10-12', '2026-10-19', '2026-10-26', '2026-11-02', '2026-11-09'])
  expect(occ[0]).toMatchObject({ sessionId: 's1', courseId: 'c', start: '10:00', end: '12:00', kind: 'lecture', location: 'H1' })
})

test('session-level dates override semester bounds; sunday on DST day keeps local time', () => {
  const s = { id: 's1', courseId: 'c', kind: 'tutorial' as const, weekday: 7, startTime: '09:00', endTime: '10:00', location: null, startDate: '2026-10-20', endDate: '2026-10-31' }
  const occ = expandSessions([{ ...s, boundsStart: '2026-10-01', boundsEnd: '2027-03-31' }], { from: '2026-10-01', to: '2026-12-31' })
  expect(occ).toEqual([expect.objectContaining({ date: '2026-10-25', start: '09:00' })])
})

let db: Db
beforeEach(() => {
  db = memDb().db
})

test('occurrences from the DB skip archived courses and are sorted by date and time', () => {
  const a = seedCourse(db, 'A')
  const b = seedCourse(db, 'B')
  const c = seedCourse(db, 'C')
  sessions.create(db, { courseId: a.id, kind: 'lecture', weekday: 1, startTime: '14:00', endTime: '16:00' })
  sessions.create(db, { courseId: b.id, kind: 'lecture', weekday: 1, startTime: '08:00', endTime: '10:00' })
  sessions.create(db, { courseId: c.id, kind: 'lecture', weekday: 1, startTime: '08:00', endTime: '10:00' })
  courses.update(db, c.id, { archived: true })
  const occ = sessions.occurrences(db, { from: '2026-10-26', to: '2026-10-26' })
  expect(occ.map((o) => o.courseId)).toEqual([b.id, a.id])
})
