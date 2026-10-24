import { asc, eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { courseLinks } from '../db/schema'
import { normalizeTags } from '../domain/fileTags'
import { detectLinkKind, titleFromUrl } from '../domain/links'
import { notFound, parse } from '../errors'
import { isSafeExternalUrl } from '../url'
import { newId, nowIso } from '../util'
import { get as getCourse } from './courses'
import * as search from './search'

export type CourseLink = typeof courseLinks.$inferSelect

const url = z
  .string()
  .trim()
  .refine((u) => isSafeExternalUrl(u), 'URL must start with http:// or https://')
export const LinkInput = z.object({
  courseId: z.string().min(1),
  url,
  title: z.string().trim().nullish(),
  note: z.string().nullish(),
  tags: z.array(z.string()).optional()
})
export type LinkInput = z.input<typeof LinkInput>
export const LinkPatch = z.object({ url: url.optional(), title: z.string().trim().min(1).optional(), note: z.string().nullish(), tags: z.array(z.string()).optional() })

function reindex(db: Db, l: CourseLink): void {
  search.index(db, { entityType: 'link', entityId: l.id, courseId: l.courseId, title: l.title, body: [l.tags.join(' '), l.url, l.note ?? ''].join('\n') })
}

export function list(db: Db, opts: { courseId?: string; tag?: string } = {}): CourseLink[] {
  const q = db.select().from(courseLinks)
  const rows = (opts.courseId ? q.where(eq(courseLinks.courseId, opts.courseId)) : q).orderBy(asc(courseLinks.createdAt)).all()
  const tag = opts.tag?.trim().toLowerCase()
  return tag ? rows.filter((r) => r.tags.includes(tag)) : rows
}

export function get(db: Db, id: string): CourseLink {
  const row = db.select().from(courseLinks).where(eq(courseLinks.id, id)).get()
  if (!row) throw notFound('Link')
  return row
}

export function create(db: Db, input: LinkInput): CourseLink {
  const v = parse(LinkInput, input)
  getCourse(db, v.courseId)
  const t = nowIso()
  const row = db
    .insert(courseLinks)
    .values({ id: newId(), courseId: v.courseId, url: v.url, title: v.title || titleFromUrl(v.url), kind: detectLinkKind(v.url), note: v.note ?? null, tags: normalizeTags(v.tags ?? []), createdAt: t, updatedAt: t })
    .returning()
    .get()
  reindex(db, row)
  return row
}

export function update(db: Db, id: string, patch: z.input<typeof LinkPatch>): CourseLink {
  const v = parse(LinkPatch, patch)
  get(db, id)
  const row = db
    .update(courseLinks)
    .set({ ...v, ...(v.url ? { kind: detectLinkKind(v.url) } : {}), ...(v.tags ? { tags: normalizeTags(v.tags) } : {}), updatedAt: nowIso() })
    .where(eq(courseLinks.id, id))
    .returning()
    .get()
  reindex(db, row)
  return row
}

export function remove(db: Db, id: string): void {
  db.delete(courseLinks).where(eq(courseLinks.id, id)).run()
}
