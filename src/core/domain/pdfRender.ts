// Renders PDF pages (or a cropped part of one) to images, and finds where embedded pictures sit on a page.
// Coordinates are fractions of the page (0–1) measured from its top-left corner, as the page is displayed.
import { createIsomorphicCanvasFactory, getDocumentProxy, getResolvedPDFJS } from 'unpdf'
import { AppError } from '../errors'

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

export interface RenderedImage {
  data: Uint8Array
  mime: 'image/png' | 'image/jpeg'
  width: number
  height: number
}

export const FULL_PAGE: Box = { left: 0, top: 0, right: 1, bottom: 1 }

/** Longest side of rendered images; enough for sharp figures on a retina screen. */
const MAX_SIDE = 1600
/** Renders above this many points per PDF point only make huge canvases, not sharper figures. */
const MAX_SCALE = 6
/** PNG is lossless and small for slides; photos and scans fall back to JPEG above this size. */
const MAX_PNG_BYTES = 1.5 * 1024 * 1024

type Canvas = import('@napi-rs/canvas').Canvas
type Ctx2d = import('@napi-rs/canvas').SKRSContext2D
type Pdf = Awaited<ReturnType<typeof getDocumentProxy>>
type Matrix = [number, number, number, number, number, number]

let factory: Promise<new () => { create(w: number, h: number): { canvas: Canvas; context: Ctx2d }; destroy(c: unknown): void }> | null = null
// The native canvas is only loaded when something is rendered, so the rest of the app never depends on it.
const canvasFactory = () => (factory ??= createIsomorphicCanvasFactory(() => import('@napi-rs/canvas')) as never)

export async function withPdf<T>(data: Uint8Array, fn: (pdf: Pdf) => Promise<T>): Promise<T> {
  let pdf: Pdf
  try {
    pdf = await getDocumentProxy(new Uint8Array(data), { CanvasFactory: await canvasFactory() } as never)
  } catch {
    throw new AppError('VALIDATION', 'The PDF could not be opened (damaged or encrypted)')
  }
  try {
    return await fn(pdf)
  } finally {
    await pdf.loadingTask.destroy()
  }
}

export function checkBox(b: Box): Box {
  const ok = [b.left, b.top, b.right, b.bottom].every((v) => v >= 0 && v <= 1) && b.right - b.left >= 0.01 && b.bottom - b.top >= 0.01
  if (!ok) throw new AppError('VALIDATION', 'crop needs 0 ≤ left < right ≤ 1 and 0 ≤ top < bottom ≤ 1')
  return b
}

async function getPage(pdf: Pdf, pageNumber: number) {
  if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pdf.numPages) throw new AppError('VALIDATION', `page must be between 1 and ${pdf.numPages}`)
  return pdf.getPage(pageNumber)
}

/** Page size in PDF points, as displayed (rotation applied). */
export async function pageSize(pdf: Pdf, pageNumber: number): Promise<{ width: number; height: number }> {
  const vp = (await getPage(pdf, pageNumber)).getViewport({ scale: 1 })
  return { width: Math.round(vp.width), height: Math.round(vp.height) }
}

/**
 * Render `crop` of a page. Only the cropped area is rasterized, so small figures come out sharp.
 * With `grid`, lines every 10% (5% when zoomed in) are drawn and labelled in page fractions, to help pick a crop.
 */
export async function renderRegion(pdf: Pdf, pageNumber: number, opts: { crop?: Box; maxSide?: number; grid?: boolean } = {}): Promise<RenderedImage> {
  const page = await getPage(pdf, pageNumber)
  const crop = checkBox(opts.crop ?? FULL_PAGE)
  const base = page.getViewport({ scale: 1 })
  const regionW = (crop.right - crop.left) * base.width
  const regionH = (crop.bottom - crop.top) * base.height
  const scale = Math.min((opts.maxSide ?? MAX_SIDE) / Math.max(regionW, regionH), MAX_SCALE)
  const viewport = page.getViewport({ scale, offsetX: -crop.left * base.width * scale, offsetY: -crop.top * base.height * scale })
  const width = Math.max(1, Math.round(regionW * scale))
  const height = Math.max(1, Math.round(regionH * scale))

  const Factory = await canvasFactory()
  const f = new Factory()
  const drawing = f.create(width, height)
  try {
    const { canvas, context } = drawing
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    await page.render({ canvas, canvasContext: context, viewport } as never).promise
    if (opts.grid) drawGrid(context, crop, width, height)
    const png = await canvas.encode('png')
    if (png.byteLength <= MAX_PNG_BYTES) return { data: new Uint8Array(png), mime: 'image/png', width, height }
    return { data: new Uint8Array(await canvas.encode('jpeg', 88)), mime: 'image/jpeg', width, height }
  } finally {
    f.destroy(drawing)
  }
}

