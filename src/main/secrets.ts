import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { app, safeStorage } from 'electron'

export type Provider = 'anthropic' | 'openai'

const file = () => join(app.getPath('userData'), 'secrets.json')

function readAll(): Partial<Record<Provider, string>> {
  if (!existsSync(file())) return {}
  try {
    return JSON.parse(readFileSync(file(), 'utf8')) as Partial<Record<Provider, string>>
  } catch {
    return {}
  }
}

/** API keys are encrypted with the macOS Keychain-backed safeStorage and never leave the main process. */
export function getKey(provider: Provider): string | null {
  const enc = readAll()[provider]
  if (!enc) return null
  try {
    return safeStorage.decryptString(Buffer.from(enc, 'base64'))
  } catch {
    return null
  }
}

export function setKey(provider: Provider, key: string | null): void {
  if (key && !safeStorage.isEncryptionAvailable()) throw new Error('Secure storage is not available on this system')
  const all = readAll()
  if (key) all[provider] = safeStorage.encryptString(key.trim()).toString('base64')
  else delete all[provider]
  writeFileSync(file(), JSON.stringify(all), { mode: 0o600 })
}

export const keyStatus = (): Record<Provider, boolean> => ({ anthropic: !!getKey('anthropic'), openai: !!getKey('openai') })
