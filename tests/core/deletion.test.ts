import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { sql } from 'drizzle-orm'
import { beforeEach, expect, test } from 'vitest'
import { pageAssetDir, storeAsset } from '@core/assets'
import type { Db } from '@core/db/open'
import { removeCourseWithFiles, removeSemesterWithFiles, purgePageWithFiles } from '@core/repo/deletion'
import * as files from '@core/repo/files'
import * as pages from '@core/repo/pages'
import * as search from '@core/repo/search'
import * as semesters from '@core/repo/semesters'
import { memDb } from '../helpers/db'
import { para, seedCourse } from '../helpers/fixtures'

let db: Db
let filesDir: string
let dir: string
beforeEach(() => {
  db = memDb().db
  dir = mkdtempSync(join(tmpdir(), 'unios-del-'))
  filesDir = join(dir, 'files')
})

async function courseWithEverything() {
  const c = seedCourse(db)
  const p = pages.create(db, { courseId: c.id, title: 'Notizen', content: [para('Lagrange')] })
  const src = join(dir, 'skript.txt')
  writeFileSync(src, 'Eigenwerte')
  const [f] = await files.importFiles(db, filesDir, c.id, [src])
  const asset = storeAsset(filesDir, p.id, 'bild.png', new Uint8Array([1, 2, 3]))
  return { c, p, f, asset }
}

test('editor images are stored per page', () => {
  const rel = storeAsset(filesDir, 'page-1', '../x.png', new Uint8Array([1]))
  expect(rel).toMatch(/^assets\/page-1\/[0-9a-f]{8}-x\.png$/)
  expect(existsSync(join(filesDir, rel))).toBe(true)
})

test('removing a course deletes rows first, then its files, page images and search entries', async () => {
  const { c, p, f, asset } = await courseWithEverything()
  removeCourseWithFiles(db, filesDir, c.id)
  expect(existsSync(join(filesDir, f.storedPath))).toBe(false)
  expect(existsSync(join(filesDir, asset))).toBe(false)
  expect(existsSync(pageAssetDir(filesDir, p.id)!)).toBe(false)
  expect(search.query(db, 'lagrange')).toHaveLength(0)
  expect(search.query(db, 'eigenwerte')).toHaveLength(0)
})

test('if the database delete fails, no files are touched', async () => {
  const { c, f, asset } = await courseWithEverything()
  db.run(sql.raw("CREATE TRIGGER block BEFORE DELETE ON courses BEGIN SELECT RAISE(ABORT, 'locked'); END"))
  expect(() => removeCourseWithFiles(db, filesDir, c.id)).toThrow(/locked/)
  expect(existsSync(join(filesDir, f.storedPath))).toBe(true)
  expect(existsSync(join(filesDir, asset))).toBe(true)
})

test('removing a semester cleans all its courses; purging a page removes its images', async () => {
  const { c, f } = await courseWithEverything()
  const p2 = pages.create(db, { courseId: c.id, title: 'Other' })
  const img = storeAsset(filesDir, p2.id, 'a.png', new Uint8Array([1]))
  pages.trash(db, p2.id)
  purgePageWithFiles(db, filesDir, p2.id)
  expect(existsSync(join(filesDir, img))).toBe(false)
  removeSemesterWithFiles(db, filesDir, semesters.list(db)[0].id)
  expect(existsSync(join(filesDir, f.storedPath))).toBe(false)
})

test('asset storage rejects page ids that are not plain ids', () => {
  for (const bad of ['../x', 'a/b', '%2e%2e', 'a\\b', '', '..']) expect(() => storeAsset(filesDir, bad, 'x.png', new Uint8Array([1])), bad).toThrow(/invalid page id/i)
  expect(pageAssetDir(filesDir, '../x')).toBeNull()
})
