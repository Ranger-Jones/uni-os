import { existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { Sqlite } from './db/open'
import { localDate } from './util'

const PATTERN = /^unios-\d{4}-\d{2}-\d{2}\.db$/

export const backupName = (now: Date): string => `unios-${localDate(now)}.db`

export const backupDue = (lastBackupAt: string | null, now: Date): boolean =>
  !lastBackupAt || now.getTime() - Date.parse(lastBackupAt) >= 24 * 3600 * 1000

/** Consistent snapshot of the live database (safe while it is in use). Returns the file path. */
export function runBackup(sqlite: Sqlite, dir: string, now: Date): string {
  mkdirSync(dir, { recursive: true })
  const file = join(dir, backupName(now))
  if (existsSync(file)) rmSync(file)
  sqlite.prepare('VACUUM INTO ?').run(file)
  return file
}

export function pruneBackups(dir: string, keep: number): void {
  const files = readdirSync(dir).filter((f) => PATTERN.test(f)).sort()
  for (const f of files.slice(0, Math.max(0, files.length - keep))) rmSync(join(dir, f), { force: true })
}
