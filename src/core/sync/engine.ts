// Two-way sync of the local database with a remote store: pull remote changes, merge, then push local changes.
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { sql } from 'drizzle-orm'
import type { Db } from '../db/open'
import { blocksToText } from '../domain/blocks'
import { resolveInside } from '../paths'
import * as assignments from '../repo/assignments'
import * as files from '../repo/files'
import * as links from '../repo/links'
import * as pages from '../repo/pages'
import * as tests from '../repo/tests'
import { decryptBytes, decryptJson, encryptBytes, encryptJson } from './crypto'
import { mergeDocuments } from './merge'
import type { RemoteRow, SyncRemote } from './remote'
import { isSyncTable, SYNC_TABLES } from './tables'

type Row = Record<string, unknown>
type Outbox = { entity: string; id: string; deleted: number; rev: number }
type Known = { updated_at: string; deleted: number; base: string | null }

/** Files above this size (and all audio/video) stay on their device. */
export const MAX_BLOB_BYTES = 50 * 1024 * 1024
/** Rows re-read before the cursor, in case a slower writer committed a smaller seq late. */
const OVERLAP = 100
const PULL_PAGE = 500
const PUSH_BATCH_BYTES = 700_000

export interface SyncOptions {
  db: Db
  filesDir: string
  remote: SyncRemote
  key: Buffer
  deviceId: string
  maxBlobBytes?: number
}

export interface SyncResult {
  pulled: number
  pushed: number
  conflicts: number
  /** Remote rows dropped because their parent does not exist (e.g. deleted meanwhile). */
  dropped: number
  blobsUp: number
  blobsDown: number
}

const table = (t: string) => sql.identifier(t)

export function getState(db: Db, key: string): string | null {
  return db.get<{ value: string }>(sql`SELECT value FROM sync_state WHERE key = ${key}`)?.value ?? null
}

export function setState(db: Db, key: string, value: string | null): void {
  db.run(sql`INSERT INTO sync_state (key, value) VALUES (${key}, ${value}) ON CONFLICT (key) DO UPDATE SET value = excluded.value`)
}

/** Local changes not yet uploaded. */
export const pendingCount = (db: Db): number => db.get<{ n: number }>(sql`SELECT count(*) AS n FROM sync_outbox`)!.n

/** Queue every existing row for upload (when sync is turned on for a database that already has data). */
export function markAllDirty(db: Db): void {
  for (const t of SYNC_TABLES) db.run(sql`INSERT INTO sync_outbox (entity, id, deleted, rev) SELECT ${t}, id, 0, 1 FROM ${table(t)} WHERE true ON CONFLICT (entity, id) DO NOTHING`)
}

/** Forget everything about the remote (e.g. after switching to another Supabase project). */
export function resetSyncState(db: Db): void {
  db.run(sql`DELETE FROM sync_known`)
  db.run(sql`DELETE FROM sync_blobs`)
  db.run(sql`DELETE FROM sync_state WHERE key <> 'applying'`)
}

const rowOf = (db: Db, t: string, id: string) => db.get<Row>(sql`SELECT * FROM ${table(t)} WHERE id = ${id}`)
const outboxOf = (db: Db, t: string, id: string) => db.get<Outbox>(sql`SELECT * FROM sync_outbox WHERE entity = ${t} AND id = ${id}`)
const knownOf = (db: Db, t: string, id: string) => db.get<Known>(sql`SELECT updated_at, deleted, base FROM sync_known WHERE entity = ${t} AND id = ${id}`)
const stamp = (row: Row): string => String(row.updated_at ?? row.created_at ?? new Date(0).toISOString())

function setKnown(db: Db, t: string, id: string, updatedAt: string, deleted: boolean, base: string | null): void {
  db.run(sql`INSERT INTO sync_known (entity, id, updated_at, deleted, base) VALUES (${t}, ${id}, ${updatedAt}, ${deleted ? 1 : 0}, ${base})
    ON CONFLICT (entity, id) DO UPDATE SET updated_at = excluded.updated_at, deleted = excluded.deleted, base = excluded.base`)
}

