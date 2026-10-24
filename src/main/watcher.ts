import type { BrowserWindow } from 'electron'
import { dataVersion } from '@core/db/open'
import type { AppContext } from './context'

/** Notify the renderer when another process (e.g. the MCP server) commits to the database. */
export function watchExternalChanges(ctx: AppContext, getWindow: () => BrowserWindow | null, intervalMs = 2000): () => void {
  let lastHandle = ctx.open()
  let last = dataVersion(lastHandle.sqlite)
  const timer = setInterval(() => {
    try {
      const handle = ctx.open()
      const v = dataVersion(handle.sqlite)
      if (handle !== lastHandle || v !== last) {
        lastHandle = handle
        last = v
        getWindow()?.webContents.send('db:changed')
      }
    } catch (err) {
      console.error('[watcher]', err)
    }
  }, intervalMs)
  return () => clearInterval(timer)
}
