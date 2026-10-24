import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { beforeEach, expect, test } from 'vitest'
import { resolveInside } from '@core/paths'
import type { Db } from '@core/db/open'
import { findImages, renderRegion, withPdf } from '@core/domain/pdfRender'
import * as files from '@core/repo/files'
import * as pages from '@core/repo/pages'
import { runTool, WithImages, type ToolCtx } from '@core/tools'
import { memDb } from '../helpers/db'
import { para, seedCourse } from '../helpers/fixtures'
import { makeSlidePdf } from '../helpers/pdf'

let db: Db
let ctx: ToolCtx
let courseId: string
let dir: string
beforeEach(() => {
  db = memDb().db
  dir = mkdtempSync(join(tmpdir(), 'unios-pdfimg-'))
  ctx = { db, filesDir: join(dir, 'files'), now: () => new Date('2026-10-24T12:00:00') }
  courseId = seedCourse(db).id
})

async function importSlide(name = 'Vorlesung 3.pdf') {
  const src = join(dir, name)
  writeFileSync(src, makeSlidePdf('Gradient descent'))
  return (await files.importFiles(db, ctx.filesDir, courseId, [src]))[0]
}

/** RGBA of the pixel at a fraction of the image. */
async function pixelAt(data: Uint8Array, fx: number, fy: number): Promise<number[]> {
  const img = await loadImage(Buffer.from(data))
  const c = createCanvas(img.width, img.height)
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  return [...g.getImageData(Math.floor(fx * (img.width - 1)), Math.floor(fy * (img.height - 1)), 1, 1).data]
}

test('findImages reports where embedded pictures sit, in page fractions from the top-left', async () => {
  const boxes = await withPdf(makeSlidePdf('x'), (pdf) => findImages(pdf, 1))
  expect(boxes).toEqual([{ left: 0.5, top: 0.25, right: 0.833, bottom: 0.75, area: 0.166 }])
})

test('renderRegion rasterizes only the crop, sharp and within the size limit', async () => {
  const pdf = makeSlidePdf('x')
  const full = await withPdf(pdf, (p) => renderRegion(p, 1, { maxSide: 1200 }))
  expect([full.width, full.height]).toEqual([1200, 800])
  expect(full.mime).toBe('image/png')
  const fig = await withPdf(pdf, (p) => renderRegion(p, 1, { crop: { left: 0.5, top: 0.25, right: 0.833, bottom: 0.75 } }))
  // 200×200 pt at the maximum zoom of 6
  expect(fig.width).toBeGreaterThan(1150)
  expect(fig.height).toBeGreaterThan(1150)
  expect((await pixelAt(fig.data, 0.5, 0.5)).slice(0, 3)).toEqual([255, 0, 0])
  // The uncropped page is white at the top-right corner.
  expect((await pixelAt(full.data, 0.99, 0.02)).slice(0, 3)).toEqual([255, 255, 255])
})

test('renderRegion rejects bad crops and page numbers', async () => {
  const pdf = makeSlidePdf('x')
  await expect(withPdf(pdf, (p) => renderRegion(p, 2))).rejects.toThrow('page must be between 1 and 1')
  await expect(withPdf(pdf, (p) => renderRegion(p, 1, { crop: { left: 0.6, top: 0, right: 0.5, bottom: 1 } }))).rejects.toThrow('crop needs')
})

test('view_pdf_page returns the page image plus embedded picture boxes', async () => {
  const f = await importSlide()
  const r = await runTool(ctx, 'view_pdf_page', { file_id: f.id, page: 1 })
  expect(r.ok).toBe(true)
  const out = (r as { result: WithImages }).result
  expect(out).toBeInstanceOf(WithImages)
  expect(out.result).toMatchObject({ file: 'Vorlesung 3.pdf', page: 1, page_count: 1, embedded_images: [{ left: 0.5, top: 0.25 }] })
  expect(out.images[0].mimeType).toBe('image/png')
  expect(Buffer.from(out.images[0].data, 'base64').subarray(1, 4).toString()).toBe('PNG')
})

