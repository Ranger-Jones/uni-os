// In-app updates from GitHub releases.
// - macOS: download the release .zip, verify its SHA-256, swap the app bundle after quitting (own updater,
//   because Squirrel.Mac requires a paid Developer ID signature).
// - Windows / Linux AppImage: electron-updater.
// - Other Linux packages: notify and offer the download.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { accessSync, constants, createWriteStream, existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ReadableStream as WebReadableStream } from 'node:stream/web'
import { app, net, shell } from 'electron'
import electronUpdater from 'electron-updater'
import { macSwapScript } from '@core/macSwap'
import { compareVersions, parseChecksums, parseRelease, type ReleaseInfo, UPDATE_REPO, updateAssetFor, type UpdatePlan } from '@core/update'
import type { AppContext } from './context'

export type UpdateState =
  | { status: 'idle' | 'checking' | 'up-to-date'; checkedAt?: string }
  | { status: 'available'; release: ReleaseInfo; canInstall: boolean }
  | { status: 'downloading'; release: ReleaseInfo; progress: number }
  | { status: 'ready'; release: ReleaseInfo }
  | { status: 'error'; message: string; release?: ReleaseInfo }

const CHECK_EVERY_MS = 6 * 3600 * 1000
/** For testing against a local feed: <feed>/latest.json and <feed>/tags/<tag>.json */
const FEED = process.env.UNIOS_UPDATE_FEED

export class Updater {
  state: UpdateState = { status: 'idle' }
  private plan: UpdatePlan | null = null
  private stagedApp: string | null = null
  private whatsNew: Promise<ReleaseInfo | null> = Promise.resolve(null)

  constructor(
    private ctx: AppContext,
    private emit: (s: UpdateState) => void
  ) {}

  private set(s: UpdateState): UpdateState {
    this.state = s
    this.emit(s)
    return s
  }

  private get enabled(): boolean {
    return app.isPackaged || !!FEED
  }

