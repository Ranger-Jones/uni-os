import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { type DbHandle, openDb } from '@core/db/open'
import { dbPathFor, readSettings, type Settings, writeSettings } from '@core/settings'

/** Process-wide state of the main process. The DB can be re-opened when the data folder changes. */
export class AppContext {
  private handle: DbHandle | null = null
  settings: Settings

  constructor(private readonly settingsFile: string) {
    this.settings = readSettings(settingsFile)
  }

  get db() {
    return this.open().db
  }

  get sqlite() {
    return this.open().sqlite
  }

  get dataDir(): string {
    return this.settings.dataDir
  }

  get filesDir(): string {
    return join(this.settings.dataDir, 'files')
  }

  open(): DbHandle {
    if (!this.handle) {
      mkdirSync(this.filesDir, { recursive: true })
      this.handle = openDb(dbPathFor(this.settings.dataDir))
    }
    return this.handle
  }

  close(): void {
    this.handle?.sqlite.close()
    this.handle = null
  }

  updateSettings(patch: Partial<Settings>): Settings {
    const dataDirChanged = patch.dataDir !== undefined && patch.dataDir !== this.settings.dataDir
    this.settings = { ...this.settings, ...patch }
    writeSettings(this.settingsFile, this.settings)
    if (dataDirChanged) this.close()
    return this.settings
  }
}
