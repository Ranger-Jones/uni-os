import { writeFileSync } from 'node:fs'
import { expect, test } from 'vitest'
import { defaultSettings, readSettings, writeSettings } from '@core/settings'
import { tmpFile } from '../helpers/db'

test('missing or corrupt settings fall back to defaults', () => {
  const f = tmpFile('settings.json')
  expect(readSettings(f)).toEqual(defaultSettings())
  writeFileSync(f, '{not json')
  expect(readSettings(f)).toEqual(defaultSettings())
})

test('written settings round-trip and merge with defaults', () => {
  const f = tmpFile('settings.json')
  writeSettings(f, { ...defaultSettings(), theme: 'dark' })
  expect(readSettings(f).theme).toBe('dark')
  writeFileSync(f, JSON.stringify({ theme: 'light' }))
  expect(readSettings(f)).toMatchObject({ theme: 'light', defaultProvider: 'anthropic' })
})

test('user data folder follows each platform convention', async () => {
  const { userDataDirFor } = await import('@core/settings')
  expect(userDataDirFor('darwin', '/Users/a', {})).toBe('/Users/a/Library/Application Support/UniOS')
  expect(userDataDirFor('win32', 'C:\\Users\\a', { APPDATA: 'C:\\Users\\a\\AppData\\Roaming' })).toMatch(/^C:\\Users\\a\\AppData\\Roaming[\\/]UniOS$/)
  expect(userDataDirFor('linux', '/home/a', {})).toBe('/home/a/.config/UniOS')
  expect(userDataDirFor('linux', '/home/a', { XDG_CONFIG_HOME: '/home/a/cfg' })).toBe('/home/a/cfg/UniOS')
  expect(userDataDirFor('linux', '/home/a', { UNIOS_USER_DATA: '/tmp/x' })).toBe('/tmp/x')
})

test('Claude Desktop config location per platform', async () => {
  const { claudeDesktopConfigPath } = await import('@core/mcp/config')
  expect(claudeDesktopConfigPath('darwin', '/Users/a', {})).toBe('/Users/a/Library/Application Support/Claude/claude_desktop_config.json')
  expect(claudeDesktopConfigPath('win32', 'C:\\Users\\a', { APPDATA: 'C:\\R' })).toMatch(/^C:\\R[\\/]Claude[\\/]claude_desktop_config\.json$/)
  expect(claudeDesktopConfigPath('linux', '/home/a', {})).toBe('/home/a/.config/Claude/claude_desktop_config.json')
})
