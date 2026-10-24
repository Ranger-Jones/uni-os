import { and, asc, eq, inArray, isNotNull, isNull, like, max, ne, sql } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { courses, pageLinks, pages } from '../db/schema'
import { blocksToText, extractPageLinks } from '../domain/blocks'
import { AppError, notFound, parse } from '../errors'
import { newId, nowIso } from '../util'
import * as search from './search'

export type Page = typeof pages.$inferSelect
export type PageMeta = Omit<Page, 'content' | 'contentText'>
export interface PageNode extends Pick<Page, 'id' | 'title' | 'icon' | 'parentId' | 'courseId' | 'sortOrder'> {
  children: PageNode[]
}

const metaCols = {
  id: pages.id,
  courseId: pages.courseId,
  parentId: pages.parentId,
  title: pages.title,
  icon: pages.icon,
  sortOrder: pages.sortOrder,
  deletedAt: pages.deletedAt,
  createdAt: pages.createdAt,
  updatedAt: pages.updatedAt
}

export const PageCreate = z.object({
  courseId: z.string().nullish(),
  parentId: z.string().nullish(),
  title: z.string().optional(),
  icon: z.string().nullish(),
  content: z.array(z.unknown()).optional()
})
export const PagePatch = z.object({
  courseId: z.string().nullish(),
  title: z.string().optional(),
  icon: z.string().nullish(),
  parentId: z.string().nullish(),
  sortOrder: z.number().optional()
})

/** Keep the page_links table in sync with the mentions in a page (unknown targets are ignored). */
function syncLinks(db: Db, fromId: string, content: unknown): void {
  const targets = extractPageLinks(content).filter((id) => id !== fromId)
  db.delete(pageLinks).where(eq(pageLinks.fromId, fromId)).run()
  if (!targets.length) return
  const existing = db.select({ id: pages.id }).from(pages).where(inArray(pages.id, targets)).all()
  for (const { id } of existing) db.insert(pageLinks).values({ fromId, toId: id }).onConflictDoNothing().run()
}

function reindex(db: Db, p: Pick<Page, 'id' | 'courseId' | 'title' | 'contentText' | 'deletedAt'>): void {
  if (p.deletedAt) search.remove(db, 'page', p.id)
  else search.index(db, { entityType: 'page', entityId: p.id, courseId: p.courseId, title: p.title || 'Untitled', body: p.contentText })
}

export function get(db: Db, id: string): Page {
  const row = db.select().from(pages).where(eq(pages.id, id)).get()
  if (!row) throw notFound('Page')
  return row
}

export function list(db: Db, opts: { courseId?: string | null } = {}): PageMeta[] {
  const course = opts.courseId === undefined ? undefined : opts.courseId === null ? isNull(pages.courseId) : eq(pages.courseId, opts.courseId)
  return db.select(metaCols).from(pages).where(and(isNull(pages.deletedAt), course)).orderBy(asc(pages.sortOrder)).all()
}

