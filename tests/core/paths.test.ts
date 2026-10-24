import { expect, test } from 'vitest'
import { resolveInside, safeFileName } from '@core/paths'

test('resolveInside allows nested paths and rejects escapes', () => {
  expect(resolveInside('/data/files', 'assets/a.png')).toBe('/data/files/assets/a.png')
  expect(resolveInside('/data/files', '../unios.db')).toBeNull()
  expect(resolveInside('/data/files', 'assets/../../x')).toBeNull()
  expect(resolveInside('/data/files', '/etc/passwd')).toBeNull()
  expect(resolveInside('/data/files', '%2e%2e/x')).toBeNull()
  expect(resolveInside('/data/files', '')).toBeNull()
})

test('safeFileName strips path separators and control characters', () => {
  expect(safeFileName('../../evil.pdf')).toBe('evil.pdf')
  expect(safeFileName('Skript: Kapitel 1.pdf')).toBe('Skript_ Kapitel 1.pdf')
  expect(safeFileName('.hidden')).toBe('hidden')
  expect(safeFileName('   ')).toBe('file')
})
