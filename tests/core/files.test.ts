import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { extractText } from '@core/domain/extract'
import * as files from '@core/repo/files'
import * as search from '@core/repo/search'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'
import { makePdf } from '../helpers/pdf'

let db: Db
let courseId: string
let dir: string
let filesDir: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db).id
  dir = mkdtempSync(join(tmpdir(), 'unios-files-'))
  filesDir = join(dir, 'files')
})

test('extractText reads PDF text and page count', async () => {
  const r = await extractText(makePdf('Hello UniOS Lagrange'), 'application/pdf')
  expect(r.text).toContain('Hello UniOS Lagrange')
  expect(r.pageCount).toBe(1)
})

test('extractText returns null text for garbage PDFs and unknown types, never throws', async () => {
  expect(await extractText(new TextEncoder().encode('not a pdf'), 'application/pdf')).toEqual({ text: null, pageCount: null })
  expect(await extractText(new Uint8Array([1, 2, 3]), 'application/octet-stream')).toEqual({ text: null, pageCount: null })
  expect((await extractText(new TextEncoder().encode('# Notes\nhi'), 'text/markdown')).text).toBe('# Notes\nhi')
})

test('importFiles copies into the data folder, extracts and indexes text', async () => {
  const src = join(dir, 'Skript Kapitel 1.pdf')
  writeFileSync(src, makePdf('Eigenwerte und Eigenvektoren'))
  const [f] = await files.importFiles(db, filesDir, courseId, [src])
  expect(f).toMatchObject({ courseId, name: 'Skript Kapitel 1.pdf', mime: 'application/pdf', pageCount: 1 })
  expect(existsSync(join(filesDir, f.storedPath))).toBe(true)
  expect(f.storedPath.startsWith(`${courseId}/`)).toBe(true)
  expect(search.query(db, 'eigenwerte')[0]).toMatchObject({ entityType: 'file', entityId: f.id, courseId })
  expect(files.list(db, { courseId }).map((x) => x.id)).toEqual([f.id])
})

test('importing a broken PDF still stores the file without text', async () => {
  const src = join(dir, 'scan.pdf')
  writeFileSync(src, 'garbage')
  const [f] = await files.importFiles(db, filesDir, courseId, [src])
  expect(f.hasText).toBe(false)
  expect(files.get(db, f.id).text).toBeNull()
})

test('textPage pages long texts', async () => {
  const src = join(dir, 'long.txt')
  writeFileSync(src, 'x'.repeat(25))
  const [f] = await files.importFiles(db, filesDir, courseId, [src])
  expect(files.textPage(db, f.id, { offset: 0, limit: 10 })).toEqual({ text: 'x'.repeat(10), total: 25, nextOffset: 10 })
  expect(files.textPage(db, f.id, { offset: 20, limit: 10 })).toEqual({ text: 'x'.repeat(5), total: 25, nextOffset: null })
})

test('deleteFile removes row, index entry and the stored file', async () => {
  const src = join(dir, 'a.txt')
  writeFileSync(src, 'Fourier')
  const [f] = await files.importFiles(db, filesDir, courseId, [src])
  files.deleteFile(db, filesDir, f.id)
  expect(existsSync(join(filesDir, f.storedPath))).toBe(false)
  expect(search.query(db, 'fourier')).toHaveLength(0)
  expect(() => files.get(db, f.id)).toThrow(/not found/i)
})

test('rename keeps the stored file and re-indexes the name', async () => {
  const src = join(dir, 'a.txt')
  writeFileSync(src, 'content')
  const [f] = await files.importFiles(db, filesDir, courseId, [src])
  files.rename(db, f.id, 'Übung 1.txt')
  expect(search.query(db, 'übung')[0]?.entityId).toBe(f.id)
})