  private async fetchJson(path: string): Promise<unknown> {
    const url = FEED ? `${FEED}/${path === 'latest' ? 'latest.json' : `tags/${path}.json`}` : `https://api.github.com/repos/${UPDATE_REPO}/releases/${path === 'latest' ? 'latest' : `tags/${path}`}`
    const res = await net.fetch(url, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': `UniOS/${app.getVersion()}` } })
    if (!res.ok) throw new Error(`Update server answered ${res.status}`)
    return res.json()
  }

  /** Called once at startup: prepares "What's new" and schedules background checks. */
  start(): void {
    const current = app.getVersion()
    const seen = this.ctx.settings.lastSeenVersion
    if (!seen) this.ctx.updateSettings({ lastSeenVersion: current })
    else if (compareVersions(current, seen) > 0 && this.enabled) {
      this.whatsNew = this.fetchJson(`v${current}`)
        .then((json) => parseRelease(json))
        .catch(() => {
          this.ctx.updateSettings({ lastSeenVersion: current })
          return null
        })
    }
    if (!this.enabled) return
    const tick = () => this.ctx.settings.checkUpdates && void this.check().catch(() => {})
    setTimeout(tick, 8_000)
    setInterval(tick, CHECK_EVERY_MS)
  }

  /** Release notes of the version just updated to (once), waiting for them if they are still loading. */
  whatsNewRelease(): Promise<ReleaseInfo | null> {
    return this.whatsNew
  }

  dismissWhatsNew(): void {
    this.whatsNew = Promise.resolve(null)
    this.ctx.updateSettings({ lastSeenVersion: app.getVersion() })
  }

  async check(): Promise<UpdateState> {
    if (!this.enabled) return this.set({ status: 'error', message: 'Updates are only available in the installed app.' })
    if (this.state.status === 'downloading' || this.state.status === 'ready') return this.state
    this.set({ status: 'checking' })
    try {
      const release = parseRelease(await this.fetchJson('latest'))
      if (!release || compareVersions(release.version, app.getVersion()) <= 0) return this.set({ status: 'up-to-date', checkedAt: new Date().toISOString() })
      this.plan = updateAssetFor(release, process.platform, process.arch, { appImage: !!process.env.APPIMAGE })
      return this.set({ status: 'available', release, canInstall: !!this.plan && this.plan.kind !== 'manual' && this.canReplaceApp() })
    } catch (err) {
      return this.set({ status: 'error', message: `Could not check for updates: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  /** Path of the running .app bundle (macOS). */
  private bundlePath(): string {
    return resolve(process.execPath, '..', '..', '..')
  }

  private canReplaceApp(): boolean {
    if (process.platform !== 'darwin') return true
    const bundle = this.bundlePath()
    if (!bundle.endsWith('.app') || bundle.startsWith('/Volumes/')) return false
    try {
      accessSync(dirname(bundle), constants.W_OK)
      accessSync(bundle, constants.W_OK)
      return true
    } catch {
      return false
    }
  }

  /** Download (and on macOS verify + unpack) the update. Falls back to the browser download if it cannot install itself. */
  async download(): Promise<UpdateState> {
    const s = this.state
    if (s.status !== 'available' && s.status !== 'error') return s
    const release = s.release
    if (!release || !this.plan) return this.set({ status: 'error', message: 'No update to download.' })
    if (this.plan.kind === 'manual' || !this.canReplaceApp()) {
      const target = this.plan.kind === 'mac-zip' ? (this.plan.fallback ?? this.plan.asset) : this.plan.asset
      await shell.openExternal(target.url)
      return this.set({ status: 'available', release, canInstall: false })
    }
    this.set({ status: 'downloading', release, progress: 0 })
    try {
      if (this.plan.kind === 'mac-zip') await this.downloadMac(release, this.plan.asset)
      else await this.downloadWithElectronUpdater(release)
      return this.set({ status: 'ready', release })
    } catch (err) {
      return this.set({ status: 'error', release, message: `Update failed: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  private async downloadMac(release: ReleaseInfo, asset: { name: string; url: string; size: number }): Promise<void> {
    const sumsAsset = release.assets.find((a) => a.name === 'SHA256SUMS.txt')
    if (!sumsAsset) throw new Error('the release has no checksums')
    const expected = parseChecksums(await (await net.fetch(sumsAsset.url)).text()).get(asset.name)
    if (!expected) throw new Error(`no checksum for ${asset.name}`)

    const dir = join(tmpdir(), `unios-update-${release.version}`)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const zip = join(dir, asset.name)
    const res = await net.fetch(asset.url)
    if (!res.ok || !res.body) throw new Error(`download failed (${res.status})`)
    const total = Number(res.headers.get('content-length')) || asset.size || 0
    const hash = createHash('sha256')
    let received = 0
    let lastEmit = 0
    const body = Readable.fromWeb(res.body as unknown as WebReadableStream)
    body.on('data', (chunk: Buffer) => {
      hash.update(chunk)
      received += chunk.length
      if (total && Date.now() - lastEmit > 250) {
        lastEmit = Date.now()
        this.set({ status: 'downloading', release, progress: Math.min(0.99, received / total) })
      }
    })
    await pipeline(body, createWriteStream(zip))
    if (hash.digest('hex') !== expected) throw new Error('checksum mismatch — the download was not used')

    const staging = join(dir, 'staging')
    mkdirSync(staging)
    await new Promise<void>((ok, fail) => {
      const p = spawn('ditto', ['-x', '-k', zip, staging])
      p.on('exit', (code) => (code === 0 ? ok() : fail(new Error('could not unpack the update'))))
    })
    const appName = readdirSync(staging).find((n) => n.endsWith('.app'))
    if (!appName || !existsSync(join(staging, appName, 'Contents', 'MacOS', 'UniOS'))) throw new Error('the update package is incomplete')
    this.stagedApp = join(staging, appName)
  }

  private async downloadWithElectronUpdater(release: ReleaseInfo): Promise<void> {
    const { autoUpdater } = electronUpdater
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true
    autoUpdater.removeAllListeners('download-progress')
    autoUpdater.on('download-progress', (p) => this.set({ status: 'downloading', release, progress: Math.min(0.99, p.percent / 100) }))
    const result = await autoUpdater.checkForUpdates()
    if (!result?.isUpdateAvailable) throw new Error('the update is not available for this installation yet')
    await autoUpdater.downloadUpdate()
  }

  /** Quit, install, relaunch. */
  install(): void {
    if (this.state.status !== 'ready') return
    if (process.platform !== 'darwin') {
      electronUpdater.autoUpdater.quitAndInstall(false, true)
      return
    }
    if (!this.stagedApp) return
    const script = join(dirname(dirname(this.stagedApp)), 'swap.sh')
    writeFileSync(script, macSwapScript(), { mode: 0o755 })
    const log = join(app.getPath('userData'), 'update.log')
    spawn('/bin/bash', [script, String(process.pid), this.stagedApp, this.bundlePath(), log], { detached: true, stdio: 'ignore' }).unref()
    this.ctx.close()
    app.quit()
  }
}
