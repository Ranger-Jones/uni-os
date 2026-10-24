import { isAbsolute } from 'node:path'
import { ipcMain } from 'electron'
import { resolveRoute, serializeError } from '@core/rpc'
import type { Router } from './router'

export type IpcResult = { ok: true; data: unknown } | { ok: false; error: ReturnType<typeof serializeError> }

/**
 * Dropped files arrive through a dedicated channel fed only by the preload, which derives
 * paths from real File objects — the renderer itself can never name an arbitrary path.
 */
export function registerDropImport(handler: (courseId: string, paths: string[]) => Promise<unknown>): void {
  ipcMain.handle('files:importDropped', async (_e, courseId: string, paths: string[]): Promise<IpcResult> => {
    try {
      const valid = paths.filter((p) => typeof p === 'string' && isAbsolute(p))
      return { ok: true, data: await handler(courseId, valid) }
    } catch (err) {
      return { ok: false, error: serializeError(err) }
    }
  })
}

export function registerIpc(router: Router): void {
  ipcMain.handle('api:invoke', async (_e, path: string, input: unknown): Promise<IpcResult> => {
    try {
      const fn = resolveRoute(router, path)
      return { ok: true, data: await fn(input) }
    } catch (err) {
      if (!(err instanceof Error && err.name === 'AppError')) console.error(`[ipc] ${path} failed`, err)
      return { ok: false, error: serializeError(err) }
    }
  })
}
