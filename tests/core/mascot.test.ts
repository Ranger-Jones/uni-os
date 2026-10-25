import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { ANIMALS, mascotPersona } from '@core/domain/mascot'
import { describeView } from '@core/llm/viewContext'
import * as pages from '@core/repo/pages'
import * as tests from '@core/repo/tests'
import { defaultSettings, readSettings } from '@core/settings'
import { memDb } from '../helpers/db'
import { para, seedCourse } from '../helpers/fixtures'

let db: Db
let courseId: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db, 'Virtual Reality').id
})

test('mascot settings: dancing monkey by default; partial settings files keep the other defaults', () => {
  const m = defaultSettings().mascot
  expect(m).toMatchObject({ enabled: true, animal: 'monkey', dance: 'always', size: 'medium', personality: 'friendly', provider: 'default' })
  expect(m.name).toBeTruthy()
  const f = join(mkdtempSync(join(tmpdir(), 'unios-set-')), 'settings.json')
  writeFileSync(f, JSON.stringify({ mascot: { animal: 'panda' } }))
  expect(readSettings(f).mascot).toEqual({ ...m, animal: 'panda' })
  expect(ANIMALS.map((a) => a.id)).toContain('monkey')
  expect(new Set(ANIMALS.map((a) => a.id)).size).toBe(ANIMALS.length)
})

test('persona: name, animal and tone go into the prompt; answers stay short', () => {
  const p = mascotPersona({ ...defaultSettings().mascot, name: 'Bobo', animal: 'monkey', personality: 'cheeky' })
  expect(p).toMatch(/Bobo/)
  expect(p).toMatch(/monkey/i)
  expect(p).toMatch(/cheeky|playful/i)
  expect(p).toMatch(/short/i)
  expect(mascotPersona({ ...defaultSettings().mascot, personality: 'factual' })).toMatch(/factual|matter-of-fact/i)
})

test('view of a note page includes its title, course and content', async () => {
  const p = pages.create(db, { courseId, title: 'Scene Graphs' })
  pages.updateContent(db, p.id, [para('Each node defines a transformation in its parent coordinate system.')])
  const v = await describeView(db, { path: `/pages/${p.id}`, pageId: p.id })
  expect(v).toMatch(/note page "Scene Graphs"/)
  expect(v).toContain(p.id)
  expect(v).toMatch(/Virtual Reality/)
  expect(v).toContain('Each node defines a transformation')
})

test('long pages are cut, so the prompt stays small', async () => {
  const p = pages.create(db, { courseId, title: 'Long' })
  pages.updateContent(db, p.id, Array.from({ length: 800 }, (_, i) => para(`Paragraph ${i} with some text to make it long enough.`)))
  const v = await describeView(db, { path: `/pages/${p.id}`, pageId: p.id })
  expect(v.length).toBeLessThan(16_000)
  expect(v).toMatch(/truncated.*read_page/i)
})

test('view of a course tab and of an open quiz', async () => {
  expect(await describeView(db, { path: `/courses/${courseId}`, courseId, tab: 'assignments' })).toMatch(/course "Virtual Reality".*assignments/is)
  const t = tests.create(db, { courseId, kind: 'quiz', title: 'Lecture 2 quiz', questions: [{ type: 'truefalse', prompt: 'Quaternions avoid gimbal lock.', truth: true }] })
  const v = await describeView(db, { path: `/courses/${courseId}`, courseId, tab: 'tests', testId: t.id })
  expect(v).toMatch(/quiz "Lecture 2 quiz"/)
  expect(v).toContain('Quaternions avoid gimbal lock.')
})

test('other screens, and pages that no longer exist, still give a useful description', async () => {
  expect(await describeView(db, { path: '/today' })).toMatch(/Today/)
  expect(await describeView(db, { path: '/calendar' })).toMatch(/calendar/i)
  expect(await describeView(db, { path: '/pages/gone', pageId: 'gone' })).toMatch(/no longer exists/i)
  expect(await describeView(db, { path: '/courses/gone', courseId: 'gone' })).toMatch(/no longer exists/i)
})
