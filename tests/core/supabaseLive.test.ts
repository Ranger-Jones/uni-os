// Live test against a real Supabase project (e.g. `supabase start` locally) with the setup SQL applied.
// Runs only when SUPABASE_URL and SUPABASE_ANON_KEY are set:
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… pnpm test tests/core/supabaseLive.test.ts
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from 'vitest'
import * as assignments from '@core/repo/assignments'
import * as courses from '@core/repo/courses'
import * as files from '@core/repo/files'
import * as pages from '@core/repo/pages'
import * as semesters from '@core/repo/semesters'
import { deriveKeyAsync, makeCheck, newSalt, verifyCheck } from '@core/sync/crypto'
import { syncOnce } from '@core/sync/engine'
import { SupabaseRemote } from '../../src/main/sync/supabaseRemote'
import { memDb } from '../helpers/db'
import { para } from '../helpers/fixtures'

const URL = process.env.SUPABASE_URL
const KEY = process.env.SUPABASE_ANON_KEY
const live = test.skipIf(!URL || !KEY)

const client = (): SupabaseClient => createClient(URL!, KEY!, { auth: { persistSession: false, autoRefreshToken: false } })

async function account(c: SupabaseClient, email: string, password = 'live-test-password-1') {
  const up = await c.auth.signUp({ email, password })
  if (up.error && !/registered/i.test(up.error.message)) throw up.error
  const { data, error } = await c.auth.signInWithPassword({ email, password })
  if (error) throw error
  return data.user!.id
}

live('two devices sync through a real Supabase project; other users and anonymous clients see nothing', async () => {
  const email = `unios-live-${Date.now()}@example.com`
  // device A
  const ca = client()
  const uid = await account(ca, email)
  const ra = new SupabaseRemote(ca, uid, 'device-A')
  expect(await ra.getMeta()).toBeNull()
  const salt = newSalt()
  const keyA = await deriveKeyAsync('sync password 123', salt)
  await ra.putMeta({ salt, check: makeCheck(keyA) })

  const a = { db: memDb().db, filesDir: join(mkdtempSync(join(tmpdir(), 'unios-live-a-')), 'files') }
  const s = semesters.create(a.db, { name: 'WS 26/27', startDate: '2026-10-01', endDate: '2027-03-31' })
  const c = courses.create(a.db, { semesterId: s.id, name: 'Virtual Reality', ects: 6 })
  const p = pages.create(a.db, { courseId: c.id, title: 'Scene graphs' })
  pages.updateContent(a.db, p.id, [para('Each node is relative to its parent.')])
  const as = assignments.create(a.db, { courseId: c.id, title: 'Assignment 1', dueAt: '2026-11-05T21:00' })
  const src = mkdtempSync(join(tmpdir(), 'unios-live-src-'))
  writeFileSync(join(src, 'slides.txt'), 'line at infinity')
  const [f] = await files.importFiles(a.db, a.filesDir, c.id, [join(src, 'slides.txt')])
  const upA = await syncOnce({ db: a.db, filesDir: a.filesDir, remote: ra, key: keyA, deviceId: 'device-A' })
  expect(upA.pushed).toBe(5)
  expect(upA.blobsUp).toBe(1)

  // what Supabase stores is ciphertext only
  const { data: raw } = await ca.from('unios_sync').select('entity,payload').neq('entity', '_meta')
  expect(raw!.length).toBe(5)
  expect(JSON.stringify(raw)).not.toMatch(/Scene graphs|Virtual Reality|Assignment 1/)

  // device B: same account, enters the same password
  const cb = client()
  await account(cb, email)
  const rb = new SupabaseRemote(cb, uid, 'device-B')
  const meta = (await rb.getMeta())!
  expect(verifyCheck(await deriveKeyAsync('wrong password', meta.salt), meta.check)).toBe(false)
  const keyB = await deriveKeyAsync('sync password 123', meta.salt)
  expect(verifyCheck(keyB, meta.check)).toBe(true)
  const b = { db: memDb().db, filesDir: join(mkdtempSync(join(tmpdir(), 'unios-live-b-')), 'files') }
  const downB = await syncOnce({ db: b.db, filesDir: b.filesDir, remote: rb, key: keyB, deviceId: 'device-B' })
  expect(downB.pulled).toBe(5)
  expect(downB.blobsDown).toBe(1)
  expect(pages.get(b.db, p.id).contentText).toContain('relative to its parent')
  expect(readFileSync(join(b.filesDir, files.get(b.db, f.id).storedPath), 'utf8')).toBe('line at infinity')

  // B edits, A receives
  assignments.update(b.db, as.id, { status: 'done' })
  await syncOnce({ db: b.db, filesDir: b.filesDir, remote: rb, key: keyB, deviceId: 'device-B' })
  await syncOnce({ db: a.db, filesDir: a.filesDir, remote: ra, key: keyA, deviceId: 'device-A' })
  expect(assignments.list(a.db, {})[0].status).toBe('done')

  // another user: no rows, no meta, no files of the first user
  const co = client()
  const other = await account(co, `unios-live-other-${Date.now()}@example.com`)
  const ro = new SupabaseRemote(co, other, 'device-X')
  expect(await ro.pull(0, 100)).toEqual([])
  expect(await ro.getMeta()).toBeNull()
  const stolen = await co.storage.from('unios-files').download(`${uid}/file/${f.id}`)
  expect(stolen.data).toBeNull()
  // writing into the first user's space is refused
  const forged = await co.from('unios_sync').insert({ user_id: uid, entity: 'assignments', id: 'x', payload: 'x', deleted: false, updated_at: new Date().toISOString(), device_id: 'evil' })
  expect(forged.error).not.toBeNull()

  // no login: nothing
  const anon = client()
  const { data: anonRows } = await anon.from('unios_sync').select('id')
  expect(anonRows ?? []).toEqual([])
  expect(existsSync(join(b.filesDir, files.get(b.db, f.id).storedPath))).toBe(true)
}, 120_000)
