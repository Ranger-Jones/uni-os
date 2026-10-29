import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { app, safeStorage } from 'electron'
import { ensureEncryption, inKeychain } from '../safeStore'
import { deriveKeyAsync, makeCheck, newSalt, verifyCheck } from '@core/sync/crypto'
import { getState, markAllDirty, pendingCount, resetSyncState, setState, syncOnce, type SyncResult } from '@core/sync/engine'
import { authErrorMessage, projectUrl } from '@core/sync/projectUrl'
import { SUPABASE_SETUP_SQL } from '@core/sync/setupSql'
import type { AppContext } from '../context'
import { SupabaseRemote } from './supabaseRemote'

export interface SyncStatus {
  configured: boolean
  url: string
  signedInAs: string | null
  passwordSet: boolean
  enabled: boolean
  state: 'off' | 'idle' | 'syncing' | 'error'
  lastSyncAt: string | null
  pending: number
  error: string | null
  lastResult: SyncResult | null
  /** False on Linux without a keyring: secrets are then only protected by file permissions. */
  keychain: boolean
}

const AUTO_DELAY = 5_000
const FULL_INTERVAL = 5 * 60_000

/** Session tokens and the sync key, encrypted with safeStorage (see ensureEncryption for Linux without a keyring). */
class SecureStore {
  private file = () => join(app.getPath('userData'), 'sync-secrets.json')
  private all(): Record<string, string> {
    if (!existsSync(this.file())) return {}
    try {
      return JSON.parse(readFileSync(this.file(), 'utf8')) as Record<string, string>
    } catch {
      return {}
    }
  }
  get(k: string): string | null {
    const enc = this.all()[k]
    if (!enc) return null
    try {
      return safeStorage.decryptString(Buffer.from(enc, 'base64'))
    } catch {
      return null
    }
  }
  set(k: string, v: string | null): void {
    if (v !== null) ensureEncryption()
    const all = this.all()
    if (v === null) delete all[k]
    else all[k] = safeStorage.encryptString(v).toString('base64')
    writeFileSync(this.file(), JSON.stringify(all), { mode: 0o600 })
  }
  clear(prefix: string): void {
    for (const k of Object.keys(this.all())) if (k.startsWith(prefix)) this.set(k, null)
  }
}

/** Keeps this device in sync with the user's Supabase project: on start, shortly after changes and every few minutes. */
export class SyncService {
  private secure = new SecureStore()
  private client: SupabaseClient | null = null
  private clientFor = ''
  private running = false
  private lastRun = 0
  private error: string | null = null
  private lastResult: SyncResult | null = null
  private timers: ReturnType<typeof setInterval>[] = []
  private email: string | null = null

  constructor(
    private ctx: AppContext,
    private emit: (status: SyncStatus) => void,
    private onDataChanged: () => void
  ) {}

  private get cfg() {
    return this.ctx.settings.sync
  }

