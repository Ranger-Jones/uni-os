import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { mimeFor } from '@core/domain/extract'
import { detectLinkKind, titleFromUrl } from '@core/domain/links'
import { parseRange } from '@core/paths'
import * as courses from '@core/repo/courses'
import * as files from '@core/repo/files'
import * as links from '@core/repo/links'
import * as search from '@core/repo/search'
import { runTool } from '@core/tools'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'

let db: Db
let courseId: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db, 'Photogrammetric Computer Vision').id
})

test('video links are recognised', () => {
  for (const u of ['https://www.youtube.com/watch?v=abc', 'https://youtu.be/abc', 'https://vimeo.com/123', 'https://video4.virtuos.uni-osnabrueck.de/paella/ui/watch.html?id=1', 'https://uni.cloud.panopto.eu/Panopto/Pages/Viewer.aspx?id=x', 'https://tube.uni-weimar.de/x', 'https://example.org/lecture.mp4'])
    expect(detectLinkKind(u), u).toBe('video')
  for (const u of ['https://moodle.uni-weimar.de/course/view.php?id=1', 'https://arxiv.org/abs/1234'])
    expect(detectLinkKind(u), u).toBe('link')
})

test('a readable default title comes from the URL', () => {
  expect(titleFromUrl('https://moodle.uni-weimar.de/course/view.php?id=1')).toBe('moodle.uni-weimar.de')
  expect(titleFromUrl('https://www.robots.ox.ac.uk/~vgg/hzbook/hzbook2_chapter9.pdf')).toBe('hzbook2 chapter9 — robots.ox.ac.uk')
})

test('links: create with defaults, list by course and tag, update, remove; only http(s)', () => {
  const l = links.create(db, { courseId, url: 'https://www.youtube.com/watch?v=x', title: 'Epipolar geometry explained', tags: ['Lecture'] })
  expect(l).toMatchObject({ kind: 'video', tags: ['lecture'], title: 'Epipolar geometry explained' })
  links.create(db, { courseId, url: 'https://moodle.uni-weimar.de/course/view.php?id=1' })
  expect(links.list(db, { courseId }).map((x) => x.title)).toEqual(['Epipolar geometry explained', 'moodle.uni-weimar.de'])
  expect(links.list(db, { courseId, tag: 'lecture' })).toHaveLength(1)
  expect(links.update(db, l.id, { title: 'Epipolar geometry (Cyrill Stachniss)', tags: ['video', 'lecture'] }).tags).toEqual(['video', 'lecture'])
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'notaurl', 'ftp://x.de']) expect(() => links.create(db, { courseId, url: bad }), bad).toThrow(/http/i)
  expect(() => links.create(db, { courseId: 'nope', url: 'https://x.de' })).toThrow(/course not found/i)
  links.remove(db, l.id)
  expect(links.list(db, { courseId })).toHaveLength(1)
})

test('links are searchable and disappear with their course', () => {
  links.create(db, { courseId, url: 'https://x.de/a', title: 'Bündelblockausgleichung Skript', note: 'gute Herleitung' })
  expect(search.query(db, 'bündelblock')[0]).toMatchObject({ entityType: 'link', courseId })
  expect(search.query(db, 'herleitung')).toHaveLength(1)
  courses.remove(db, courseId)
  expect(search.query(db, 'bündelblock')).toHaveLength(0)
})

test('assistant tools: add_link, list_links, update_link; get_course includes links', async () => {
  const ctx = { db, filesDir: '/tmp/none', now: () => new Date() }
  const a = await runTool(ctx, 'add_link', { course_id: courseId, url: 'https://youtu.be/abc', title: 'SfM intro', tags: ['lecture'] })
  expect(a.ok && a.result).toMatchObject({ kind: 'video' })
  const id = (a as { result: { id: string } }).result.id
  expect((await runTool(ctx, 'update_link', { link_id: id, tags: ['exam'] })).ok).toBe(true)
  const l = await runTool(ctx, 'list_links', { course_id: courseId, tag: 'exam' })
  expect(l.ok && l.result).toEqual([expect.objectContaining({ title: 'SfM intro', kind: 'video', tags: ['exam'] })])
  const c = await runTool(ctx, 'get_course', { course_id: courseId })
  expect(c.ok && (c.result as { links: unknown[] }).links).toHaveLength(1)
  expect((await runTool(ctx, 'add_link', { course_id: courseId, url: 'javascript:alert(1)' })).ok).toBe(false)
})

test('video files: recognised types, streamed import without text extraction', async () => {
  expect(mimeFor('VL03.mp4')).toBe('video/mp4')
  expect(mimeFor('rec.MOV')).toBe('video/quicktime')
  expect(mimeFor('a.webm')).toBe('video/webm')
  const dir = mkdtempSync(join(tmpdir(), 'unios-vid-'))
  const src = join(dir, 'Vorlesung 3.mp4')
  writeFileSync(src, Buffer.alloc(1024, 7))
  const [f] = await files.importFiles(db, join(dir, 'files'), courseId, [src])
  expect(f).toMatchObject({ mime: 'video/mp4', size: 1024, hasText: false })
  expect(readFileSync(join(dir, 'files', f.storedPath)).length).toBe(1024)
})

test('parseRange handles the byte ranges video players request', () => {
  expect(parseRange('bytes=0-', 1000)).toEqual({ start: 0, end: 999 })
  expect(parseRange('bytes=100-199', 1000)).toEqual({ start: 100, end: 199 })
  expect(parseRange('bytes=-100', 1000)).toEqual({ start: 900, end: 999 })
  expect(parseRange('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 })
  expect(parseRange('bytes=1000-', 1000)).toBeNull()
  expect(parseRange('items=0-1', 1000)).toBeNull()
  expect(parseRange(null, 1000)).toBeNull()
})
