import { safeStorage } from 'electron'

/**
 * Makes safeStorage usable before encrypting. On Linux without a keyring, falls back to Electron's
 * built-in key: the files holding secrets are then protected by file permissions only (like the
 * local database itself).
 */
export function ensureEncryption(): void {
  if (safeStorage.isEncryptionAvailable()) return
  if (process.platform !== 'linux') throw new Error('Secure storage is not available on this system')
  safeStorage.setUsePlainTextEncryption(true)
}

/** False when no OS keychain protects secrets (Linux without a running keyring). */
export function inKeychain(): boolean {
  if (process.platform !== 'linux') return true
  try {
    return safeStorage.getSelectedStorageBackend() !== 'basic_text'
  } catch {
    return false
  }
}
