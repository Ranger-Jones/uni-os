import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { eq, sql } from 'drizzle-orm'
import { beforeAll, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { assignments as assignmentsTable } from '@core/db/schema'
import * as assignments from '@core/repo/assignments'
import * as courses from '@core/repo/courses'
import * as files from '@core/repo/files'
import * as pages from '@core/repo/pages'
import * as search from '@core/repo/search'
import * as semesters from '@core/repo/semesters'
import { deriveKey, newSalt } from '@core/sync/crypto'
import { pendingCount, markAllDirty, syncOnce } from '@core/sync/engine'
import { FakeRemote } from '@core/sync/fakeRemote'
import { memDb } from '../helpers/db'
import { para } from '../helpers/fixtures'

let key: Buffer
beforeAll(() => {
  key = deriveKey('sync-test-password', newSalt())
}, 30_000)

function device(name: string) {
  const { db } = memDb()
  const filesDir = join(mkdtempSync(join(tmpdir(), `unios-sync-${name}-`)), 'files')
  return { db, filesDir, deviceId: name }
}
type Device = ReturnType<typeof device>
const sync = (d: Device, remote: FakeRemote, maxBlobBytes?: number) => syncOnce({ db: d.db, filesDir: d.filesDir, remote, key, deviceId: d.deviceId, maxBlobBytes })

function seed(db: Db) {
  const s = semesters.create(db, { name: 'WS 26/27', startDate: '2026-10-01', endDate: '2027-03-31' })
  const c = courses.create(db, { semesterId: s.id, name: 'Virtual Reality', ects: 6 })
  return { s, c }
}

test('data created on one device appears on the other, with search and page links rebuilt', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { c } = seed(a.db)
  const target = pages.create(a.db, { courseId: c.id, title: 'Quaternions' })
  const p = pages.create(a.db, { courseId: c.id, title: 'Gimbal lock' })
  pages.updateContent(a.db, p.id, [
    para('Two axes align and a degree of freedom is lost.'),
    { id: 'm', type: 'paragraph', props: {}, content: [{ type: 'pageMention', props: { pageId: target.id } }], children: [] }
  ])
  assignments.create(a.db, { courseId: c.id, title: 'Assignment 1', dueAt: '2026-11-05T21:00' })
  expect(pendingCount(a.db)).toBeGreaterThan(0)

  const pushed = await sync(a, remote)
  expect(pushed.pushed).toBeGreaterThanOrEqual(5)
  expect(pendingCount(a.db)).toBe(0)
  // the cloud only holds ciphertext
  expect(JSON.stringify(remote.rows)).not.toContain('Gimbal')

  const pulled = await sync(b, remote)
  expect(pulled.pulled).toBeGreaterThanOrEqual(5)
  expect(courses.get(b.db, c.id).name).toBe('Virtual Reality')
  expect(pages.get(b.db, p.id).contentText).toContain('degree of freedom')
  expect(search.query(b.db, 'gimbal').map((h) => h.entityId)).toContain(p.id)
  expect(pages.backlinks(b.db, target.id).map((x) => x.id)).toEqual([p.id])
  expect(assignments.list(b.db, { courseId: c.id })[0].dueAt).toBe('2026-11-05T21:00')
  // applying remote rows does not echo them back
  expect(pendingCount(b.db)).toBe(0)
  // a second round changes nothing
  expect(await sync(b, remote)).toMatchObject({ pulled: 0, pushed: 0 })
}, 30_000)

test('updates and deletes flow both ways, including cascades', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { s, c } = seed(a.db)
  const as = assignments.create(a.db, { courseId: c.id, title: 'Blatt 1' })
  await sync(a, remote)
  await sync(b, remote)

  assignments.update(b.db, as.id, { title: 'Blatt 1 (korrigiert)', status: 'done' })
  await sync(b, remote)
  await sync(a, remote)
  expect(assignments.list(a.db, {})[0]).toMatchObject({ title: 'Blatt 1 (korrigiert)', status: 'done' })

  courses.remove(a.db, c.id)
  await sync(a, remote)
  await sync(b, remote)
  expect(courses.list(b.db, { semesterId: s.id })).toHaveLength(0)
  expect(assignments.list(b.db, {})).toHaveLength(0)
}, 30_000)

test('changes made directly in the database (e.g. by the MCP server) are synced too', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { c } = seed(a.db)
  const as = assignments.create(a.db, { courseId: c.id, title: 'Old' })
  await sync(a, remote)
  await sync(b, remote)
  a.db.update(assignmentsTable).set({ title: 'Changed outside the app', updatedAt: new Date(Date.now() + 1000).toISOString() }).where(eq(assignmentsTable.id, as.id)).run()
  await sync(a, remote)
  await sync(b, remote)
  expect(assignments.list(b.db, {})[0].title).toBe('Changed outside the app')
}, 30_000)

