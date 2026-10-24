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

test('only document-like files may be opened with the default app', async () => {
  const { isSafeToOpen } = await import('@core/paths')
  for (const ok of ['a.pdf', 'b.DOCX', 'c.png', 'notes.md', 'slides.key']) expect(isSafeToOpen(ok), ok).toBe(true)
  for (const bad of ['x.app', 'run.command', 'a.sh', 'setup.exe', 'evil.scpt', 'tool.jar', 'noext', 'a.pdf.command', 'x.terminal', 'y.workflow']) expect(isSafeToOpen(bad), bad).toBe(false)
})
