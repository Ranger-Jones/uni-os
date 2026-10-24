import { ipcMain } from 'electron'
import { resolveRoute, serializeError } from '@core/rpc'
import type { Router } from './router'

export type IpcResult = { ok: true; data: unknown } | { ok: false; error: ReturnType<typeof serializeError> }

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
