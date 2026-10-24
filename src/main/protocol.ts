import { pathToFileURL } from 'node:url'
import { net, protocol } from 'electron'
import { resolveInside } from '@core/paths'
import type { AppContext } from './context'

export const FILE_SCHEME = 'unios-file'

/** Must run before app 'ready'. */
export function registerFileScheme(): void {
  protocol.registerSchemesAsPrivileged([{ scheme: FILE_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])
}

/** Serves files below <dataDir>/files as unios-file://local/<relative path>. */
export function handleFileScheme(ctx: AppContext): void {
  protocol.handle(FILE_SCHEME, (req) => {
    const rel = new URL(req.url).pathname.replace(/^\/+/, '')
    const abs = resolveInside(ctx.filesDir, rel)
    if (!abs) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(abs).toString())
  })
}

export const fileUrl = (rel: string): string => `${FILE_SCHEME}://local/${rel.split('/').map(encodeURIComponent).join('/')}`
