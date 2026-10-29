// End-to-end encryption for sync: everything leaves the device as AES-256-GCM ciphertext.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto'

const CHECK = 'unios-sync-check-v1'

export const newSalt = (): string => randomBytes(16).toString('base64')

/** 32-byte key from the sync password; the salt is shared through the remote meta row. */
export function deriveKey(password: string, salt: string): Buffer {
  return scryptSync(password.normalize('NFC'), Buffer.from(salt, 'base64'), 32, { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })
}

/** iv (12) | tag (16) | ciphertext */
export function encryptBytes(key: Buffer, data: Uint8Array): Uint8Array {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const body = Buffer.concat([cipher.update(data), cipher.final()])
  return new Uint8Array(Buffer.concat([iv, cipher.getAuthTag(), body]))
}

export function decryptBytes(key: Buffer, data: Uint8Array): Uint8Array {
  const buf = Buffer.from(data)
  const decipher = createDecipheriv('aes-256-gcm', key, buf.subarray(0, 12))
  decipher.setAuthTag(buf.subarray(12, 28))
  return new Uint8Array(Buffer.concat([decipher.update(buf.subarray(28)), decipher.final()]))
}

export const encryptJson = (key: Buffer, value: unknown): string => Buffer.from(encryptBytes(key, Buffer.from(JSON.stringify(value), 'utf8'))).toString('base64')

export const decryptJson = <T = unknown>(key: Buffer, payload: string): T => JSON.parse(Buffer.from(decryptBytes(key, Buffer.from(payload, 'base64'))).toString('utf8')) as T

/** Encrypted known value: lets a second device check the password before it touches any data. */
export const makeCheck = (key: Buffer): string => encryptJson(key, CHECK)

export function verifyCheck(key: Buffer, check: string): boolean {
  try {
    return decryptJson(key, check) === CHECK
  } catch {
    return false
  }
}
