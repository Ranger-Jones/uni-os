import { expect, test } from 'vitest'
import { compareVersions, parseChecksums, parseRelease, updateAssetFor } from '@core/update'

test('compareVersions orders semantic versions, ignoring a leading v', () => {
  expect(compareVersions('0.2.0', '0.1.9')).toBe(1)
  expect(compareVersions('v0.2.0', '0.2.0')).toBe(0)
  expect(compareVersions('0.10.0', '0.9.3')).toBe(1)
  expect(compareVersions('1.0.0', '1.0.1')).toBe(-1)
  expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1)
})

const release = {
  tag_name: 'v0.2.1',
  name: 'UniOS 0.2.1',
  body: '## What\'s new\n- Updates inside the app',
  html_url: 'https://github.com/Ranger-Jones/uni-os/releases/tag/v0.2.1',
  published_at: '2026-10-25T10:00:00Z',
  draft: false,
  prerelease: false,
  assets: [
    { name: 'UniOS-0.2.1-arm64-mac.zip', browser_download_url: 'https://x/arm64.zip', size: 10 },
    { name: 'UniOS-0.2.1-x64-mac.zip', browser_download_url: 'https://x/x64.zip', size: 10 },
    { name: 'UniOS-0.2.1-arm64.dmg', browser_download_url: 'https://x/arm64.dmg', size: 10 },
    { name: 'UniOS-0.2.1-x64.dmg', browser_download_url: 'https://x/x64.dmg', size: 10 },
    { name: 'UniOS-Setup-0.2.1-x64.exe', browser_download_url: 'https://x/setup.exe', size: 10 },
    { name: 'UniOS-0.2.1-x86_64.AppImage', browser_download_url: 'https://x/app.AppImage', size: 10 },
    { name: 'UniOS-0.2.1-amd64.deb', browser_download_url: 'https://x/app.deb', size: 10 },
    { name: 'SHA256SUMS.txt', browser_download_url: 'https://x/sums', size: 1 }
  ]
}

test('parseRelease extracts version, notes and assets; drafts and prereleases are ignored', () => {
  const r = parseRelease(release)!
  expect(r).toMatchObject({ version: '0.2.1', notes: "## What's new\n- Updates inside the app", url: release.html_url })
  expect(r.assets).toHaveLength(8)
  expect(parseRelease({ ...release, draft: true })).toBeNull()
  expect(parseRelease({ ...release, prerelease: true })).toBeNull()
  expect(parseRelease({ nope: 1 })).toBeNull()
})

test('updateAssetFor picks the right file per platform', () => {
  const r = parseRelease(release)!
  expect(updateAssetFor(r, 'darwin', 'arm64')).toMatchObject({ kind: 'mac-zip', asset: { name: 'UniOS-0.2.1-arm64-mac.zip' }, fallback: { name: 'UniOS-0.2.1-arm64.dmg' } })
  expect(updateAssetFor(r, 'darwin', 'x64')?.asset.name).toBe('UniOS-0.2.1-x64-mac.zip')
  expect(updateAssetFor(r, 'win32', 'x64')).toMatchObject({ kind: 'electron-updater', asset: { name: 'UniOS-Setup-0.2.1-x64.exe' } })
  expect(updateAssetFor(r, 'linux', 'x64', { appImage: true })).toMatchObject({ kind: 'electron-updater', asset: { name: 'UniOS-0.2.1-x86_64.AppImage' } })
  expect(updateAssetFor(r, 'linux', 'x64', { appImage: false })).toMatchObject({ kind: 'manual', asset: { name: 'UniOS-0.2.1-amd64.deb' } })
  expect(updateAssetFor({ ...r, assets: [] }, 'darwin', 'arm64')).toBeNull()
})

test('parseChecksums reads shasum output', () => {
  const sums = parseChecksums('abc123  UniOS-0.2.1-arm64-mac.zip\nDEF456 *UniOS-Setup-0.2.1-x64.exe\n\n')
  expect(sums.get('UniOS-0.2.1-arm64-mac.zip')).toBe('abc123')
  expect(sums.get('UniOS-Setup-0.2.1-x64.exe')).toBe('def456')
})

test('update assets must belong to the announced version (no rollback via renamed releases)', async () => {
  const { assetMatchesVersion, acceptableBundleVersion } = await import('@core/update')
  expect(assetMatchesVersion('UniOS-0.2.1-arm64-mac.zip', '0.2.1')).toBe(true)
  expect(assetMatchesVersion('UniOS-0.1.0-arm64-mac.zip', '0.2.1')).toBe(false)
  expect(assetMatchesVersion('UniOS-0.2.10-arm64-mac.zip', '0.2.1')).toBe(false)
  expect(acceptableBundleVersion('0.2.1', '0.2.1', '0.2.0')).toBe(true)
  expect(acceptableBundleVersion('0.1.0', '0.2.1', '0.2.0')).toBe(false)
  expect(acceptableBundleVersion('0.2.0', '0.2.0', '0.2.0')).toBe(false)
})
