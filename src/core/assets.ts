import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, join, relative } from 'node:path'
import { checkBox, type Box } from './domain/pdfRender'
import { AppError } from './errors'
import { resolveInside, safeFileName } from './paths'

export const FILE_SCHEME = 'unios-file'

/** URL under which the app serves a file below <dataDir>/files (see src/main/protocol.ts). */
export const fileUrl = (rel: string): string => `${FILE_SCHEME}://local/${rel.split('/').map(encodeURIComponent).join('/')}`

export const MAX_ASSET_BYTES = 25 * 1024 * 1024

const PAGE_ID = /^[A-Za-z0-9-]{1,64}$/

/** Folder holding the editor images of one page (files/assets/<pageId>); null for anything but a plain id. */
export const pageAssetDir = (filesDir: string, pageId: string): string | null => (PAGE_ID.test(pageId) ? resolveInside(filesDir, `assets/${pageId}`) : null)

/** Store an editor attachment for a page; returns its path relative to the files folder. */
export function storeAsset(filesDir: string, pageId: string, name: string, data: Uint8Array): string {
  if (data.byteLength > MAX_ASSET_BYTES) throw new AppError('VALIDATION', 'File is larger than 25 MB')
  const dir = pageAssetDir(filesDir, pageId)
  if (!dir) throw new AppError('VALIDATION', 'Invalid page id')
  mkdirSync(dir, { recursive: true })
  // Write exactly the validated location and derive the returned path from it.
  const abs = join(dir, `${crypto.randomUUID().slice(0, 8)}-${safeFileName(name)}`)
  writeFileSync(abs, data)
  return relative(filesDir, abs).split('\\').join('/')
}

/** Absolute path of the file a unios-file URL points at, or null for any other URL. */
export function assetPath(filesDir: string, url: string): string | null {
  let u: URL
  try {
    u = new URL(url)
  } catch {
    return null
  }
  if (u.protocol !== `${FILE_SCHEME}:` || u.host !== 'local') return null
  return resolveInside(filesDir, u.pathname.replace(/^\/+/, ''))
}

/**
 * Cut part of an image stored below the files folder into a new asset of the page (the original stays,
 * so undo in the editor still shows it). box is in fractions of the image from its top-left corner.
 */
export async function cropAsset(filesDir: string, pageId: string, url: string, box: Box): Promise<{ rel: string; width: number; height: number }> {
  const src = assetPath(filesDir, url)
  if (!src) throw new AppError('VALIDATION', 'Only images stored in UniOS can be cropped')
  const b = checkBox(box)
  // The native canvas is only loaded when something is cropped, like in pdfRender.
  const { createCanvas, loadImage } = await import('@napi-rs/canvas')
  let img: Awaited<ReturnType<typeof loadImage>>
  try {
    img = await loadImage(readFileSync(src))
  } catch {
    throw new AppError('VALIDATION', 'The image could not be read')
  }
  const x = Math.round(b.left * img.width)
  const y = Math.round(b.top * img.height)
  const width = Math.max(1, Math.round(b.right * img.width) - x)
  const height = Math.max(1, Math.round(b.bottom * img.height) - y)
  const canvas = createCanvas(width, height)
  canvas.getContext('2d').drawImage(img, x, y, width, height, 0, 0, width, height)
  const jpeg = /\.jpe?g$/i.test(src)
  const data = new Uint8Array(jpeg ? await canvas.encode('jpeg', 90) : await canvas.encode('png'))
  // Drop the random prefix storeAsset added, so repeated crops do not stack prefixes.
  const name = basename(src).replace(/^[0-9a-f]{8}-/, '').replace(/\.[^.]+$/, '') + (jpeg ? '.jpg' : '.png')
  return { rel: storeAsset(filesDir, pageId, name, data), width, height }
}