function drawGrid(ctx: Ctx2d, crop: Box, width: number, height: number): void {
  const step = Math.max(crop.right - crop.left, crop.bottom - crop.top) <= 0.5 ? 0.05 : 0.1
  const font = Math.max(11, Math.round(Math.max(width, height) / 90))
  ctx.font = `${font}px sans-serif`
  ctx.lineWidth = 1
  const label = (text: string, x: number, y: number) => {
    const w = ctx.measureText(text).width + 6
    ctx.fillStyle = 'rgba(255,255,255,0.85)'
    ctx.fillRect(x, y, w, font + 4)
    ctx.fillStyle = 'rgb(200,0,60)'
    ctx.fillText(text, x + 3, y + font)
  }
  const ticks = (from: number, to: number) => {
    const out: number[] = []
    for (let v = Math.ceil(from / step - 1e-9) * step; v < to - 1e-9; v += step) if (v > from + 1e-9) out.push(Math.round(v * 100) / 100)
    return out
  }
  ctx.strokeStyle = 'rgba(200,0,60,0.45)'
  for (const v of ticks(crop.left, crop.right)) {
    const x = Math.round(((v - crop.left) / (crop.right - crop.left)) * width) + 0.5
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
    label(String(v), x + 2, 2)
  }
  for (const v of ticks(crop.top, crop.bottom)) {
    const y = Math.round(((v - crop.top) / (crop.bottom - crop.top)) * height) + 0.5
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
    label(String(v), 2, y + 2)
  }
}

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5]
]

const round = (v: number) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000

/**
 * Bounding boxes of the raster images drawn on a page (photos, screenshots, scanned figures), largest first.
 * Vector drawings (charts, diagrams made of lines) are not found here — look at the rendered page for those.
 */
export async function findImages(pdf: Pdf, pageNumber: number): Promise<(Box & { area: number })[]> {
  const page = await getPage(pdf, pageNumber)
  const { OPS } = await getResolvedPDFJS()
  const viewport = page.getViewport({ scale: 1 })
  const ops = await page.getOperatorList()
  const paints = new Set([OPS.paintImageXObject, OPS.paintInlineImageXObject, OPS.paintImageMaskXObject])
  const stack: Matrix[] = []
  let ctm: Matrix = [1, 0, 0, 1, 0, 0]
  const found: (Box & { area: number })[] = []
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i]
    const args = ops.argsArray[i] as unknown[]
    if (fn === OPS.save) stack.push(ctm)
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm
    else if (fn === OPS.transform) ctm = multiply(ctm, args as Matrix)
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm)
      if (Array.isArray(args?.[0]) && (args[0] as number[]).length === 6) ctm = multiply(ctm, args[0] as Matrix)
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm
    else if (paints.has(fn)) {
      // An image fills the unit square of the current transform.
      const corners = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([x, y]) => viewport.convertToViewportPoint(ctm[0] * x + ctm[2] * y + ctm[4], ctm[1] * x + ctm[3] * y + ctm[5]))
      const xs = corners.map((c) => c[0] / viewport.width)
      const ys = corners.map((c) => c[1] / viewport.height)
      const box = { left: round(Math.min(...xs)), top: round(Math.min(...ys)), right: round(Math.max(...xs)), bottom: round(Math.max(...ys)) }
      const w = box.right - box.left
      const h = box.bottom - box.top
      // Skip bullets, logos and other decoration.
      if (w < 0.04 || h < 0.04) continue
      if (found.some((b) => b.left === box.left && b.top === box.top && b.right === box.right && b.bottom === box.bottom)) continue
      found.push({ ...box, area: Math.round(w * h * 1000) / 1000 })
    }
  }
  return found.sort((a, b) => b.area - a.area)
}