test('conflicting edits of a row: the newer one wins on both devices', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { c } = seed(a.db)
  const as = assignments.create(a.db, { courseId: c.id, title: 'Base' })
  await sync(a, remote)
  await sync(b, remote)
  assignments.update(a.db, as.id, { title: 'Older edit on A' })
  await new Promise((r) => setTimeout(r, 15))
  assignments.update(b.db, as.id, { title: 'Newer edit on B' })
  await sync(a, remote)
  await sync(b, remote)
  await sync(a, remote)
  expect(assignments.list(a.db, {})[0].title).toBe('Newer edit on B')
  expect(assignments.list(b.db, {})[0].title).toBe('Newer edit on B')
}, 30_000)

test('the same note edited on both devices is merged block by block', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { c } = seed(a.db)
  const p = pages.create(a.db, { courseId: c.id, title: 'Notes' })
  const blk = (id: string, text: string) => ({ ...para(text), id })
  pages.updateContent(a.db, p.id, [blk('1', 'one'), blk('2', 'two'), blk('3', 'three')])
  await sync(a, remote)
  await sync(b, remote)
  pages.updateContent(a.db, p.id, [blk('1', 'ONE from A'), blk('2', 'two'), blk('3', 'three')])
  pages.updateContent(b.db, p.id, [blk('1', 'one'), blk('2', 'two'), blk('3', 'THREE from B'), blk('4', 'new on B')])
  await sync(a, remote)
  const r = await sync(b, remote)
  expect(r.conflicts).toBe(1)
  await sync(a, remote)
  for (const d of [a, b]) {
    const text = pages.get(d.db, p.id).contentText
    expect(text).toContain('ONE from A')
    expect(text).toContain('THREE from B')
    expect(text).toContain('new on B')
  }
}, 30_000)

test('an edit wins over a delete of the same row', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { c } = seed(a.db)
  const as = assignments.create(a.db, { courseId: c.id, title: 'Keep me' })
  await sync(a, remote)
  await sync(b, remote)
  assignments.remove(a.db, as.id)
  assignments.update(b.db, as.id, { title: 'Keep me (edited)' })
  await sync(a, remote)
  await sync(b, remote)
  await sync(a, remote)
  expect(assignments.list(a.db, {}).map((x) => x.title)).toEqual(['Keep me (edited)'])
  expect(assignments.list(b.db, {}).map((x) => x.title)).toEqual(['Keep me (edited)'])
}, 30_000)

test('existing data is pushed once sync is turned on; both devices end up with the union', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  seed(a.db)
  const sb = semesters.create(b.db, { name: 'SS 27', startDate: '2027-04-01', endDate: '2027-09-30' })
  // simulate data from before sync existed: empty outbox, then turn sync on
  for (const d of [a, b]) d.db.run(sql`DELETE FROM sync_outbox`)
  markAllDirty(a.db)
  markAllDirty(b.db)
  await sync(a, remote)
  await sync(b, remote)
  await sync(a, remote)
  expect(semesters.list(a.db).map((s) => s.name).sort()).toEqual(['SS 27', 'WS 26/27'])
  expect(semesters.list(b.db).map((s) => s.id)).toContain(sb.id)
}, 30_000)

test('small files travel encrypted; big files and videos stay local', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { c } = seed(a.db)
  const dir = mkdtempSync(join(tmpdir(), 'unios-sync-src-'))
  writeFileSync(join(dir, 'Skript.txt'), 'Homogeneous coordinates')
  writeFileSync(join(dir, 'Big.txt'), 'x'.repeat(5000))
  const [small, big] = await files.importFiles(a.db, a.filesDir, c.id, [join(dir, 'Skript.txt'), join(dir, 'Big.txt')])
  await sync(a, remote, 1000)
  expect([...remote.blobs.keys()]).toEqual([`file/${small.id}`])
  expect(Buffer.from(remote.blobs.get(`file/${small.id}`)!).toString()).not.toContain('Homogeneous')
  await sync(b, remote, 1000)
  expect(readFileSync(join(b.filesDir, files.get(b.db, small.id).storedPath), 'utf8')).toBe('Homogeneous coordinates')
  // the big file's entry (and its text) is there, the file itself not
  expect(files.get(b.db, big.id).name).toBe('Big.txt')
  expect(existsSync(join(b.filesDir, files.get(b.db, big.id).storedPath))).toBe(false)
}, 30_000)

