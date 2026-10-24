import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { blocksToText, extractPageLinks } from '@core/domain/blocks'
import { blocksToMarkdown, markdownToBlocks } from '@core/domain/markdown'
import * as pages from '@core/repo/pages'
import { runTool } from '@core/tools'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'

const mention = (pageId: string, title = 'Ziel') => ({ type: 'pageMention', props: { pageId, title } })
const withMention = (pageId: string, title = 'Ziel') => ({
  id: crypto.randomUUID(),
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text: 'siehe ', styles: {} }, mention(pageId, title)],
  children: []
})

let db: Db
let courseId: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db, 'Photogrammetric Computer Vision').id
})

test('extractPageLinks finds mentions in nested blocks and tables, without duplicates', () => {
  const blocks = [
    withMention('a'),
    { type: 'paragraph', content: [], children: [withMention('b'), withMention('a')] },
    { type: 'table', content: { type: 'tableContent', rows: [{ cells: [[mention('c')]] }] }, children: [] }
  ]
  expect(extractPageLinks(blocks).sort()).toEqual(['a', 'b', 'c'])
})

test('mention titles are part of the plain text', () => {
  expect(blocksToText([withMention('x', 'Epipolargeometrie')])).toBe('siehe Epipolargeometrie')
})

test('saving a page records its links; backlinks list linking pages (not trashed ones)', () => {
  const target = pages.create(db, { courseId, title: 'Epipolargeometrie' })
  const a = pages.create(db, { courseId, title: 'VL 3' })
  const b = pages.create(db, { courseId, title: 'Zusammenfassung' })
  pages.updateContent(db, a.id, [withMention(target.id)])
  pages.updateContent(db, b.id, [withMention(target.id), withMention('does-not-exist')])
  expect(pages.backlinks(db, target.id).map((p) => p.title).sort()).toEqual(['VL 3', 'Zusammenfassung'])
  pages.updateContent(db, a.id, [])
  expect(pages.backlinks(db, target.id).map((p) => p.title)).toEqual(['Zusammenfassung'])
  pages.trash(db, b.id)
  expect(pages.backlinks(db, target.id)).toEqual([])
})

test('searchTitles finds pages by title across courses, skipping trashed pages and the current page', () => {
  const other = seedCourse(db, 'Analysis')
  const p1 = pages.create(db, { courseId, title: 'Epipolargeometrie' })
  pages.create(db, { courseId: other.id, title: 'Epsilon-Delta' })
  const gone = pages.create(db, { courseId, title: 'Epi alt' })
  pages.trash(db, gone.id)
  const hits = pages.searchTitles(db, 'ep', { exclude: p1.id })
  expect(hits.map((h) => h.title)).toEqual(['Epsilon-Delta'])
  expect(hits[0]).toMatchObject({ courseName: 'Analysis' })
  expect(pages.searchTitles(db, '', {}).length).toBe(2)
})

test('mentions travel as unios://page links in markdown, both ways', async () => {
  const md = await blocksToMarkdown([withMention('abc-123', 'Epipolargeometrie')])
  expect(md).toContain('[Epipolargeometrie](unios://page/abc-123)')
  const blocks = (await markdownToBlocks('Siehe [Epipolargeometrie](unios://page/abc-123) und [Web](https://x.de)')) as { content: { type: string; props?: { pageId?: string } }[] }[]
  const inline = blocks[0].content
  expect(inline.find((c) => c.type === 'pageMention')?.props?.pageId).toBe('abc-123')
  expect(inline.some((c) => c.type === 'link')).toBe(true)
})

test('assistant tools: create_page with a page link records the backlink; read_page lists linked_from', async () => {
  const ctx = { db, filesDir: '/tmp/none', now: () => new Date() }
  const target = pages.create(db, { courseId, title: 'Epipolargeometrie' })
  const r = await runTool(ctx, 'create_page', { course_id: courseId, title: 'Lernplan', markdown: `Wiederhole [Epipolargeometrie](unios://page/${target.id}).` })
  expect(r.ok).toBe(true)
  const read = await runTool(ctx, 'read_page', { page_id: target.id })
  expect(read.ok && (read.result as { linked_from: { title: string }[] }).linked_from).toEqual([expect.objectContaining({ title: 'Lernplan' })])
})
