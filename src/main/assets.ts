import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { AppError } from '@core/errors'
import { safeFileName } from '@core/paths'
import type { AppContext } from './context'
import { fileUrl } from './protocol'

const MAX_ASSET_BYTES = 25 * 1024 * 1024

/** Store an editor attachment (image etc.) and return the URL the editor should reference. */
export function storeAsset(ctx: AppContext, name: string, data: Uint8Array): string {
  if (data.byteLength > MAX_ASSET_BYTES) throw new AppError('VALIDATION', 'File is larger than 25 MB')
  const dir = join(ctx.filesDir, 'assets')
  mkdirSync(dir, { recursive: true })
  const fileName = `${crypto.randomUUID().slice(0, 8)}-${safeFileName(name)}`
  writeFileSync(join(dir, fileName), data)
  return fileUrl(`assets/${fileName}`)
}