export function tree(db: Db, opts: { courseId: string | null }): PageNode[] {
  const rows = list(db, opts)
  const byId = new Map<string, PageNode>(rows.map((r) => [r.id, { id: r.id, title: r.title, icon: r.icon, parentId: r.parentId, courseId: r.courseId, sortOrder: r.sortOrder, children: [] }]))
  const roots: PageNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function nextSortOrder(db: Db, parentId: string | null, courseId: string | null): number {
  const siblings = parentId ? eq(pages.parentId, parentId) : and(isNull(pages.parentId), courseId ? eq(pages.courseId, courseId) : isNull(pages.courseId))
  const r = db.select({ m: max(pages.sortOrder) }).from(pages).where(siblings).get()
  return (r?.m ?? 0) + 1
}

export function create(db: Db, input: z.input<typeof PageCreate>): Page {
  const v = parse(PageCreate, input)
  const parent = v.parentId ? get(db, v.parentId) : null
  const courseId = parent ? parent.courseId : (v.courseId ?? null)
  const content = v.content ?? []
  const t = nowIso()
  const row = db
    .insert(pages)
    .values({
      id: newId(),
      courseId,
      parentId: parent?.id ?? null,
      title: v.title ?? '',
      icon: v.icon ?? null,
      content: JSON.stringify(content),
      contentText: blocksToText(content),
      sortOrder: nextSortOrder(db, parent?.id ?? null, courseId),
      createdAt: t,
      updatedAt: t
    })
    .returning()
    .get()
  syncLinks(db, row.id, content)
  reindex(db, row)
  return row
}

/** Strictly increasing timestamp, so two writes in the same millisecond still get different versions. */
function nextVersion(prev: string): string {
  const now = Date.now()
  const p = Date.parse(prev)
  return new Date(Number.isNaN(p) || now > p ? now : p + 1).toISOString()
}

/**
 * Replace a page's blocks. With `expectedUpdatedAt`, the write only happens if nobody else (assistant, MCP,
 * another view) changed the page since that version; otherwise a CONFLICT error is thrown.
 */
export function updateContent(db: Db, id: string, content: unknown, expectedUpdatedAt?: string): PageMeta {
  if (!Array.isArray(content)) throw new AppError('VALIDATION', 'content must be an array of blocks')
  const row = db.transaction((tx) => {
    const current = tx.select({ updatedAt: pages.updatedAt }).from(pages).where(eq(pages.id, id)).get()
    if (!current) throw notFound('Page')
    if (expectedUpdatedAt && current.updatedAt !== expectedUpdatedAt) throw new AppError('CONFLICT', 'This page was changed elsewhere.')
    return tx
      .update(pages)
      .set({ content: JSON.stringify(content), contentText: blocksToText(content), updatedAt: nextVersion(current.updatedAt) })
      .where(eq(pages.id, id))
      .returning()
      .get()
  })
  syncLinks(db, id, content)
  reindex(db, row)
  const { content: _c, contentText: _t, ...meta } = row
  return meta
}

/** Ids of `id` and everything below it. */
function subtreeIds(db: Db, id: string): string[] {
  const rows = db.all<{ id: string }>(sql`
    WITH RECURSIVE sub(id) AS (SELECT ${id} UNION ALL SELECT p.id FROM pages p JOIN sub ON p.parent_id = sub.id)
    SELECT id FROM sub`)
  return rows.map((r) => r.id)
}

export function update(db: Db, id: string, patch: z.input<typeof PagePatch>): Page {
  const v = parse(PagePatch, patch)
  const current = get(db, id)
  let courseId = v.courseId !== undefined ? v.courseId : current.courseId
  if (v.parentId !== undefined && v.parentId !== null) {
    if (subtreeIds(db, id).includes(v.parentId)) throw new AppError('VALIDATION', 'A page cannot be moved into itself or its descendant')
    courseId = get(db, v.parentId).courseId
  }
  const row = db
    .update(pages)
    .set({ ...v, courseId, updatedAt: nowIso() })
    .where(eq(pages.id, id))
    .returning()
    .get()
  if (courseId !== current.courseId) {
    for (const sid of subtreeIds(db, id)) {
      const p = db.update(pages).set({ courseId }).where(eq(pages.id, sid)).returning().get()
      reindex(db, p)
    }
  }
  reindex(db, row)
  return row
}

export function trash(db: Db, id: string): void {
  get(db, id)
  const t = nowIso()
  db.transaction((tx) => {
    for (const sid of subtreeIds(tx as unknown as Db, id)) {
      tx.update(pages).set({ deletedAt: t }).where(and(eq(pages.id, sid), isNull(pages.deletedAt))).run()
      search.remove(tx as unknown as Db, 'page', sid)
    }
  })
}

export function restore(db: Db, id: string): void {
  const page = get(db, id)
  db.transaction((tx) => {
    const t = tx as unknown as Db
    if (page.parentId && get(t, page.parentId).deletedAt) tx.update(pages).set({ parentId: null }).where(eq(pages.id, id)).run()
    for (const sid of subtreeIds(t, id)) {
      const row = tx.update(pages).set({ deletedAt: null }).where(eq(pages.id, sid)).returning().get()
      reindex(t, row)
    }
  })
}

/** Top-level trashed pages (children trashed together with their parent are not listed separately). */
export function listTrash(db: Db): PageMeta[] {
  const rows = db.select(metaCols).from(pages).where(isNotNull(pages.deletedAt)).orderBy(asc(pages.deletedAt)).all()
  const trashed = new Set(rows.map((r) => r.id))
  return rows.filter((r) => !r.parentId || !trashed.has(r.parentId))
}

export function purge(db: Db, id: string): void {
  db.delete(pages).where(eq(pages.id, id)).run()
}

export function duplicate(db: Db, id: string): Page {
  const src = get(db, id)
  return create(db, {
    courseId: src.courseId,
    parentId: src.parentId,
    title: src.title ? `${src.title} (copy)` : '',
    icon: src.icon,
    content: JSON.parse(src.content) as unknown[]
  })
}

/** Breadcrumb chain from the top-level page down to the direct parent of `id`. */
export function ancestors(db: Db, id: string): Pick<Page, 'id' | 'title' | 'icon'>[] {
  const chain: Pick<Page, 'id' | 'title' | 'icon'>[] = []
  let parentId = get(db, id).parentId
  while (parentId && chain.length < 50) {
    const p = get(db, parentId)
    chain.unshift({ id: p.id, title: p.title, icon: p.icon })
    parentId = p.parentId
  }
  return chain
}

/** Pages (not in the trash) that mention `id`. */
export function backlinks(db: Db, id: string): Pick<Page, 'id' | 'title' | 'icon' | 'courseId'>[] {
  return db
    .select({ id: pages.id, title: pages.title, icon: pages.icon, courseId: pages.courseId })
    .from(pageLinks)
    .innerJoin(pages, eq(pages.id, pageLinks.fromId))
    .where(and(eq(pageLinks.toId, id), isNull(pages.deletedAt)))
    .orderBy(asc(pages.title))
    .all()
}

export interface PageTitleHit {
  id: string
  title: string
  icon: string | null
  courseId: string | null
  courseName: string | null
}

/** Title search for linking pages (case-insensitive substring, excludes trashed pages). */
export function searchTitles(db: Db, q: string, opts: { exclude?: string; limit?: number }): PageTitleHit[] {
  const term = q.trim().toLowerCase().replace(/[%_\\]/g, (c) => `\\${c}`)
  return db
    .select({ id: pages.id, title: pages.title, icon: pages.icon, courseId: pages.courseId, courseName: courses.name })
    .from(pages)
    .leftJoin(courses, eq(courses.id, pages.courseId))
    .where(
      and(
        isNull(pages.deletedAt),
        opts.exclude ? ne(pages.id, opts.exclude) : undefined,
        term ? sql`lower(${pages.title}) LIKE ${`%${term}%`} ESCAPE '\\'` : undefined
      )
    )
    .orderBy(sql`${pages.updatedAt} DESC`)
    .limit(opts.limit ?? 12)
    .all()
}
