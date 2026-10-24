import { expect, test } from 'vitest'
import { blocksToText } from '@core/domain/blocks'
import { blocksToMarkdown, markdownToBlocks } from '@core/domain/markdown'

const md = `# Kapitel 1

Ein Absatz mit **fett**.

- Punkt A
- Punkt B

1. Erstens

- [ ] offen
- [x] erledigt

\`\`\`python
print("hi")
\`\`\`

> Zitat`

test('markdown → blocks keeps structure and text', async () => {
  const blocks = (await markdownToBlocks(md)) as { type: string; props?: Record<string, unknown> }[]
  const types = blocks.map((b) => b.type)
  expect(types).toContain('heading')
  expect(types).toContain('bulletListItem')
  expect(types).toContain('numberedListItem')
  expect(types).toContain('checkListItem')
  expect(types).toContain('codeBlock')
  const text = blocksToText(blocks)
  for (const s of ['Kapitel 1', 'fett', 'Punkt B', 'Erstens', 'erledigt', 'print("hi")', 'Zitat']) expect(text).toContain(s)
  expect(blocks.find((b) => b.type === 'checkListItem' && b.props?.checked === true)).toBeTruthy()
})

test('blocks → markdown round-trips headings, lists and code', async () => {
  const out = await blocksToMarkdown(await markdownToBlocks(md))
  expect(out).toMatch(/^# Kapitel 1/m)
  expect(out).toMatch(/^[*-] Punkt A/m)
  expect(out).toContain('print("hi")')
  expect(out).toContain('**fett**')
})

test('empty input', async () => {
  expect(await markdownToBlocks('')).toEqual([])
  expect(await blocksToMarkdown([])).toBe('')
})
