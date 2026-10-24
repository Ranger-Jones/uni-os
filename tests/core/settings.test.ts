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
