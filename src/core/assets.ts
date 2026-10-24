import { mkdirSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { AppError } from './errors'
import { resolveInside, safeFileName } from './paths'

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
