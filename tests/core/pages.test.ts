import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import * as pages from '@core/repo/pages'
import * as search from '@core/repo/search'
import { memDb } from '../helpers/db'
import { para, seedCourse } from '../helpers/fixtures'

let db: Db
let courseId: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db).id
})

test('tree nests children under parents in sort order, per course or global', () => {
  const a = pages.create(db, { courseId, title: 'Lecture 1' })
  const b = pages.create(db, { courseId, title: 'Lecture 2' })
  const a1 = pages.create(db, { courseId, parentId: a.id, title: 'Proofs' })
  pages.create(db, { courseId: null, title: 'Inbox' })
  const tree = pages.tree(db, { courseId })
  expect(tree.map((n) => n.title)).toEqual(['Lecture 1', 'Lecture 2'])
  expect(tree[0].children.map((n) => n.id)).toEqual([a1.id])
  expect(pages.tree(db, { courseId: null }).map((n) => n.title)).toEqual(['Inbox'])
  expect(b.sortOrder).toBeGreaterThan(a.sortOrder)
})

test('child inherits the course of its parent', () => {
  const a = pages.create(db, { courseId, title: 'A' })
  const child = pages.create(db, { courseId: null, parentId: a.id, title: 'B' })
  expect(child.courseId).toBe(courseId)
})

test('updateContent stores JSON, derives plain text and indexes it', () => {
  const p = pages.create(db, { courseId, title: 'Optimierung' })
  pages.updateContent(db, p.id, [para('Lagrange-Multiplikatoren sind nützlich')])
  expect(pages.get(db, p.id).contentText).toContain('Lagrange')
  const hits = search.query(db, 'lagrange')
  expect(hits).toHaveLength(1)
  expect(hits[0]).toMatchObject({ entityType: 'page', entityId: p.id, courseId, title: 'Optimierung' })
  expect(hits[0].snippet).toContain('Lagrange')
})

test('renaming re-indexes the title', () => {
  const p = pages.create(db, { courseId, title: 'Alt' })
  pages.update(db, p.id, { title: 'Eigenwerte' })
  expect(search.query(db, 'eigenwerte')).toHaveLength(1)
  expect(search.query(db, 'alt')).toHaveLength(0)
})

test('trash hides page and its children from tree and search; restore brings them back', () => {
  const a = pages.create(db, { courseId, title: 'Parent' })
  const c = pages.create(db, { courseId, parentId: a.id, title: 'Child topic' })
  pages.trash(db, a.id)
  expect(pages.tree(db, { courseId })).toEqual([])
  expect(search.query(db, 'child')).toHaveLength(0)
  expect(pages.listTrash(db).map((p) => p.id)).toEqual([a.id])
  pages.restore(db, a.id)
  expect(pages.tree(db, { courseId })[0].children[0].id).toBe(c.id)
  expect(search.query(db, 'child')).toHaveLength(1)
})

test('restoring a child whose parent is still trashed moves it to the top level', () => {
  const a = pages.create(db, { courseId, title: 'Parent' })
  const c = pages.create(db, { courseId, parentId: a.id, title: 'Child' })
  pages.trash(db, c.id)
  pages.trash(db, a.id)
  pages.restore(db, c.id)
  expect(pages.get(db, c.id).parentId).toBeNull()
  expect(pages.tree(db, { courseId }).map((n) => n.id)).toEqual([c.id])
})

test('purge deletes page, children and index rows', () => {
  const a = pages.create(db, { courseId, title: 'Gone' })
  pages.create(db, { courseId, parentId: a.id, title: 'Gone child' })
  pages.trash(db, a.id)
  pages.purge(db, a.id)
  expect(pages.listTrash(db)).toEqual([])
  expect(() => pages.get(db, a.id)).toThrow(/not found/i)
})

test('move rejects making a page its own descendant', () => {
  const a = pages.create(db, { courseId, title: 'A' })
  const b = pages.create(db, { courseId, parentId: a.id, title: 'B' })
  expect(() => pages.update(db, a.id, { parentId: b.id })).toThrow(/descendant|itself/i)
  expect(() => pages.update(db, a.id, { parentId: a.id })).toThrow(/descendant|itself/i)
})

test('search query tolerates special characters and filters by course', () => {
  const other = seedCourse(db, 'Physik')
  const p = pages.create(db, { courseId, title: 'Notes' })
  pages.updateContent(db, p.id, [para('Fourier transform')])
  const q = pages.create(db, { courseId: other.id, title: 'Notes' })
  pages.updateContent(db, q.id, [para('Fourier series')])
  for (const s of ['"', '*', '-', 'four*', 'AND OR', '(fourier', "c'est"]) expect(() => search.query(db, s)).not.toThrow()
  expect(search.query(db, 'four')).toHaveLength(2)
  expect(search.query(db, 'four', { courseId })).toHaveLength(1)
  expect(search.query(db, '   ')).toEqual([])
})

test('duplicate copies content as a sibling with "(copy)" title', () => {
  const p = pages.create(db, { courseId, title: 'Orig', content: [para('Inhalt')] })
  const d = pages.duplicate(db, p.id)
  expect(d).toMatchObject({ title: 'Orig (copy)', courseId, parentId: null, contentText: 'Inhalt' })
  expect(d.id).not.toBe(p.id)
})
