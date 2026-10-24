import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas, loadImage } from '@napi-rs/canvas'
import { beforeEach, expect, test } from 'vitest'
import { assetPath, cropAsset, fileUrl, storeAsset } from '@core/assets'

let filesDir: string
beforeEach(() => {
  filesDir = join(mkdtempSync(join(tmpdir(), 'unios-crop-')), 'files')
})

/** 200×100 PNG: left half red, right half blue. */
async function twoColors(): Promise<Uint8Array> {
  const c = createCanvas(200, 100)
  const g = c.getContext('2d')
  g.fillStyle = '#ff0000'
  g.fillRect(0, 0, 100, 100)
  g.fillStyle = '#0000ff'
  g.fillRect(100, 0, 100, 100)
  return new Uint8Array(await c.encode('png'))
}

test('crops a stored image into a new asset and keeps the original', async () => {
  const rel = storeAsset(filesDir, 'page-1', 'slide.png', await twoColors())
  const r = await cropAsset(filesDir, 'page-1', fileUrl(rel), { left: 0.5, top: 0.2, right: 1, bottom: 0.8 })
  expect(r).toMatchObject({ width: 100, height: 60 })
  expect(r.rel).not.toBe(rel)
  expect(r.rel).toMatch(/^assets\/page-1\/[0-9a-f]{8}-slide\.png$/)
  expect(existsSync(join(filesDir, rel))).toBe(true)
  const img = await loadImage(readFileSync(join(filesDir, r.rel)))
  const g = createCanvas(img.width, img.height).getContext('2d')
  g.drawImage(img, 0, 0)
  expect([...g.getImageData(5, 5, 1, 1).data]).toEqual([0, 0, 255, 255])
})

test('rejects URLs outside the files folder and invalid boxes', async () => {
  const rel = storeAsset(filesDir, 'page-1', 'slide.png', await twoColors())
  expect(assetPath(filesDir, 'https://example.com/a.png')).toBeNull()
  expect(assetPath(filesDir, 'unios-file://local/..%2F..%2Fetc%2Fpasswd')).toBeNull()
  await expect(cropAsset(filesDir, 'page-1', 'file:///etc/passwd', { left: 0, top: 0, right: 1, bottom: 1 })).rejects.toThrow(/stored in UniOS/)
  await expect(cropAsset(filesDir, 'page-1', fileUrl(rel), { left: 0.6, top: 0, right: 0.5, bottom: 1 })).rejects.toThrow(/crop needs/)
})
