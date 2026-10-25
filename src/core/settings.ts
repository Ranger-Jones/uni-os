import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

export type LlmProvider = 'anthropic' | 'openai' | 'local'

export interface Settings {
  dataDir: string
  backupDir: string | null
  theme: 'system' | 'light' | 'dark'
  defaultProvider: LlmProvider
  anthropicModel: string
  openaiModel: string
  /** OpenAI-compatible server of a local model (Ollama, LM Studio, llama.cpp …). */
  localBaseUrl: string
  /** Model name on that server; empty until the user picks one. */
  localModel: string
  /** Let reasoning models (qwen3, gpt-oss …) think before answering: sometimes better, much slower. */
  localThinking: boolean
  lastBackupAt: string | null
  /** Look for new releases on GitHub at startup and every few hours. */
  checkUpdates: boolean
  /** Version whose release notes the user has seen ("What's new" after an update). */
  lastSeenVersion: string | null
}

export const defaultSettings = (): Settings => ({
  dataDir: process.env.UNIOS_DATA_DIR ?? join(homedir(), 'UniOS'),
  backupDir: null,
  theme: 'system',
  defaultProvider: 'anthropic',
  anthropicModel: 'claude-opus-5-5',
  openaiModel: 'gpt-5',
  localBaseUrl: 'http://localhost:11434/v1',
  localModel: '',
  localThinking: false,
  lastBackupAt: null,
  checkUpdates: true,
  lastSeenVersion: null
})

/** Model configured for a provider. */
export const modelFor = (s: Settings, provider: LlmProvider): string =>
  provider === 'anthropic' ? s.anthropicModel : provider === 'openai' ? s.openaiModel : s.localModel

type Env = Record<string, string | undefined>

/** Per-OS application data root (what Electron calls appData). */
export function appDataRoot(platform: NodeJS.Platform, home: string, env: Env): string {
  if (platform === 'darwin') return join(home, 'Library', 'Application Support')
  if (platform === 'win32') return env.APPDATA ?? join(home, 'AppData', 'Roaming')
  return env.XDG_CONFIG_HOME ?? join(home, '.config')
}

export const userDataDirFor = (platform: NodeJS.Platform, home: string, env: Env): string => env.UNIOS_USER_DATA ?? join(appDataRoot(platform, home, env), 'UniOS')

/** Where the Electron app keeps settings.json (also read by the MCP server). */
export const defaultUserDataDir = (): string => userDataDirFor(process.platform, homedir(), process.env)

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
