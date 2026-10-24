import { and, asc, eq, lte } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { cards } from '../db/schema'
import { newCardState, review as srsReview, type Rating } from '../domain/srs'
import { notFound, parse } from '../errors'
import { newId, nowIso } from '../util'
import { get as getDeck } from './decks'

export type CardRow = typeof cards.$inferSelect

export const CardInput = z.object({ front: z.string().trim().min(1), back: z.string().trim().min(1), sourcePageId: z.string().nullish() })
export type CardInput = z.input<typeof CardInput>

export function list(db: Db, deckId: string): CardRow[] {
  return db.select().from(cards).where(eq(cards.deckId, deckId)).orderBy(asc(cards.createdAt)).all()
}

export function listDue(db: Db, deckId: string, now: Date, limit = 50): CardRow[] {
  return db
    .select()
    .from(cards)
    .where(and(eq(cards.deckId, deckId), lte(cards.due, now.toISOString())))
    .orderBy(asc(cards.due))
    .limit(limit)
    .all()
}

export function get(db: Db, id: string): CardRow {
  const row = db.select().from(cards).where(eq(cards.id, id)).get()
  if (!row) throw notFound('Card')
  return row
}

export function create(db: Db, deckId: string, input: CardInput, now: Date): CardRow {
  return createMany(db, deckId, [input], now)[0]
}

export function createMany(db: Db, deckId: string, inputs: CardInput[], now: Date): CardRow[] {
  getDeck(db, deckId)
  const parsed = inputs.map((i) => parse(CardInput, i))
  const t = nowIso()
  return db.transaction((tx) =>
    parsed.map((v) => tx.insert(cards).values({ id: newId(), deckId, front: v.front, back: v.back, sourcePageId: v.sourcePageId ?? null, ...newCardState(now), createdAt: t, updatedAt: t }).returning().get())
  )
}

export function update(db: Db, id: string, patch: Partial<Pick<CardInput, 'front' | 'back'>>): CardRow {
  const v = parse(CardInput.pick({ front: true, back: true }).partial(), patch)
  get(db, id)
  return db.update(cards).set({ ...v, updatedAt: nowIso() }).where(eq(cards.id, id)).returning().get()
}

export function remove(db: Db, id: string): void {
  db.delete(cards).where(eq(cards.id, id)).run()
}

export function review(db: Db, id: string, rating: Rating, now: Date): CardRow {
  const c = get(db, id)
  const next = srsReview(c, rating, now)
  return db.update(cards).set({ ...next, updatedAt: nowIso() }).where(eq(cards.id, id)).returning().get()
}
