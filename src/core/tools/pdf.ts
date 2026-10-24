import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { fileUrl, storeAsset } from '../assets'
import { blocksToText } from '../domain/blocks'
import { findImages, renderRegion, withPdf, type Box } from '../domain/pdfRender'
import { AppError } from '../errors'
import * as files from '../repo/files'
import * as pages from '../repo/pages'
import { defineTool, id, WithImages } from './define'

const fraction = z.number().min(0).max(1)
const crop = z
  .object({ left: fraction, top: fraction, right: fraction, bottom: fraction })
  .describe('Part of the page to keep, as fractions of the page width/height from its top-left corner, e.g. {"left":0.1,"top":0.3,"right":0.9,"bottom":0.85}. Omit for the whole page.')

function pdfData(ctx: { db: Parameters<typeof files.get>[0]; filesDir: string }, fileId: string): { name: string; data: Uint8Array } {
  const f = files.get(ctx.db, fileId)
  if (f.mime !== 'application/pdf') throw new AppError('VALIDATION', `${f.name} is not a PDF`)
  return { name: f.name, data: readFileSync(files.absolutePath(ctx.db, ctx.filesDir, f.id)) }
}

/** Display width in the editor: wide figures get more room than tall ones, none fill the whole page. */
const defaultWidth = (w: number, h: number) => (w / h >= 1.3 ? 560 : w / h >= 0.8 ? 420 : 300)

const imageBlock = (url: string, name: string, caption: string, previewWidth: number) => ({
  id: crypto.randomUUID(),
  type: 'image',
  props: { url, name, caption, previewWidth, showPreview: true, textAlignment: 'left', backgroundColor: 'default' },
  children: []
})

/** Index after the first top-level block whose text contains `needle` (case-insensitive), or the end. */
function insertIndex(blocks: unknown[], needle: string | undefined): number {
  if (!needle?.trim()) return blocks.length
  const n = needle.trim().toLowerCase()
  const i = blocks.findIndex((b) => blocksToText([b]).toLowerCase().includes(n))
  if (i < 0) throw new AppError('VALIDATION', `No block on the page contains "${needle}"`)
  return i + 1
}

export const pdfTools = [
  defineTool({
    name: 'view_pdf_page',
    description:
      'Look at one page of a course PDF (lecture slides, scripts) as an image, to find figures, diagrams or tables worth putting into notes. ' +
      'A red grid labelled in page fractions helps to choose a crop; pass crop to zoom in and check a cut before inserting it. ' +
      'Also returns the boxes of embedded pictures on the page (photos, screenshots) — vector diagrams are not in that list, find them on the image.',
    input: z.object({ file_id: id('File'), page: z.number().int().min(1).describe('1-based page number'), crop: crop.optional(), grid: z.boolean().optional().describe('Draw the coordinate grid (default true)') }),
    mutates: false,
    run: async (ctx, i) => {
      const { name, data } = pdfData(ctx, i.file_id)
      return withPdf(data, async (pdf) => {
        const img = await renderRegion(pdf, i.page, { crop: i.crop, maxSide: 1200, grid: i.grid ?? true })
        const result = { file: name, page: i.page, page_count: pdf.numPages, crop: i.crop ?? null, embedded_images: i.crop ? undefined : await findImages(pdf, i.page) }
        return new WithImages(result, [{ mimeType: img.mime, data: Buffer.from(img.data).toString('base64') }])
      })
    }
  }),
  defineTool({
    name: 'insert_pdf_image',
    description:
      'Cut a figure out of a course PDF and put it into a note page as an image. Crop tightly to the figure (check the cut with view_pdf_page first) so it does not take much room. ' +
      'Inserted after the first block containing after_text (e.g. a heading), otherwise at the end. width is the display width in pixels (default depends on the shape, 300–560).',
    input: z.object({
      page_id: id('Note page'),
      file_id: id('PDF file'),
      pdf_page: z.number().int().min(1).describe('1-based page number in the PDF'),
      crop: crop.optional(),
      caption: z.string().max(300).optional(),
      after_text: z.string().optional(),
      width: z.number().int().min(80).max(1200).optional()
    }),
    mutates: true,
    run: async (ctx, i) => {
      pages.get(ctx.db, i.page_id)
      const { name, data } = pdfData(ctx, i.file_id)
      const img = await withPdf(data, (pdf) => renderRegion(pdf, i.pdf_page, { crop: i.crop as Box | undefined }))
      const base = name.replace(/\.pdf$/i, '')
      const imageName = `${base}-p${i.pdf_page}.${img.mime === 'image/png' ? 'png' : 'jpg'}`
      const url = fileUrl(storeAsset(ctx.filesDir, i.page_id, imageName, img.data))
      const block = imageBlock(url, imageName, i.caption ?? '', i.width ?? defaultWidth(img.width, img.height))
      // Read and write in one synchronous transaction so concurrent edits are not overwritten.
      ctx.db.transaction((tx) => {
        const p = pages.get(tx as unknown as typeof ctx.db, i.page_id)
        const blocks = JSON.parse(p.content) as unknown[]
        blocks.splice(insertIndex(blocks, i.after_text), 0, block)
        pages.updateContent(tx as unknown as typeof ctx.db, p.id, blocks, p.updatedAt)
      })
      return { page_id: i.page_id, block_id: block.id, image: url, size: { width: img.width, height: img.height }, display_width: block.props.previewWidth }
    }
  })
]
