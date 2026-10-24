// Dev helper: launch the built app with a throwaway data folder, run optional steps, save screenshots.
import { _electron as electron } from '@playwright/test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const dir = process.env.SHOT_DIR ?? mkdtempSync(join(tmpdir(), 'unios-shot-'))
const out = process.argv[2] ?? '/tmp/unios-shot'
const steps = process.argv[3] ? (await import(process.argv[3])).default : async () => {}

const app = await electron.launch({
  args: ['.'],
  env: { ...process.env, UNIOS_USER_DATA: join(dir, 'userdata'), UNIOS_DATA_DIR: join(dir, 'data') }
})
const win = await app.firstWindow()
const errors = []
win.on('pageerror', (e) => errors.push(String(e)))
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()))
await win.setViewportSize({ width: 1280, height: 800 })
await win.waitForTimeout(800)
await steps(win, out)
await win.screenshot({ path: `${out}-final.png` })
console.log(JSON.stringify({ dir, errors }, null, 1))
await app.close()