const columnCache = new WeakMap<Db, Map<string, string[]>>()
function columns(db: Db, t: string): string[] {
  let cache = columnCache.get(db)
  if (!cache) columnCache.set(db, (cache = new Map()))
  if (!cache.has(t)) cache.set(t, db.all<{ name: string }>(sql`SELECT name FROM pragma_table_info(${t})`).map((c) => c.name))
  return cache.get(t)!
}

/** Insert or update in place (never REPLACE: that would delete the row first and cascade to its children). */
function writeRow(db: Db, t: string, row: Row): void {
  const cols = columns(db, t).filter((c) => c in row)
  const names = sql.join(cols.map((c) => sql.identifier(c)), sql`, `)
  const values = sql.join(cols.map((c) => sql`${row[c] as string | number | null}`), sql`, `)
  const sets = sql.join(cols.filter((c) => c !== 'id').map((c) => sql`${sql.identifier(c)} = excluded.${sql.identifier(c)}`), sql`, `)
  db.run(sql`INSERT INTO ${table(t)} (${names}) VALUES (${values}) ON CONFLICT (id) DO UPDATE SET ${sets}`)
}

const baseOf = (t: string, row: Row | null | undefined): string | null => (t === 'pages' && row ? String(row.content ?? '[]') : null)

/** Remove (or for SET NULL references: unlink) rows whose parent is missing; returns how many rows were removed. */
function dropOrphans(db: Db): number {
  let removed = 0
  for (let round = 0; round < 10; round++) {
    const violations = db.all<{ table: string; rowid: number; fkid: number }>(sql`SELECT * FROM pragma_foreign_key_check`)
    if (!violations.length) break
    for (const v of violations) {
      const fk = db.all<{ id: number; from: string; on_delete: string }>(sql`SELECT * FROM pragma_foreign_key_list(${v.table})`).find((f) => f.id === v.fkid)
      if (fk?.on_delete === 'SET NULL') db.run(sql`UPDATE ${table(v.table)} SET ${sql.identifier(fk.from)} = NULL WHERE rowid = ${v.rowid}`)
      else {
        db.run(sql`DELETE FROM ${table(v.table)} WHERE rowid = ${v.rowid}`)
        removed++
      }
    }
  }
  return removed
}

/** Keep search, page links etc. in step with rows that sync wrote directly. */
function refreshDerived(db: Db, t: string, id: string): void {
  if (t === 'pages') pages.refreshDerived(db, id)
  else if (t === 'assignments') assignments.reindexById(db, id)
  else if (t === 'files') files.reindexById(db, id)
  else if (t === 'course_links') links.reindexById(db, id)
  else if (t === 'tests') tests.reindexById(db, id)
  else if (t === 'test_questions') {
    const q = rowOf(db, t, id)
    if (q) tests.reindexById(db, String(q.test_id))
  }
}

// ----- files -----