test('view_pdf_page refuses files that are not PDFs', async () => {
  const src = join(dir, 'notes.txt')
  writeFileSync(src, 'hi')
  const [f] = await files.importFiles(db, ctx.filesDir, courseId, [src])
  expect(await runTool(ctx, 'view_pdf_page', { file_id: f.id, page: 1 })).toEqual({ ok: false, error: 'notes.txt is not a PDF' })
})

test('insert_pdf_image stores the cropped figure with the page and inserts it after a heading', async () => {
  const f = await importSlide()
  const heading = { id: crypto.randomUUID(), type: 'heading', props: { level: 2 }, content: [{ type: 'text', text: 'Gradientenverfahren', styles: {} }], children: [] }
  const page = pages.create(db, { courseId, title: 'VL 3', content: [heading, para('Erklärung'), para('Ende')] })
  const r = await runTool(ctx, 'insert_pdf_image', {
    page_id: page.id,
    file_id: f.id,
    pdf_page: 1,
    crop: { left: 0.5, top: 0.25, right: 0.833, bottom: 0.75 },
    caption: 'Abb. 3.1',
    after_text: 'gradientenverfahren'
  })
  expect(r.ok).toBe(true)
  const blocks = JSON.parse(pages.get(db, page.id).content) as { type: string; props: Record<string, unknown> }[]
  expect(blocks.map((b) => b.type)).toEqual(['heading', 'image', 'paragraph', 'paragraph'])
  const img = blocks[1].props
  expect(img).toMatchObject({ caption: 'Abb. 3.1', name: 'Vorlesung 3-p1.png', previewWidth: 420 })
  expect(img.url).toMatch(new RegExp(`^unios-file://local/assets/${page.id}/[0-9a-f]{8}-Vorlesung%203-p1\\.png$`))
  const rel = decodeURIComponent(String(img.url).replace('unios-file://local/', ''))
  expect(existsSync(resolveInside(ctx.filesDir, rel)!)).toBe(true)
})

test('insert_pdf_image appends by default and reports a missing anchor', async () => {
  const f = await importSlide()
  const page = pages.create(db, { courseId, title: 'VL 3', content: [para('Text')] })
  expect(await runTool(ctx, 'insert_pdf_image', { page_id: page.id, file_id: f.id, pdf_page: 1, after_text: 'Nirgends' })).toEqual({ ok: false, error: 'No block on the page contains "Nirgends"' })
  const r = await runTool(ctx, 'insert_pdf_image', { page_id: page.id, file_id: f.id, pdf_page: 1, width: 640 })
  expect(r.ok).toBe(true)
  const blocks = JSON.parse(pages.get(db, page.id).content) as { type: string; props: Record<string, unknown> }[]
  expect(blocks.map((b) => b.type)).toEqual(['paragraph', 'image'])
  expect(blocks[1].props.previewWidth).toBe(640)
})

test('inserted figures keep their size when the page is rewritten through Markdown', async () => {
  const f = await importSlide()
  const page = pages.create(db, { courseId, title: 'VL 3', content: [para('Text')] })
  await runTool(ctx, 'insert_pdf_image', { page_id: page.id, file_id: f.id, pdf_page: 1, crop: { left: 0.5, top: 0.25, right: 0.833, bottom: 0.75 }, caption: 'Abb. 1' })
  await runTool(ctx, 'insert_pdf_image', { page_id: page.id, file_id: f.id, pdf_page: 1, width: 300 })
  const read = await runTool(ctx, 'read_page', { page_id: page.id })
  const md = (read as { result: { markdown: string } }).result.markdown
  expect(md).toContain('width="420"')
  expect(md).toContain('width="300"')
  expect(md).not.toContain('unios-width')
  await runTool(ctx, 'update_page', { page_id: page.id, markdown: md })
  const blocks = JSON.parse(pages.get(db, page.id).content) as { type: string; props: Record<string, unknown> }[]
  expect(blocks.filter((b) => b.type === 'image').map((b) => [b.props.previewWidth, b.props.caption])).toEqual([
    [420, 'Abb. 1'],
    [300, '']
  ])
})
