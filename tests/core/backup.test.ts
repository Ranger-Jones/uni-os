import { existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Database from 'better-sqlite3'
import { expect, test } from 'vitest'
import { backupDue, backupName, pruneBackups, runBackup } from '@core/backup'
import { openDb } from '@core/db/open'
import { seedCourse } from '../helpers/fixtures'

test('backup names sort by date', () => {
  expect(backupName(new Date('2026-10-24T08:00:00'))).toBe('unios-2026-10-24.db')
})

test('backup is due without a previous one or after 24 hours', () => {
  const now = new Date('2026-10-24T12:00:00Z')
  expect(backupDue(null, now)).toBe(true)
  expect(backupDue('2026-10-24T01:00:00Z', now)).toBe(false)
  expect(backupDue('2026-10-23T11:00:00Z', now)).toBe(true)
})

test('pruneBackups keeps the newest N unios backups and ignores other files', () => {
  const dir = mkdtempSync(join(tmpdir(), 'unios-bk-'))
  for (let d = 1; d <= 20; d++) writeFileSync(join(dir, `unios-2026-10-${String(d).padStart(2, '0')}.db`), '')
  writeFileSync(join(dir, 'notes.txt'), '')
  pruneBackups(dir, 14)
  const left = readdirSync(dir).sort()
  expect(left).toHaveLength(15)
  expect(left).toContain('notes.txt')
  expect(left).not.toContain('unios-2026-10-06.db')
  expect(left).toContain('unios-2026-10-07.db')
})

test('runBackup writes a consistent copy that opens with the same data', () => {
  const dir = mkdtempSync(join(tmpdir(), 'unios-bk-'))
  const { db, sqlite } = openDb(join(dir, 'live.db'))
  seedCourse(db, 'Analysis I')
  const file = runBackup(sqlite, join(dir, 'backups'), new Date('2026-10-24T09:00:00'))
  expect(existsSync(file)).toBe(true)
  const copy = new Database(file, { readonly: true })
  expect(copy.prepare('select name from courses').all()).toEqual([{ name: 'Analysis I' }])
  // a second backup on the same day replaces the first instead of failing
  expect(() => runBackup(sqlite, join(dir, 'backups'), new Date('2026-10-24T18:00:00'))).not.toThrow()
})
