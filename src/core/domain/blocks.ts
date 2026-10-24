// Plain-text extraction from BlockNote documents (used for search and as LLM context).

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => {
      if (!isObj(c)) return ''
      if (typeof c.text === 'string') return c.text
      if (Array.isArray(c.content)) return inlineText(c.content)
      return ''
    })
    .join('')
}

function tableText(content: Json): string[] {
  const rows = Array.isArray(content.rows) ? content.rows : []
  return rows.map((row) => {
    const cells = isObj(row) && Array.isArray(row.cells) ? row.cells : []
    return cells.map((cell) => (Array.isArray(cell) ? inlineText(cell) : isObj(cell) ? inlineText(cell.content) : '')).join(' | ')
  })
}

function collect(blocks: unknown[], out: string[]): void {
  for (const b of blocks) {
    if (!isObj(b)) continue
    if (isObj(b.content) && b.content.type === 'tableContent') out.push(...tableText(b.content))
    else {
      const text = inlineText(b.content).trim()
      if (text) out.push(text)
    }
    if (Array.isArray(b.children)) collect(b.children, out)
  }
}

export function blocksToText(blocks: unknown): string {
  if (!Array.isArray(blocks)) return ''
  const out: string[] = []
  collect(blocks, out)
  return out.join('\n')
}