const ASSET_URL = /unios-file:\/\/local\/(assets\/[^"'\s)\\]+)/g
const assetPaths = (content: string): string[] => [...new Set([...content.matchAll(ASSET_URL)].map((m) => m[1].split('/').map(decodeURIComponent).join('/')))]

const blobState = (db: Db, key: string) => db.get<{ state: string }>(sql`SELECT state FROM sync_blobs WHERE key = ${key}`)?.state ?? null
const setBlobState = (db: Db, key: string, state: string) =>
  db.run(sql`INSERT INTO sync_blobs (key, state) VALUES (${key}, ${state}) ON CONFLICT (key) DO UPDATE SET state = excluded.state`)
const syncable = (row: Row, max: number) => Number(row.size ?? 0) <= max && !/^(video|audio)\//.test(String(row.mime ?? ''))

async function uploadBlob(o: SyncOptions, blobKey: string, relPath: string): Promise<boolean> {
  if (blobState(o.db, blobKey) === 'uploaded') return false
  const abs = resolveInside(o.filesDir, relPath)
  if (!abs || !existsSync(abs)) return false
  await o.remote.putBlob(blobKey, encryptBytes(o.key, readFileSync(abs)))
  setBlobState(o.db, blobKey, 'uploaded')
  return true
}

async function downloadBlob(o: SyncOptions, blobKey: string, relPath: string): Promise<boolean> {
  const abs = resolveInside(o.filesDir, relPath)
  if (!abs || existsSync(abs)) return false
  const data = await o.remote.getBlob(blobKey)
  if (!data) return false
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, decryptBytes(o.key, data))
  setBlobState(o.db, blobKey, 'uploaded')
  return true
}

// ----- the sync round -----

export async function syncOnce(o: SyncOptions): Promise<SyncResult> {
  const { db, remote, key, deviceId } = o
  const max = o.maxBlobBytes ?? MAX_BLOB_BYTES
  const result: SyncResult = { pulled: 0, pushed: 0, conflicts: 0, dropped: 0, blobsUp: 0, blobsDown: 0 }

  // 1. Pull everything new (all pages first, so parents and children are applied together).
  const cursor = Number(getState(db, 'cursor') ?? 0)
  let after = Math.max(0, cursor - OVERLAP)
  let highest = cursor
  const latest = new Map<string, RemoteRow>()
  for (;;) {
    const page = await remote.pull(after, PULL_PAGE)
    for (const r of page) latest.set(`${r.entity}\u0000${r.id}`, r)
    if (page.length) {
      after = page.at(-1)!.seq
      highest = Math.max(highest, after)
    }
    if (page.length < PULL_PAGE) break
  }
  const incoming = [...latest.values()].filter((r) => {
    if (r.device_id === deviceId || !isSyncTable(r.entity)) return false
    const k = knownOf(db, r.entity, r.id)
    return !(k && k.updated_at >= r.updated_at && k.deleted === (r.deleted ? 1 : 0))
  })
  const decoded = incoming.map((r) => ({ r, row: r.deleted || !r.payload ? null : decryptJson<Row>(key, r.payload) }))

  // 2. Apply in one transaction; foreign keys are checked at commit, orphans removed before.
  const touched: { t: string; id: string; deleted: boolean }[] = []
  const order = (t: string) => SYNC_TABLES.indexOf(t as never)
  db.transaction((tx) => {
    const t0 = tx as unknown as Db
    t0.run(sql`PRAGMA defer_foreign_keys = ON`)
    setState(t0, 'applying', '1')
    try {
      for (const { r, row } of decoded.filter((d) => d.row).sort((a, b) => order(a.r.entity) - order(b.r.entity))) {
        const t = r.entity
        const local = rowOf(t0, t, r.id)
        const out = outboxOf(t0, t, r.id)
        const known = knownOf(t0, t, r.id)
        const take = () => {
          writeRow(t0, t, row!)
          t0.run(sql`DELETE FROM sync_outbox WHERE entity = ${t} AND id = ${r.id}`)
          touched.push({ t, id: r.id, deleted: false })
        }
        if (!out) take()
        else if (out.deleted) {
          // deleted here, edited there: the edit wins if it is newer than what we last saw
          if (!known || r.updated_at > known.updated_at) take()
        } else if (local) {
          result.conflicts++
          const localNewer = stamp(local) >= r.updated_at
          if (t === 'pages') {
            const base = known?.base ? (JSON.parse(known.base) as unknown[]) : null
            const merged = mergeDocuments(base, JSON.parse(String(local.content || '[]')) as unknown[], JSON.parse(String(row!.content || '[]')) as unknown[], { localIsNewer: localNewer })
            const newest = new Date(Math.max(Date.parse(stamp(local)), Date.parse(r.updated_at)) + 1).toISOString()
            writeRow(t0, t, { ...(localNewer ? local : row!), content: JSON.stringify(merged), content_text: blocksToText(merged), updated_at: newest })
            touched.push({ t, id: r.id, deleted: false }) // stays in the outbox: the merged version goes back up
          } else if (!localNewer) take()
        } else take()
        setKnown(t0, t, r.id, r.updated_at, false, baseOf(t, row))
      }
      for (const { r } of decoded.filter((d) => !d.row).sort((a, b) => order(b.r.entity) - order(a.r.entity))) {
        const t = r.entity
        const out = outboxOf(t0, t, r.id)
        if (!(out && !out.deleted && rowOf(t0, t, r.id))) {
          // an edit here would win over the remote delete (it is pushed below and brings the row back)
          t0.run(sql`DELETE FROM ${table(t)} WHERE id = ${r.id}`)
          t0.run(sql`DELETE FROM sync_outbox WHERE entity = ${t} AND id = ${r.id}`)
          touched.push({ t, id: r.id, deleted: true })
        }
        setKnown(t0, t, r.id, r.updated_at, true, null)
      }
      result.dropped = dropOrphans(t0)
    } finally {
      setState(t0, 'applying', '0')
    }
  })
  result.pulled = decoded.length
  setState(db, 'cursor', String(highest))
  for (const x of touched) if (!x.deleted) refreshDerived(db, x.t, x.id)

  // 3. Files and note images that arrived without their content.
  for (const f of db.all<Row>(sql`SELECT id, stored_path, size, mime FROM files`))
    if (syncable(f, max) && (await downloadBlob(o, `file/${f.id}`, String(f.stored_path)))) result.blobsDown++
  for (const x of touched.filter((x) => x.t === 'pages' && !x.deleted)) {
    const p = rowOf(db, 'pages', x.id)
    for (const rel of assetPaths(String(p?.content ?? ''))) if (await downloadBlob(o, `asset/${rel}`, rel)) result.blobsDown++
  }

  // 4. Push local changes in size-limited batches; an entry leaves the outbox only if it did not change meanwhile.
  const pending = db.all<Outbox>(sql`SELECT * FROM sync_outbox ORDER BY rowid`)
  let batch: { out: Outbox; row: Omit<RemoteRow, 'seq'>; base: string | null }[] = []
  let size = 0
  const flush = async () => {
    if (!batch.length) return
    await remote.push(batch.map((b) => b.row))
    db.transaction((tx) => {
      const t0 = tx as unknown as Db
      for (const b of batch) {
        t0.run(sql`DELETE FROM sync_outbox WHERE entity = ${b.out.entity} AND id = ${b.out.id} AND rev = ${b.out.rev}`)
        setKnown(t0, b.out.entity, b.out.id, b.row.updated_at, b.row.deleted, b.base)
      }
    })
    result.pushed += batch.length
    batch = []
    size = 0
  }
  for (const out of pending) {
    if (!isSyncTable(out.entity)) continue
    const row = out.deleted ? null : rowOf(db, out.entity, out.id)
    if (row && out.entity === 'files' && syncable(row, max)) {
      if (await uploadBlob(o, `file/${row.id}`, String(row.stored_path))) result.blobsUp++
    } else if (row && out.entity === 'files') setBlobState(db, `file/${row.id}`, 'skipped')
    if (row && out.entity === 'pages') for (const rel of assetPaths(String(row.content ?? ''))) if (await uploadBlob(o, `asset/${rel}`, rel)) result.blobsUp++
    const payload = row ? encryptJson(key, row) : null
    batch.push({
      out,
      row: { entity: out.entity, id: out.id, payload, deleted: !row, updated_at: row ? stamp(row) : new Date().toISOString(), device_id: deviceId },
      base: baseOf(out.entity, row)
    })
    size += payload?.length ?? 100
    if (size >= PUSH_BATCH_BYTES) await flush()
  }
  await flush()
  setState(db, 'last_sync', new Date().toISOString())
  return result
}
