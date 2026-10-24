import Database from 'better-sqlite3'
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3'
import { migrations } from './migrations'
import * as schema from './schema'

export type Db = BetterSQLite3Database<typeof schema>
export type Sqlite = Database.Database

export interface DbHandle {
  sqlite: Sqlite
  db: Db
}

export function openDb(path: string): DbHandle {
  const sqlite = new Database(path)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('foreign_keys = ON')
  sqlite.pragma('busy_timeout = 5000')
  migrate(sqlite)
  return { sqlite, db: drizzle(sqlite, { schema }) }
}

export function migrate(sqlite: Sqlite): void {
  const current = sqlite.pragma('user_version', { simple: true }) as number
  for (let i = current; i < migrations.length; i++) {
    sqlite.transaction(() => {
      sqlite.exec(migrations[i])
      sqlite.pragma(`user_version = ${i + 1}`)
    })()
  }
}

/** Changes whenever another connection commits to the same database file. */
export function dataVersion(sqlite: Sqlite): number {
  return sqlite.pragma('data_version', { simple: true }) as number
}
