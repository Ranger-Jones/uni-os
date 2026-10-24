// Renders build/icon.html to build/icon.png (1024²) with Electron, then builds build/icon.icns via sips + iconutil.
const { app, BrowserWindow } = require('electron')
const { execFileSync } = require('node:child_process')
const { mkdirSync, writeFileSync, rmSync } = require('node:fs')
const { join } = require('node:path')

app.whenReady().then(async () => {
  const root = join(__dirname, '..', 'build')
  const win = new BrowserWindow({ width: 1024, height: 1024, show: false, transparent: true, frame: false, backgroundColor: '#00000000', webPreferences: { offscreen: true } })
  await win.loadFile(join(root, 'icon.html'))
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  const png = join(root, 'icon.png')
  writeFileSync(png, img.resize({ width: 1024, height: 1024 }).toPNG())
  const set = join(root, 'icon.iconset')
  rmSync(set, { recursive: true, force: true })
  mkdirSync(set)
  for (const s of [16, 32, 128, 256, 512]) {
    execFileSync('sips', ['-z', String(s), String(s), png, '--out', join(set, `icon_${s}x${s}.png`)])
    execFileSync('sips', ['-z', String(s * 2), String(s * 2), png, '--out', join(set, `icon_${s}x${s}@2x.png`)])
  }
  execFileSync('iconutil', ['-c', 'icns', set, '-o', join(root, 'icon.icns')])
  rmSync(set, { recursive: true, force: true })
  app.quit()
})
