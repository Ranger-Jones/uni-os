import { backupDue, pruneBackups, runBackup } from '@core/backup'
import type { AppContext } from './context'

const KEEP = 14
let lastError: string | null = null

export function backupNow(ctx: AppContext): { lastBackupAt: string | null; error: string | null } {
  const dir = ctx.settings.backupDir
  if (!dir) return { lastBackupAt: ctx.settings.lastBackupAt, error: 'Choose a backup folder first.' }
  try {
    const now = new Date()
    runBackup(ctx.sqlite, dir, now)
    pruneBackups(dir, KEEP)
    ctx.updateSettings({ lastBackupAt: now.toISOString() })
    lastError = null
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    console.error('[backup]', err)
  }
  return backupStatus(ctx)
}

export const backupStatus = (ctx: AppContext) => ({ lastBackupAt: ctx.settings.lastBackupAt, error: lastError })

/** Daily snapshot into the backup folder; checked at startup and every 6 hours. Never blocks the app. */
export function scheduleBackups(ctx: AppContext): () => void {
  const tick = () => {
    if (ctx.settings.backupDir && backupDue(ctx.settings.lastBackupAt, new Date())) backupNow(ctx)
  }
  const first = setTimeout(tick, 15_000)
  const timer = setInterval(tick, 6 * 3600 * 1000)
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}
