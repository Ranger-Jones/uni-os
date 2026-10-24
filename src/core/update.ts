// Update checks against GitHub releases (pure helpers; networking lives in the main process).

export const UPDATE_REPO = 'Ranger-Jones/uni-os'

/** Public half of the offline release-signing key (private key: ~/.config/unios-release/update-signing-key.pem). */
export const UPDATE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAp4Ti9a8cX5+oadpV/jTmCZ1SpFHzXKvAA97iGImvhB0=
-----END PUBLIC KEY-----`

export interface ReleaseAsset {
  name: string
  url: string
  size: number
}

export interface ReleaseInfo {
  version: string
  title: string
  /** Markdown release notes (English). */
  notes: string
  url: string
  publishedAt: string
  assets: ReleaseAsset[]
}

const parts = (v: string) => {
  const [core, pre] = v.replace(/^v/, '').split('-', 2)
  return { nums: core.split('.').map((n) => Number.parseInt(n, 10) || 0), pre }
}

/** 1 if a > b, -1 if a < b, 0 if equal. A pre-release sorts before its release. */
export function compareVersions(a: string, b: string): number {
  const x = parts(a)
  const y = parts(b)
  for (let i = 0; i < 3; i++) {
    const d = (x.nums[i] ?? 0) - (y.nums[i] ?? 0)
    if (d) return Math.sign(d)
  }
  if (x.pre && !y.pre) return -1
  if (!x.pre && y.pre) return 1
  return x.pre && y.pre ? Math.sign(x.pre.localeCompare(y.pre)) : 0
}

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

/** GitHub "release" JSON → ReleaseInfo; null for drafts, pre-releases and malformed data. */
export function parseRelease(json: unknown): ReleaseInfo | null {
  const r = json as Json
  if (!r || typeof r.tag_name !== 'string' || r.draft || r.prerelease) return null
  return {
    version: r.tag_name.replace(/^v/, ''),
    title: typeof r.name === 'string' && r.name ? r.name : r.tag_name,
    notes: typeof r.body === 'string' ? r.body.trim() : '',
    url: String(r.html_url ?? ''),
    publishedAt: String(r.published_at ?? ''),
    assets: Array.isArray(r.assets)
      ? r.assets.filter((a: Json) => typeof a?.name === 'string' && typeof a?.browser_download_url === 'string').map((a: Json) => ({ name: a.name, url: a.browser_download_url, size: Number(a.size) || 0 }))
      : []
  }
}

export type UpdatePlan =
  | { kind: 'mac-zip'; asset: ReleaseAsset; fallback: ReleaseAsset | null }
  | { kind: 'electron-updater'; asset: ReleaseAsset }
  | { kind: 'manual'; asset: ReleaseAsset }

/** How this installation can update to `release`. */
export function updateAssetFor(release: ReleaseInfo, platform: NodeJS.Platform, arch: string, opts: { appImage?: boolean } = {}): UpdatePlan | null {
  const find = (re: RegExp) => release.assets.find((a) => re.test(a.name)) ?? null
  const a = arch === 'arm64' ? 'arm64' : 'x64'
  if (platform === 'darwin') {
    const zip = find(new RegExp(`-${a}-mac\\.zip$`))
    const dmg = find(new RegExp(`-${a}\\.dmg$`))
    if (zip) return { kind: 'mac-zip', asset: zip, fallback: dmg }
    return dmg ? { kind: 'manual', asset: dmg } : null
  }
  if (platform === 'win32') {
    const exe = find(/Setup-.*\.exe$/)
    return exe ? { kind: 'electron-updater', asset: exe } : null
  }
  const appImage = find(/\.AppImage$/)
  if (opts.appImage && appImage) return { kind: 'electron-updater', asset: appImage }
  const deb = find(/\.deb$/) ?? appImage
  return deb ? { kind: 'manual', asset: deb } : null
}

/** Parse `shasum -a 256` output into file name → lowercase hex digest. */
export function parseChecksums(text: string): Map<string, string> {
  const out = new Map<string, string>()
  for (const line of text.split('\n')) {
    const m = /^([0-9a-fA-F]+)\s+\*?(.+)$/.exec(line.trim())
    if (m) out.set(m[2].trim(), m[1].toLowerCase())
  }
  return out
}

/** The asset file name carries exactly this version (e.g. UniOS-0.2.1-arm64-mac.zip). */
export const assetMatchesVersion = (name: string, version: string): boolean => name.includes(`-${version}-`)

/** The unpacked app must be the announced version and newer than the running one. */
export const acceptableBundleVersion = (bundleVersion: string, releaseVersion: string, currentVersion: string): boolean =>
  compareVersions(bundleVersion, releaseVersion) === 0 && compareVersions(bundleVersion, currentVersion) > 0
