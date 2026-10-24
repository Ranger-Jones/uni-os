import { expect, test } from 'vitest'
import { buildSystemPrompt } from '@core/llm/systemPrompt'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'

test('system prompt names date, semester, courses and scope', () => {
  const { db } = memDb()
  const c = seedCourse(db, 'Analysis I')
  const p = buildSystemPrompt(db, { now: new Date('2026-10-24T10:00:00'), courseId: c.id })
  expect(p).toContain('Saturday, 2026-10-24')
  expect(p).toContain('WS 26/27')
  expect(p).toContain(`- Analysis I, 5 ECTS, graded, id ${c.id}`)
  expect(p).toContain('opened this chat from the course "Analysis I"')
  expect(buildSystemPrompt(memDb().db, { now: new Date() })).toContain('No semester')
})
