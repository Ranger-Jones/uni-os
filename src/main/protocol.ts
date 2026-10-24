import { createReadStream, statSync } from 'node:fs'
import { Readable } from 'node:stream'
import { protocol } from 'electron'
import { mimeFor } from '@core/domain/extract'
import { parseRange, resolveInside } from '@core/paths'
import type { AppContext } from './context'

export const FILE_SCHEME = 'unios-file'

/** Must run before app 'ready'. */
export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
}

/** Serves files below <dataDir>/files as unios-file://local/<relative path>, with byte ranges for video seeking. */
export function handleFileScheme(ctx: AppContext): void {
  protocol.handle(FILE_SCHEME, (req) => {
    const rel = new URL(req.url).pathname.replace(/^\/+/, '')
    const abs = resolveInside(ctx.filesDir, rel)
    let size: number
    try {
      if (!abs) throw new Error('outside')
      const st = statSync(abs)
      if (!st.isFile()) throw new Error('not a file')
      size = st.size
    } catch {
      return new Response('Not found', { status: 404 })
    }
    const type = mimeFor(abs)
    const range = parseRange(req.headers.get('range'), size)
    if (req.headers.get('range') && !range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } })
    const { start, end } = range ?? { start: 0, end: size - 1 }
    const body = size === 0 ? null : (Readable.toWeb(createReadStream(abs, { start, end })) as unknown as ReadableStream)
    return new Response(body, {
      status: range ? 206 : 200,
      headers: {
        'Content-Type': type,
        'Content-Length': String(size === 0 ? 0 : end - start + 1),
        'Accept-Ranges': 'bytes',
        ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {})
      }
    })
  })
}

export const fileUrl = (rel: string): string => `${FILE_SCHEME}://local/${rel.split('/').map(encodeURIComponent).join('/')}`
