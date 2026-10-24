import { mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { asc, eq } from 'drizzle-orm'
import type { Db } from '../db/open'
import { files } from '../db/schema'
import { extractText, mimeFor } from '../domain/extract'
import { normalizeTags, suggestTags } from '../domain/fileTags'
import { AppError, notFound } from '../errors'
import { resolveInside, safeFileName } from '../paths'
import { newId, nowIso } from '../util'
import { get as getCourse } from './courses'
import * as search from './search'

export type FileRow = typeof files.$inferSelect
export type FileMeta = Omit<FileRow, 'text'> & { hasText: boolean }

export const MAX_IMPORT_BYTES = 200 * 1024 * 1024

const toMeta = ({ text, ...rest }: FileRow): FileMeta => ({ ...rest, hasText: !!text })

function reindex(db: Db, f: FileRow): void {
  const tags = f.tags.length ? `${f.tags.join(' ')}\n` : ''
  search.index(db, { entityType: 'file', entityId: f.id, courseId: f.courseId, title: f.name, body: tags + (f.text ?? '') })
}

export function list(db: Db, opts: { courseId?: string; tag?: string } = {}): FileMeta[] {
  const q = db.select().from(files)
  const rows = (opts.courseId ? q.where(eq(files.courseId, opts.courseId)) : q).orderBy(asc(files.name)).all()
  const tag = opts.tag?.trim().toLowerCase()
  return rows.filter((r) => !tag || r.tags.includes(tag)).map(toMeta)
}

export function setTags(db: Db, id: string, tags: string[]): FileMeta {
  get(db, id)
  const row = db.update(files).set({ tags: normalizeTags(tags), updatedAt: nowIso() }).where(eq(files.id, id)).returning().get()
  reindex(db, row)
  return toMeta(row)
}

export function get(db: Db, id: string): FileRow {
  const row = db.select().from(files).where(eq(files.id, id)).get()
  if (!row) throw notFound('File')
  return row
}

export async function importFiles(db: Db, filesDir: string, courseId: string, paths: string[]): Promise<FileMeta[]> {
  getCourse(db, courseId)
  const dir = join(filesDir, courseId)
  mkdirSync(dir, { recursive: true })
  const out: FileMeta[] = []
  for (const src of paths) {
    const size = statSync(src).size
    if (size > MAX_IMPORT_BYTES) throw new AppError('VALIDATION', `${basename(src)} is larger than 200 MB`)
    const data = readFileSync(src)
    const name = safeFileName(basename(src))
    const id = newId()
    const storedPath = `${courseId}/${id.slice(0, 8)}-${name}`
    writeFileSync(join(filesDir, storedPath), data)
    const mime = mimeFor(name)
    const { text, pageCount } = await extractText(data, mime)
    const t = nowIso()
    const row = db.insert(files).values({ id, courseId, name, storedPath, mime, size, text, pageCount, tags: suggestTags(name), createdAt: t, updatedAt: t }).returning().get()
    reindex(db, row)
    out.push(toMeta(row))
  }
  return out
}

export function rename(db: Db, id: string, name: string): FileMeta {
  if (!name.trim()) throw new AppError('VALIDATION', 'Name must not be empty')
  get(db, id)
  const row = db.update(files).set({ name: name.trim(), updatedAt: nowIso() }).where(eq(files.id, id)).returning().get()
  reindex(db, row)
  return toMeta(row)
}

export function absolutePath(db: Db, filesDir: string, id: string): string {
  const abs = resolveInside(filesDir, get(db, id).storedPath)
  if (!abs) throw new AppError('VALIDATION', 'Invalid stored path')
  return abs
}

export function deleteFile(db: Db, filesDir: string, id: string): void {
  const abs = absolutePath(db, filesDir, id)
  db.delete(files).where(eq(files.id, id)).run()
  rmSync(abs, { force: true })
}

export function textPage(db: Db, id: string, opts: { offset?: number; limit?: number } = {}): { text: string; total: number; nextOffset: number | null } {
  const text = get(db, id).text ?? ''
  const offset = Math.max(0, opts.offset ?? 0)
  const limit = Math.max(1, opts.limit ?? 20_000)
  const end = Math.min(text.length, offset + limit)
  return { text: text.slice(offset, end), total: text.length, nextOffset: end < text.length ? end : null }
}
