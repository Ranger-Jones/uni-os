import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDb } from '@core/db/open'

export function tmpFile(name = 'test.db'): string {
  return join(mkdtempSync(join(tmpdir(), 'unios-')), name)
}

export function memDb() {
  return openDb(':memory:')
}
