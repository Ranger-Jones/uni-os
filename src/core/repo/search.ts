import { sql } from 'drizzle-orm'
import type { Db } from '../db/open'

export type EntityType = 'page' | 'file' | 'assignment' | 'course' | 'link' | 'test'

export interface SearchDoc {
  entityType: EntityType
  entityId: string
  courseId: string | null
  title: string
  body: string
}

export interface SearchHit {
  entityType: EntityType
  entityId: string
  courseId: string | null
  title: string
  snippet: string
}

export function index(db: Db, doc: SearchDoc): void {
  remove(db, doc.entityType, doc.entityId)
  db.run(
    sql`INSERT INTO search_fts (entity_type, entity_id, course_id, title, body) VALUES (${doc.entityType}, ${doc.entityId}, ${doc.courseId}, ${doc.title}, ${doc.body})`
  )
}

export function remove(db: Db, entityType: EntityType, entityId: string): void {
  db.run(sql`DELETE FROM search_fts WHERE entity_type = ${entityType} AND entity_id = ${entityId}`)
}

/** Turn free user text into a safe FTS5 query: every word becomes a quoted prefix term, all ANDed. */
export function toFtsQuery(input: string): string | null {
  const terms = input
    .split(/\s+/)
    .map((t) => t.replace(/["*]/g, '').trim())
    .filter(Boolean)
  if (terms.length === 0) return null
  return terms.map((t) => `"${t}"*`).join(' ')
}

export function query(db: Db, text: string, opts: { courseId?: string; types?: EntityType[]; limit?: number } = {}): SearchHit[] {
  const q = toFtsQuery(text)
  if (!q) return []
  const rows = db.all<{ entity_type: EntityType; entity_id: string; course_id: string | null; title: string; snippet: string }>(sql`
    SELECT entity_type, entity_id, course_id, title,
      snippet(search_fts, 4, '«', '»', '…', 14) AS snippet
    FROM search_fts
    WHERE search_fts MATCH ${q}
      ${opts.courseId ? sql`AND course_id = ${opts.courseId}` : sql``}
    ORDER BY bm25(search_fts, 0, 0, 0, 5.0, 1.0)
    LIMIT ${opts.limit ?? 30}
  `)
  return rows
    .filter((r) => !opts.types || opts.types.includes(r.entity_type))
    .map((r) => ({ entityType: r.entity_type, entityId: r.entity_id, courseId: r.course_id, title: r.title, snippet: r.snippet }))
}
