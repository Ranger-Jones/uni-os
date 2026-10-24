import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { normalizeTags, suggestTags } from '@core/domain/fileTags'
import * as files from '@core/repo/files'
import * as search from '@core/repo/search'
import { runTool } from '@core/tools'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'

let db: Db
let courseId: string
let dir: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db).id
  dir = mkdtempSync(join(tmpdir(), 'unios-tags-'))
})

async function importFile(name: string) {
  const src = join(dir, name)
  writeFileSync(src, 'Inhalt')
  return (await files.importFiles(db, join(dir, 'files'), courseId, [src]))[0]
}

test('tags are normalized: trimmed, lowercase, unique, limited', () => {
  expect(normalizeTags([' Lecture', 'lecture', 'Übung ', '', 'x'.repeat(40)])).toEqual(['lecture', 'übung'])
  expect(normalizeTags(Array.from({ length: 20 }, (_, i) => `t${i}`))).toHaveLength(10)
})

test('tags are suggested from typical German and English file names', () => {
  expect(suggestTags('Übungsblatt 3.pdf')).toEqual(['exercise'])
  expect(suggestTags('Blatt03_Loesung.pdf')).toEqual(['exercise', 'solution'])
  expect(suggestTags('VL05_Epipolargeometrie.pdf')).toEqual(['lecture'])
  expect(suggestTags('Lecture 2 - Camera Models.pdf')).toEqual(['lecture'])
  expect(suggestTags('Klausur_WS2425.pdf')).toEqual(['exam'])
  expect(suggestTags('Mitschrift.md')).toEqual(['notes'])
  expect(suggestTags('Hartley_Zisserman.pdf')).toEqual([])
})

test('import applies suggested tags; setTags replaces them and updates search', async () => {
  const f = await importFile('Übungsblatt 1.pdf')
  expect(f.tags).toEqual(['exercise'])
  const updated = files.setTags(db, f.id, ['Exercise', 'Wichtig'])
  expect(updated.tags).toEqual(['exercise', 'wichtig'])
  expect(search.query(db, 'wichtig')[0]?.entityId).toBe(f.id)
})

test('files can be listed by tag', async () => {
  await importFile('VL01.pdf')
  await importFile('Übungsblatt 1.pdf')
  expect(files.list(db, { courseId, tag: 'lecture' }).map((f) => f.name)).toEqual(['VL01.pdf'])
})

test('assistant tools: list_files shows and filters tags; set_file_tags changes them', async () => {
  const ctx = { db, filesDir: join(dir, 'files'), now: () => new Date() }
  const f = await importFile('Skript.pdf')
  const set = await runTool(ctx, 'set_file_tags', { file_id: f.id, tags: ['lecture'] })
  expect(set.ok).toBe(true)
  const r = await runTool(ctx, 'list_files', { course_id: courseId, tag: 'lecture' })
  expect(r.ok && r.result).toEqual([expect.objectContaining({ name: 'Skript.pdf', tags: ['lecture'] })])
  expect((await runTool(ctx, 'set_file_tags', { file_id: 'nope', tags: [] })).ok).toBe(false)
})
