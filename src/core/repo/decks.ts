import { and, asc, eq, isNull, lte, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { cards, decks } from '../db/schema'
import { notFound, parse } from '../errors'
import { newId, nowIso } from '../util'
import { get as getCourse } from './courses'

export type Deck = typeof decks.$inferSelect
export type DeckWithCounts = Deck & { dueCount: number; totalCount: number }

export const DeckInput = z.object({ courseId: z.string().nullish(), name: z.string().trim().min(1) })

export function list(db: Db, opts: { courseId?: string | null }, now: Date): DeckWithCounts[] {
  const course = opts.courseId === undefined ? undefined : opts.courseId === null ? isNull(decks.courseId) : eq(decks.courseId, opts.courseId)
  return db
    .select({
      deck: decks,
      totalCount: sql<number>`count(${cards.id})`,
      dueCount: sql<number>`coalesce(sum(case when ${cards.due} <= ${now.toISOString()} then 1 else 0 end), 0)`
    })
    .from(decks)
    .leftJoin(cards, eq(cards.deckId, decks.id))
    .where(course)
    .groupBy(decks.id)
    .orderBy(asc(decks.name))
    .all()
    .map((r) => ({ ...r.deck, totalCount: Number(r.totalCount), dueCount: Number(r.dueCount) }))
}

export function get(db: Db, id: string): Deck {
  const row = db.select().from(decks).where(eq(decks.id, id)).get()
  if (!row) throw notFound('Deck')
  return row
}

export function create(db: Db, input: z.input<typeof DeckInput>): Deck {
  const v = parse(DeckInput, input)
  if (v.courseId) getCourse(db, v.courseId)
  const t = nowIso()
  return db.insert(decks).values({ id: newId(), courseId: v.courseId ?? null, name: v.name, createdAt: t, updatedAt: t }).returning().get()
}

/** Deck with this name (case-insensitive) in the course, created if missing. */
export function findOrCreate(db: Db, courseId: string | null, name: string): Deck {
  const existing = db
    .select()
    .from(decks)
    .where(and(courseId ? eq(decks.courseId, courseId) : isNull(decks.courseId), sql`lower(${decks.name}) = lower(${name.trim()})`))
    .get()
  return existing ?? create(db, { courseId, name })
}

export function rename(db: Db, id: string, name: string): Deck {
  const v = parse(DeckInput.shape.name, name)
  get(db, id)
  return db.update(decks).set({ name: v, updatedAt: nowIso() }).where(eq(decks.id, id)).returning().get()
}

export function remove(db: Db, id: string): void {
  db.delete(decks).where(eq(decks.id, id)).run()
}

export function totalDue(db: Db, now: Date): number {
  const r = db.select({ n: sql<number>`count(*)` }).from(cards).where(lte(cards.due, now.toISOString())).get()
  return Number(r?.n ?? 0)
}
