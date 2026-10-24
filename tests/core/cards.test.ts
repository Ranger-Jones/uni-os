import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { newCardState, review } from '@core/domain/srs'
import * as cards from '@core/repo/cards'
import * as decks from '@core/repo/decks'
import { runTool, type ToolCtx } from '@core/tools'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'

const now = new Date('2026-10-24T10:00:00Z')

test('a new card is due immediately', () => {
  const s = newCardState(now)
  expect(new Date(s.due).getTime()).toBeLessThanOrEqual(now.getTime())
  expect(s.reps).toBe(0)
})

test('Good pushes the due date into the future, Again keeps it within a day', () => {
  const good = review(newCardState(now), 3, now)
  expect(new Date(good.due).getTime()).toBeGreaterThan(now.getTime())
  expect(good.reps).toBe(1)
  const again = review(good, 1, new Date(good.due))
  expect(new Date(again.due).getTime() - new Date(good.due).getTime()).toBeLessThan(24 * 3600 * 1000)
  const easy = review(newCardState(now), 4, now)
  expect(new Date(easy.due).getTime()).toBeGreaterThan(new Date(good.due).getTime())
})

let db: Db
let courseId: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db).id
})

test('decks list due and total counts; only due cards are served', () => {
  const d = decks.create(db, { courseId, name: 'Analysis Definitionen' })
  cards.createMany(db, d.id, [
    { front: 'Cauchy-Folge?', back: '…' },
    { front: 'Grenzwert?', back: '…' }
  ], now)
  const [first] = cards.listDue(db, d.id, now, 10)
  cards.review(db, first.id, 3, now)
  expect(decks.list(db, { courseId }, now)).toEqual([expect.objectContaining({ id: d.id, dueCount: 1, totalCount: 2 })])
  expect(cards.listDue(db, d.id, now, 10)).toHaveLength(1)
  expect(decks.totalDue(db, now)).toBe(1)
})

test('card validation and cascade', () => {
  const d = decks.create(db, { courseId, name: 'X' })
  expect(() => cards.create(db, d.id, { front: ' ', back: 'x' }, now)).toThrow()
  expect(() => cards.create(db, 'nope', { front: 'a', back: 'b' }, now)).toThrow(/deck not found/i)
  cards.create(db, d.id, { front: 'a', back: 'b' }, now)
  decks.remove(db, d.id)
  expect(decks.list(db, {}, now)).toEqual([])
})

test('create_flashcards tool adds cards to a named deck, creating it if needed', async () => {
  const ctx: ToolCtx = { db, filesDir: '/tmp/none', now: () => now }
  const r = await runTool(ctx, 'create_flashcards', { course_id: courseId, deck_name: 'Folgen', cards: [{ front: 'Was ist eine Nullfolge?', back: 'Eine Folge mit Grenzwert 0.' }] })
  expect(r).toMatchObject({ ok: true, result: { created: 1 } })
  await runTool(ctx, 'create_flashcards', { course_id: courseId, deck_name: 'folgen', cards: [{ front: 'a', back: 'b' }] })
  expect(decks.list(db, { courseId }, now)).toEqual([expect.objectContaining({ name: 'Folgen', totalCount: 2 })])
  const listed = await runTool(ctx, 'list_decks', {})
  expect(listed.ok && (listed.result as unknown[]).length).toBe(1)
})
