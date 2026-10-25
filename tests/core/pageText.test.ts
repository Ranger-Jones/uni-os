import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import { eq } from 'drizzle-orm'
import type { Db } from '@core/db/open'
import { files as filesTable } from '@core/db/schema'
import { extractText } from '@core/domain/extract'
import { findInText, joinPages, splitPages } from '@core/domain/pageText'
import * as files from '@core/repo/files'
import { runTool } from '@core/tools'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'
import { makeDeckPdf } from '../helpers/pdf'

let db: Db
let courseId: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db, 'Photogrammetric Computer Vision').id
})

const DECK = ['Overview of the lecture', 'Homogeneous coordinates of points', 'The line at infinity l = (0, 0, 1)', 'Cross product of two lines gives their intersection point']

test('pages are marked and can be split again', () => {
  const t = joinPages(['first', '  second  ', ''])
  expect(t).toBe('[Page 1]\nfirst\n\n[Page 2]\nsecond\n\n[Page 3]')
  expect(splitPages(t)).toEqual([
    { page: 1, text: 'first' },
    { page: 2, text: 'second' },
    { page: 3, text: '' }
  ])
  expect(splitPages('plain text file')).toEqual([{ page: null, text: 'plain text file' }])
})

test('find in text: all words on the same page, case and accents ignored, with a snippet', () => {
  const t = joinPages(['Die Linie im Unendlichen', 'Kreuzprodukt zweier Linien', 'Das KREUZPRODUKT von Punkten und die Linie im Unendlichen (line at infinity)'])
  const hits = findInText(t, 'kreuzprodukt unendlichen')
  expect(hits.map((h) => h.page)).toEqual([3])
  expect(hits[0].snippet).toMatch(/KREUZPRODUKT/)
  expect(findInText(t, 'Linie').map((h) => h.page)).toEqual([1, 2, 3])
  expect(findInText(joinPages(['Gauß-Krüger', 'x']), 'gauss kruger')).toHaveLength(0)
  expect(findInText(joinPages(['Gauß-Krüger Koordinaten']), 'gauß kruger').map((h) => h.page)).toEqual([1])
  expect(findInText('no pages here, but a line at infinity', 'infinity')).toEqual([{ page: null, snippet: expect.stringContaining('infinity'), hits: 1 }])
})

test('PDF text keeps its page boundaries', async () => {
  const r = await extractText(makeDeckPdf(DECK), 'application/pdf')
  expect(r.pageCount).toBe(4)
  expect(splitPages(r.text!).map((p) => p.page)).toEqual([1, 2, 3, 4])
  expect(splitPages(r.text!)[2].text).toContain('line at infinity')
})

async function importDeck(name: string, pages: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'unios-deck-'))
  writeFileSync(join(dir, name), makeDeckPdf(pages))
  const filesDir = join(dir, 'files')
  const [f] = await files.importFiles(db, filesDir, courseId, [join(dir, name)])
  return { f, filesDir }
}

test('old PDFs without page marks are read again once', async () => {
  const { f, filesDir } = await importDeck('02_pcv.pdf', DECK)
  // simulate text stored by an older version (pages merged)
  db.update(filesTable).set({ text: DECK.join('\n') }).where(eq(filesTable.id, f.id)).run()
  expect(await files.addPageMarks(db, filesDir)).toBe(1)
  expect(splitPages(files.get(db, f.id).text!).map((p) => p.page)).toEqual([1, 2, 3, 4])
  expect(await files.addPageMarks(db, filesDir)).toBe(0)
})

test('reading a file by page', async () => {
  const { f } = await importDeck('02_pcv.pdf', DECK)
  const r = files.textPage(db, f.id, { page: 3, toPage: 4 })
  expect(r.text).toMatch(/^\[Page 3\][\s\S]*line at infinity[\s\S]*\[Page 4\][\s\S]*Cross product/)
  expect(r.text).not.toContain('Homogeneous')
  expect(r.pageCount).toBe(4)
  expect(() => files.textPage(db, f.id, { page: 9 })).toThrow(/page.*1.*4/i)
})

test('assistant tools: find_in_files names file and page; read_file_text reads one page', async () => {
  const { f, filesDir } = await importDeck('02_pcv.pdf', DECK)
  await importDeck('01_pcv.pdf', ['Administration', 'Cross product repetition'])
  const ctx = { db, filesDir, now: () => new Date() }
  const r = await runTool(ctx, 'find_in_files', { query: 'cross product', course_id: courseId })
  expect(r.ok && r.result).toMatchObject({
    matches: [
      { file: '01_pcv.pdf', page: 2 },
      { file: '02_pcv.pdf', page: 4, file_id: f.id }
    ]
  })
  const p = await runTool(ctx, 'read_file_text', { file_id: f.id, page: 3 })
  expect(p.ok && (p.result as { text: string }).text).toContain('line at infinity')
  const none = await runTool(ctx, 'find_in_files', { query: 'quaternion' })
  expect(none.ok && none.result).toMatchObject({ matches: [], note: expect.stringMatching(/nothing found/i) })
})

test('filler words are ignored and partial matches are returned when no page has all words', () => {
  const t = joinPages(['Points and lines at infinity: ideal points', 'Cross product of two lines', 'Homogeneous coordinates'])
  expect(findInText(t, 'the lines at infinity').map((h) => h.page)).toEqual([1])
  expect(findInText(t, 'lines at infinity horizon').map((h) => h.page)).toEqual([])
  const partial = findInText(t, 'lines at infinity horizon', { partial: true })
  expect(partial.map((h) => h.page)).toEqual([1, 2])
  expect(partial[0].matched).toEqual(['lines', 'infinity'])
})

test('find_in_files: partial matches are labelled, and an empty result tells the model what to do next', async () => {
  const { filesDir } = await importDeck('02_pcv.pdf', DECK)
  const ctx = { db, filesDir, now: () => new Date() }
  const r = await runTool(ctx, 'find_in_files', { query: 'line infinity horizon' })
  expect(r.ok && r.result).toMatchObject({ note: expect.stringMatching(/not all words/i) })
  expect(r.ok && (r.result as { matches: unknown[] }).matches[0]).toMatchObject({ page: 3, partial: true })
  const none = await runTool(ctx, 'find_in_files', { query: 'Linie im Unendlichen' })
  expect(none.ok && none.result).toMatchObject({ matches: [], note: expect.stringMatching(/english.*call find_in_files again/i) })
})
