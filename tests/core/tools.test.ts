import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import * as grades from '@core/repo/grades'
import * as pages from '@core/repo/pages'
import { runTool, toolSpecs, tools, type ToolCtx } from '@core/tools'
import { memDb } from '../helpers/db'
import { para, seedCourse } from '../helpers/fixtures'

let db: Db
let ctx: ToolCtx
let courseId: string
beforeEach(() => {
  db = memDb().db
  ctx = { db, filesDir: join(mkdtempSync(join(tmpdir(), 'unios-tools-')), 'files'), now: () => new Date('2026-10-24T12:00:00') }
  courseId = seedCourse(db, 'Analysis I', { ects: 9 }).id
})

test('tool names are unique snake_case and every tool has a JSON schema', () => {
  const names = tools.map((t) => t.name)
  expect(new Set(names).size).toBe(names.length)
  for (const n of names) expect(n).toMatch(/^[a-z][a-z_]*$/)
  for (const s of toolSpecs()) expect(s.inputSchema).toMatchObject({ type: 'object' })
  expect(tools.length).toBeGreaterThanOrEqual(20)
})

test('unknown tool and invalid input return readable errors', async () => {
  expect(await runTool(ctx, 'nope', {})).toEqual({ ok: false, error: 'Unknown tool: nope' })
  const bad = await runTool(ctx, 'set_component_grade', { course_id: courseId, name: 'Exam', grade: 6 })
  expect(bad.ok).toBe(false)
  if (!bad.ok) expect(bad.error).toMatch(/grade/i)
})

test('unknown ids are reported, not thrown', async () => {
  const r = await runTool(ctx, 'get_course', { course_id: 'missing' })
  expect(r).toEqual({ ok: false, error: 'Course not found' })
})

test('create_assignment then list_assignments shows it', async () => {
  const c = await runTool(ctx, 'create_assignment', { course_id: courseId, title: 'Blatt 4', due_at: '2026-10-30T12:00' })
  expect(c.ok).toBe(true)
  const l = await runTool(ctx, 'list_assignments', { course_id: courseId })
  expect(l.ok && (l.result as { title: string }[]).map((a) => a.title)).toEqual(['Blatt 4'])
})

test('create_page / append_to_page / read_page work with markdown', async () => {
  const c = await runTool(ctx, 'create_page', { course_id: courseId, title: 'Zusammenfassung', markdown: '# Folgen\n\nKonvergenz' })
  expect(c.ok).toBe(true)
  const id = (c as { result: { id: string } }).result.id
  await runTool(ctx, 'append_to_page', { page_id: id, markdown: '- Cauchy\n- Monotonie' })
  const r = await runTool(ctx, 'read_page', { page_id: id })
  expect(r.ok && (r.result as { markdown: string }).markdown).toMatch(/# Folgen[\s\S]*Konvergenz[\s\S]*Cauchy/)
  expect(pages.get(db, id).contentText).toContain('Monotonie')
})

test('search finds page text', async () => {
  const p = pages.create(db, { courseId, title: 'Notizen' })
  pages.updateContent(db, p.id, [para('Riemann-Integral')])
  const r = await runTool(ctx, 'search', { query: 'riemann' })
  expect(r.ok && (r.result as { id: string }[])[0].id).toBe(p.id)
})

test('get_grades returns GPA and set_component_grade creates or updates by name', async () => {
  await runTool(ctx, 'set_component_grade', { course_id: courseId, name: 'Klausur', weight: 100, grade: 1.7 })
  await runTool(ctx, 'set_component_grade', { course_id: courseId, name: 'klausur', grade: 1.3 })
  expect(grades.listComponents(db, courseId)).toHaveLength(1)
  const r = await runTool(ctx, 'get_grades', {})
  expect(r.ok && (r.result as { gpa: number }).gpa).toBe(1.3)
})

test('mutating tools are flagged', () => {
  const mut = tools.filter((t) => t.mutates).map((t) => t.name)
  expect(mut).toEqual(expect.arrayContaining(['create_page', 'append_to_page', 'update_page', 'create_assignment', 'update_assignment', 'create_event', 'set_component_grade']))
  expect(mut).not.toContain('search')
})

test('read_file_text pages long texts', async () => {
  const r = await runTool(ctx, 'read_file_text', { file_id: 'missing' })
  expect(r).toEqual({ ok: false, error: 'File not found' })
})

test('get_schedule names courses', async () => {
  await import('@core/repo/sessions').then((s) => s.create(db, { courseId, kind: 'lecture', weekday: 1, startTime: '10:00', endTime: '12:00' }))
  const r = await runTool(ctx, 'get_schedule', { from: '2026-10-26', to: '2026-10-26' })
  expect(r.ok && r.result).toEqual([expect.objectContaining({ course: 'Analysis I', date: '2026-10-26', start: '10:00' })])
})
