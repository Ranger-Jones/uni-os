// Plain-text extraction from BlockNote documents (used for search and as LLM context).

type Json = Record<string, unknown>
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

function inlineText(content: unknown): string {
  if (!Array.isArray(content)) return ''
  return content
    .map((c) => {
      if (!isObj(c)) return ''
      if (typeof c.text === 'string') return c.text
      if (c.type === 'pageMention' && isObj(c.props) && typeof c.props.title === 'string') return c.props.title
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
    if (b.type === 'math' && isObj(b.props) && typeof b.props.latex === 'string') {
      if (b.props.latex.trim()) out.push(b.props.latex.trim())
    } else if (isObj(b.content) && b.content.type === 'tableContent') out.push(...tableText(b.content))
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

/** Local document plus any top-level blocks that only exist in the remote version (appended in remote order). */
export function mergeBlocks(local: unknown[], remote: unknown[]): unknown[] {
  const ids = new Set(local.map((b) => (isObj(b) ? b.id : undefined)).filter(Boolean))
  return [...local, ...remote.filter((b) => !(isObj(b) && b.id && ids.has(b.id)))]
}

function collectLinks(node: unknown, out: Set<string>): void {
  if (Array.isArray(node)) return node.forEach((n) => collectLinks(n, out))
  if (!isObj(node)) return
  if (node.type === 'pageMention' && isObj(node.props) && typeof node.props.pageId === 'string') out.add(node.props.pageId)
  for (const key of ['content', 'children', 'rows', 'cells']) if (key in node) collectLinks(node[key], out)
}

/** Ids of all pages mentioned anywhere in a document. */
export function extractPageLinks(blocks: unknown): string[] {
  const out = new Set<string>()
  collectLinks(blocks, out)
  return [...out]
}