test('remote rows whose parent never arrives are dropped instead of breaking the sync', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { c } = seed(a.db)
  assignments.create(a.db, { courseId: c.id, title: 'Orphan' })
  await sync(a, remote)
  remote.rows = remote.rows.filter((r) => r.entity !== 'courses')
  const r = await sync(b, remote)
  expect(r.dropped).toBe(1)
  expect(assignments.list(b.db, {})).toHaveLength(0)
}, 30_000)

test('tampering in the cloud is rejected: forged deletes, swapped payloads, changed timestamps, swapped files', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { c } = seed(a.db)
  const x = assignments.create(a.db, { courseId: c.id, title: 'X' })
  const y = assignments.create(a.db, { courseId: c.id, title: 'Y' })
  const dir = mkdtempSync(join(tmpdir(), 'unios-sync-src-'))
  writeFileSync(join(dir, 'one.txt'), 'one')
  writeFileSync(join(dir, 'two.txt'), 'two')
  const [f1, f2] = await files.importFiles(a.db, a.filesDir, c.id, [join(dir, 'one.txt'), join(dir, 'two.txt')])
  await sync(a, remote)
  await sync(b, remote)

  const rowFor = (id: string) => remote.rows.find((r) => r.id === id)!
  const bump = (r: (typeof remote.rows)[number], patch: Partial<(typeof remote.rows)[number]>) => {
    remote.rows = remote.rows.filter((q) => q !== r)
    remote.rows.push({ ...r, ...patch, device_id: 'attacker', seq: Math.max(...remote.rows.map((q) => q.seq)) + 1 })
  }
  // 1. a deletion without a valid encrypted receipt
  bump(rowFor(x.id), { deleted: true, payload: null, updated_at: new Date(Date.now() + 60_000).toISOString() })
  // 2. Y's entry carrying X's (valid) ciphertext
  bump(rowFor(y.id), { payload: rowFor(x.id).payload ?? remote.rows.find((r) => r.entity === 'assignments' && r.id !== y.id)!.payload, updated_at: new Date(Date.now() + 60_000).toISOString() })
  const r1 = await sync(b, remote)
  expect(r1.rejected).toBe(2)
  expect(assignments.list(b.db, {}).map((z) => z.title).sort()).toEqual(['X', 'Y'])

  // 3. a valid ciphertext with a changed timestamp
  const course = rowFor(c.id)
  bump(course, { updated_at: new Date(Date.now() + 120_000).toISOString() })
  expect((await sync(b, remote)).rejected).toBe(1)
  bump(rowFor(c.id), { ...course }) // undo, so a fresh device gets the course again

  // 4. file blobs swapped: the downloaded file must not end up under the other name
  const c2 = device('C')
  const blob1 = remote.blobs.get(`file/${f1.id}`)!
  remote.blobs.set(`file/${f1.id}`, remote.blobs.get(`file/${f2.id}`)!)
  remote.blobs.set(`file/${f2.id}`, blob1)
  await sync(c2, remote)
  expect(existsSync(join(c2.filesDir, files.get(c2.db, f1.id).storedPath))).toBe(false)
}, 30_000)

test('replaying an older (validly encrypted) version from the cloud does not roll a row back', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { c } = seed(a.db)
  const as = assignments.create(a.db, { courseId: c.id, title: 'v1' })
  await sync(a, remote)
  await sync(b, remote)
  const old = { ...remote.rows.find((r) => r.id === as.id)! }
  assignments.remove(a.db, as.id)
  await sync(a, remote)
  await sync(b, remote)
  expect(assignments.list(b.db, {})).toHaveLength(0)
  // the attacker puts the old row back
  remote.rows = remote.rows.filter((r) => r.id !== as.id)
  remote.rows.push({ ...old, seq: Math.max(...remote.rows.map((r) => r.seq)) + 1 })
  await sync(b, remote)
  expect(assignments.list(b.db, {})).toHaveLength(0)
}, 30_000)

test('a device whose clock runs late still gets its edits through', async () => {
  const remote = new FakeRemote()
  const a = device('A')
  const b = device('B')
  const { c } = seed(a.db)
  const as = assignments.create(a.db, { courseId: c.id, title: 'v1' })
  await sync(a, remote)
  await sync(b, remote)
  // B edits, but its clock is an hour behind
  b.db.update(assignmentsTable).set({ title: 'edited on B', updatedAt: new Date(Date.now() - 3_600_000).toISOString() }).where(eq(assignmentsTable.id, as.id)).run()
  await sync(b, remote)
  await sync(a, remote)
  expect(assignments.list(a.db, {})[0].title).toBe('edited on B')
}, 30_000)
