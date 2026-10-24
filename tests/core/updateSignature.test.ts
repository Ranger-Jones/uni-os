import { generateKeyPairSync, sign } from 'node:crypto'
import { expect, test } from 'vitest'
import { isTrustedDownload, verifySignedChecksums } from '@core/updateSignature'

const { publicKey, privateKey } = generateKeyPairSync('ed25519')
const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString()
const sums = 'abc123  UniOS-0.2.1-arm64-mac.zip\n'
const sig = sign(null, Buffer.from(sums), privateKey).toString('base64')

test('accepts checksums signed with the release key', () => {
  expect(verifySignedChecksums(sums, sig, pub)).toBe(true)
})

test('rejects modified checksums, foreign signatures and garbage', () => {
  expect(verifySignedChecksums(sums.replace('abc', 'abd'), sig, pub)).toBe(false)
  const other = generateKeyPairSync('ed25519').privateKey
  expect(verifySignedChecksums(sums, sign(null, Buffer.from(sums), other).toString('base64'), pub)).toBe(false)
  expect(verifySignedChecksums(sums, 'not-base64!!', pub)).toBe(false)
  expect(verifySignedChecksums(sums, '', pub)).toBe(false)
})

test('downloads must come from this repository’s GitHub releases', () => {
  expect(isTrustedDownload('https://github.com/Ranger-Jones/uni-os/releases/download/v0.2.1/UniOS-0.2.1-arm64-mac.zip')).toBe(true)
  expect(isTrustedDownload('https://github.com/someone/else/releases/download/v1/x.zip')).toBe(false)
  expect(isTrustedDownload('http://github.com/Ranger-Jones/uni-os/releases/download/v1/x.zip')).toBe(false)
  expect(isTrustedDownload('https://evil.example/Ranger-Jones/uni-os/releases/download/x.zip')).toBe(false)
  expect(isTrustedDownload('https://github.com/Ranger-Jones/uni-os/releases/download/../../../x')).toBe(false)
})
