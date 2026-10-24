// Local end-to-end test of the macOS self-update (no publishing): see README "Releasing".
import { _electron as electron } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
const T = process.env.UPD_DIR
const exe = `${T}/Apps/UniOS.app/Contents/MacOS/UniOS`
const env = { ...process.env, UNIOS_UPDATE_FEED: 'http://127.0.0.1:8765', UNIOS_USER_DATA: `${T}/u`, UNIOS_DATA_DIR: `${T}/d`, UNIOS_SWAP_NO_RELAUNCH: '1' }
const version = () => execFileSync('defaults', ['read', `${T}/Apps/UniOS.app/Contents/Info.plist`, 'CFBundleShortVersionString']).toString().trim()
console.log('installed before:', version())

let app = await electron.launch({ executablePath: exe, args: [], env })
let win = await app.firstWindow()
await win.setViewportSize({ width: 1280, height: 800 })
await win.getByText('UniOS 0.2.1 is available').waitFor({ timeout: 20000 })
await win.screenshot({ path: '/tmp/upd-banner.png' })
await win.getByText('UniOS 0.2.1 is available').click()
await win.waitForTimeout(400)
await win.screenshot({ path: '/tmp/upd-dialog.png' })
await win.getByRole('button', { name: 'Update', exact: true }).click()
await win.getByRole('button', { name: 'Restart & update' }).waitFor({ timeout: 60000 })
await win.screenshot({ path: '/tmp/upd-ready.png' })
const closed = new Promise((r) => app.process().once('exit', r))
await win.getByRole('button', { name: 'Restart & update' }).click()
await closed
for (let i = 0; i < 50 && version() !== '0.2.1'; i++) await new Promise((r) => setTimeout(r, 300))
console.log('installed after:', version())
console.log('log:', readFileSync(`${T}/u/update.log`, 'utf8').trim().split('\n').slice(-2).join(' | '))
execFileSync('codesign', ['--verify', '--deep', '--strict', `${T}/Apps/UniOS.app`])
console.log('signature after update: valid')

app = await electron.launch({ executablePath: exe, args: [], env })
win = await app.firstWindow()
await win.setViewportSize({ width: 1280, height: 800 })
await win.getByRole('dialog', { name: 'What’s new in UniOS 0.2.1' }).waitFor({ timeout: 15000 })
await win.screenshot({ path: '/tmp/upd-whatsnew.png' })
await win.getByRole('button', { name: 'Got it' }).click()
await win.waitForTimeout(300)
console.log('lastSeenVersion:', JSON.parse(readFileSync(`${T}/u/settings.json`, 'utf8')).lastSeenVersion)
await app.close()
