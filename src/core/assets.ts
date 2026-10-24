import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from './errors'
import { resolveInside, safeFileName } from './paths'

export const MAX_ASSET_BYTES = 25 * 1024 * 1024

/** Folder holding the editor images of one page (files/assets/<pageId>). */
export const pageAssetDir = (filesDir: string, pageId: string): string | null => resolveInside(filesDir, `assets/${pageId}`)

/** Store an editor attachment for a page; returns its path relative to the files folder. */
export function storeAsset(filesDir: string, pageId: string, name: string, data: Uint8Array): string {
  if (data.byteLength > MAX_ASSET_BYTES) throw new AppError('VALIDATION', 'File is larger than 25 MB')
  const dir = pageAssetDir(filesDir, pageId)
  if (!dir) throw new AppError('VALIDATION', 'Invalid page id')
  mkdirSync(dir, { recursive: true })
  const rel = `assets/${pageId}/${crypto.randomUUID().slice(0, 8)}-${safeFileName(name)}`
  writeFileSync(join(filesDir, rel), data)
  return rel
}
