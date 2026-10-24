import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, test } from 'vitest'
import { macSwapScript } from '@core/macSwap'

function setup() {
  const dir = mkdtempSync(join(tmpdir(), 'unios-swap-'))
  const target = join(dir, 'Applications', 'UniOS.app')
  const fresh = join(dir, 'staging', 'UniOS.app')
  mkdirSync(join(target, 'Contents'), { recursive: true })
  mkdirSync(join(fresh, 'Contents', 'MacOS'), { recursive: true })
  writeFileSync(join(target, 'Contents', 'version'), 'old')
  writeFileSync(join(fresh, 'Contents', 'version'), 'new')
  writeFileSync(join(fresh, 'Contents', 'MacOS', 'UniOS'), '#!/bin/sh\n')
  const script = join(dir, 'swap.sh')
  writeFileSync(script, macSwapScript())
  const exited = spawnSync('true').pid! // a pid that is no longer running
  return { dir, target, fresh, script, exited }
}

const run = (s: ReturnType<typeof setup>, fresh = s.fresh) =>
  spawnSync('bash', [s.script, String(s.exited), fresh, s.target, join(s.dir, 'swap.log')], { env: { ...process.env, UNIOS_SWAP_NO_RELAUNCH: '1' } })

test('replaces the app bundle after the old process has exited and leaves no backup', () => {
  const s = setup()
  expect(run(s).status).toBe(0)
  expect(readFileSync(join(s.target, 'Contents', 'version'), 'utf8')).toBe('new')
  expect(readdirSync(join(s.dir, 'Applications'))).toEqual(['UniOS.app'])
})

test('keeps the old app when the new one is missing or incomplete', () => {
  const s = setup()
  expect(run(s, join(s.dir, 'does-not-exist.app')).status).not.toBe(0)
  expect(readFileSync(join(s.target, 'Contents', 'version'), 'utf8')).toBe('old')
  execFileSync('rm', ['-rf', join(s.fresh, 'Contents', 'MacOS')])
  expect(run(s).status).not.toBe(0)
  expect(readFileSync(join(s.target, 'Contents', 'version'), 'utf8')).toBe('old')
  expect(readdirSync(join(s.dir, 'Applications'))).toEqual(['UniOS.app'])
  expect(existsSync(join(s.dir, 'swap.log'))).toBe(true)
})