  private supabase(): SupabaseClient {
    const { url, anonKey } = this.cfg
    if (!url || !anonKey) throw new Error('Enter your Supabase project URL and anon key first.')
    if (!this.client || this.clientFor !== url + anonKey) {
      this.client = createClient(url, anonKey, {
        auth: {
          storage: {
            getItem: (k) => this.secure.get(`auth:${k}`),
            setItem: (k, v) => this.secure.set(`auth:${k}`, v),
            removeItem: (k) => this.secure.set(`auth:${k}`, null)
          },
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      })
      this.clientFor = url + anonKey
    }
    return this.client
  }

  private key(): Buffer | null {
    const k = this.secure.get('key')
    return k ? Buffer.from(k, 'base64') : null
  }

  async status(): Promise<SyncStatus> {
    let user: string | null = null
    if (this.cfg.url && this.cfg.anonKey) {
      try {
        user = (await this.supabase().auth.getSession()).data.session?.user.email ?? null
      } catch {
        user = null
      }
    }
    this.email = user
    const enabled = this.cfg.enabled && !!user && !!this.key()
    return {
      configured: !!(this.cfg.url && this.cfg.anonKey),
      url: this.cfg.url,
      signedInAs: user,
      passwordSet: !!this.key(),
      enabled,
      state: !enabled ? 'off' : this.running ? 'syncing' : this.error ? 'error' : 'idle',
      lastSyncAt: getState(this.ctx.db, 'last_sync'),
      pending: pendingCount(this.ctx.db),
      error: this.error,
      lastResult: this.lastResult,
      keychain: inKeychain()
    }
  }

  private async publish(): Promise<SyncStatus> {
    const s = await this.status()
    this.emit(s)
    return s
  }

  setupSql(): string {
    return SUPABASE_SETUP_SQL
  }

  async configure(input: { url: string; anonKey: string }): Promise<SyncStatus> {
    const clean = projectUrl(input.url)
    const anonKey = input.anonKey.trim()
    if (anonKey.length < 20) throw new Error('Paste the anon (public) key from Project Settings → API.')
    const changed = clean !== this.cfg.url
    if (changed) {
      // Another project: forget the session, the key and what we knew about the old remote.
      this.stop()
      this.secure.clear('auth:')
      this.secure.set('key', null)
      resetSyncState(this.ctx.db)
    }
    this.ctx.updateSettings({ sync: { ...this.cfg, url: clean, anonKey, enabled: changed ? false : this.cfg.enabled, deviceId: this.cfg.deviceId || randomUUID() } })
    this.client = null
    return this.publish()
  }

  async signUp(input: { email: string; password: string }): Promise<{ confirmEmail: boolean }> {
    const { data, error } = await this.supabase().auth.signUp({ email: input.email.trim(), password: input.password })
    if (error) throw new Error(authErrorMessage(error.message))
    await this.publish()
    return { confirmEmail: !data.session }
  }

  async signIn(input: { email: string; password: string }): Promise<SyncStatus> {
    const { error } = await this.supabase().auth.signInWithPassword({ email: input.email.trim(), password: input.password })
    if (error) throw new Error(authErrorMessage(error.message))
    return this.publish()
  }

  async signOut(): Promise<SyncStatus> {
    this.stop()
    try {
      await this.supabase().auth.signOut()
    } catch {
      // signed out locally anyway
    }
    this.secure.clear('auth:')
    this.ctx.updateSettings({ sync: { ...this.cfg, enabled: false } })
    return this.publish()
  }

  private async remote(): Promise<SupabaseRemote> {
    const session = (await this.supabase().auth.getSession()).data.session
    if (!session) throw new Error('Sign in to your Supabase project first.')
    return new SupabaseRemote(this.supabase(), session.user.id, this.cfg.deviceId)
  }

  /** First device: chooses the sync password. Every further device: must enter the same one. */
  async setPassword(input: { password: string }): Promise<SyncStatus> {
    if (input.password.length < 8) throw new Error('Use at least 8 characters for the sync password.')
    const remote = await this.remote()
    const meta = await remote.getMeta()
    let key: Buffer
    if (!meta) {
      const salt = newSalt()
      key = await deriveKeyAsync(input.password, salt)
      await remote.putMeta({ salt, check: makeCheck(key) })
    } else {
      key = await deriveKeyAsync(input.password, meta.salt)
      if (!verifyCheck(key, meta.check)) throw new Error('This is not the sync password used on your other device.')
    }
    this.secure.set('key', key.toString('base64'))
    // Everything that exists on this device goes up once (the other device's data comes down).
    if (getState(this.ctx.db, 'initialized_for') !== this.cfg.url) {
      markAllDirty(this.ctx.db)
      setState(this.ctx.db, 'initialized_for', this.cfg.url)
    }
    this.ctx.updateSettings({ sync: { ...this.cfg, enabled: true } })
    this.start()
    void this.syncNow()
    return this.publish()
  }

  async setEnabled(enabled: boolean): Promise<SyncStatus> {
    this.ctx.updateSettings({ sync: { ...this.cfg, enabled } })
    if (enabled) {
      this.start()
      void this.syncNow()
    } else this.stop()
    return this.publish()
  }

  async syncNow(): Promise<SyncStatus> {
    const key = this.key()
    if (this.running || !this.cfg.enabled || !key) return this.publish()
    this.running = true
    this.lastRun = Date.now()
    await this.publish()
    try {
      const remote = await this.remote()
      const result = await syncOnce({ db: this.ctx.db, filesDir: this.ctx.filesDir, remote, key, deviceId: this.cfg.deviceId })
      this.lastResult = result
      this.error = result.rejected ? `${result.rejected} item(s) from the cloud failed the integrity check and were ignored.` : null
      if (result.pulled || result.blobsDown || result.conflicts) this.onDataChanged()
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.running = false
    }
    return this.publish()
  }

  /** Background schedule; does nothing until sync is enabled. */
  start(): void {
    this.stop()
    if (!this.cfg.enabled) return
    this.timers.push(
      setInterval(() => {
        if (!this.running && Date.now() - this.lastRun > AUTO_DELAY && pendingCount(this.ctx.db) > 0) void this.syncNow()
      }, AUTO_DELAY),
      setInterval(() => void this.syncNow(), FULL_INTERVAL)
    )
    setTimeout(() => void this.syncNow(), 3_000)
  }

  stop(): void {
    for (const t of this.timers) clearInterval(t)
    this.timers = []
  }
}
