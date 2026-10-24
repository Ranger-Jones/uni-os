// Authenticity of updates: SHA256SUMS.txt is signed with an offline Ed25519 key (kept outside the repo);
// the app only trusts checksums whose signature verifies against the public key below.
import { createPublicKey, verify } from 'node:crypto'
import { UPDATE_REPO } from './update'

export function verifySignedChecksums(text: string, signatureB64: string, publicKeyPem: string): boolean {
  try {
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(signatureB64.trim())) return false
    return verify(null, Buffer.from(text), createPublicKey(publicKeyPem), Buffer.from(signatureB64.trim(), 'base64'))
  } catch {
    return false
  }
}

/** Release downloads must come from this repository on GitHub over HTTPS. */
export function isTrustedDownload(raw: string): boolean {
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' && u.hostname === 'github.com' && u.pathname.startsWith(`/${UPDATE_REPO}/releases/download/`) && !raw.includes('..')
  } catch {
    return false
  }
}
