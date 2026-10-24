import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export interface Settings {
  dataDir: string
  backupDir: string | null
  theme: 'system' | 'light' | 'dark'
  defaultProvider: 'anthropic' | 'openai'
  anthropicModel: string
  openaiModel: string
  lastBackupAt: string | null
}

export const defaultSettings = (): Settings => ({
  dataDir: process.env.UNIOS_DATA_DIR ?? join(homedir(), 'UniOS'),
  backupDir: null,
  theme: 'system',
  defaultProvider: 'anthropic',
  anthropicModel: 'claude-sonnet-5-5',
  openaiModel: 'gpt-5',
  lastBackupAt: null
})

/** Where the Electron app keeps settings.json (also read by the MCP server). */
export const defaultUserDataDir = (): string =>
  process.env.UNIOS_USER_DATA ?? join(homedir(), 'Library', 'Application Support', 'UniOS')

export function readSettings(file: string): Settings {
  const defaults = defaultSettings()
  if (!existsSync(file)) return defaults
  try {
    return { ...defaults, ...(JSON.parse(readFileSync(file, 'utf8')) as Partial<Settings>) }
  } catch {
    return defaults
  }
}

export function writeSettings(file: string, settings: Settings): void {
  mkdirSync(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  writeFileSync(tmp, JSON.stringify(settings, null, 2))
  renameSync(tmp, file)
}

export const dbPathFor = (dataDir: string): string => join(dataDir, 'unios.db')
