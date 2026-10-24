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

test('latex fences round-trip through math blocks', async () => {
  const blocks = await markdownToBlocks('Satz:\n\n```latex\n\\int_0^1 x^2\\,dx = \\tfrac13\n```')
  expect(await blocksToMarkdown(blocks)).toContain('```latex\n\\int_0^1 x^2\\,dx = \\tfrac13\n```')
})

test('math blocks export as latex fences and latex fences import as math blocks', async () => {
  const md = await blocksToMarkdown([{ id: 'm', type: 'math', props: { latex: 'a^2+b^2=c^2' }, content: undefined, children: [] }])
  expect(md).toContain('```latex\na^2+b^2=c^2\n```')
  const blocks = (await markdownToBlocks('```latex\n\\sum_i x_i\n```')) as { type: string; props?: { latex?: string } }[]
  expect(blocks[0]).toMatchObject({ type: 'math', props: { latex: '\\sum_i x_i' } })
})
