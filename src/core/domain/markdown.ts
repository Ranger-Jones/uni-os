// Markdown ⇄ BlockNote conversion, headless (works in the Electron main process and the MCP server).
import { ServerBlockNoteEditor } from '@blocknote/server-util'

let editor: ServerBlockNoteEditor | null = null
const getEditor = (): ServerBlockNoteEditor => (editor ??= ServerBlockNoteEditor.create())

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const LATEX = new Set(['latex', 'tex', 'math', 'katex'])
const codeText = (content: unknown) => (Array.isArray(content) ? content.map((c: Json) => c.text ?? '').join('') : '')

// BlockNote's markdown converter drops links with unknown protocols, so page links pass through it with a
// placeholder on the reserved .invalid TLD and are rewritten to unios://page/<id> outside of it.
const PLACEHOLDER = 'https://unios.invalid/page/'
const PAGE_LINK = /^https:\/\/unios\.invalid\/page\/([\w-]+)$/

// The markdown exporter drops image widths; they ride along in the URL and come out as <img width>, which the parser reads back.
const WIDTH_MARK = '#unios-width='
const escAttr = (v: string) => v.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
const restoreWidths = (md: string): string =>
  md
    .replace(/src="([^"]*?)#unios-width=(\d+)"/g, 'src="$1" width="$2"')
    .replace(/!\[([^\]]*)\]\(([^)\s]*?)#unios-width=(\d+)\)/g, (_, alt: string, src: string, w: string) => `<img alt="${escAttr(alt)}" src="${src}" width="${w}">`)

/** Page mentions travel as [Title](unios://page/<id>) links. */
const mapInline = (content: unknown, fn: (c: Json) => Json): unknown => {
  if (Array.isArray(content)) return content.map((c: Json) => fn(c))
  if (content && typeof content === 'object' && (content as Json).type === 'tableContent') {
    const t = content as Json
    return { ...t, rows: t.rows.map((r: Json) => ({ ...r, cells: r.cells.map((cell: Json) => (Array.isArray(cell) ? cell.map(fn) : { ...cell, content: (cell.content ?? []).map(fn) })) })) }
  }
  return content
}
const mentionToLink = (c: Json): Json =>
  c.type === 'pageMention' ? { type: 'link', href: `${PLACEHOLDER}${c.props?.pageId}`, content: [{ type: 'text', text: c.props?.title || 'Untitled', styles: {} }] } : c
const linkToMention = (c: Json): Json => {
  const m = c.type === 'link' && typeof c.href === 'string' ? PAGE_LINK.exec(c.href) : null
  return m ? { type: 'pageMention', props: { pageId: m[1], title: codeText(c.content) } } : c
}

/**
 * App-specific nodes are not part of the default schema used headlessly:
 * formula blocks ("math") travel as ```latex code blocks and page mentions as unios://page links.
 */
const toPortable = (blocks: Json[]): Json[] =>
  blocks.map((b) => ({
    ...(b.type === 'math'
      ? { ...b, type: 'codeBlock', props: { language: 'latex' }, content: [{ type: 'text', text: b.props?.latex ?? '', styles: {} }] }
      : b.type === 'image' && b.props?.previewWidth && b.props?.url
        ? { ...b, props: { ...b.props, url: `${b.props.url}${WIDTH_MARK}${Math.round(b.props.previewWidth)}` } }
        : { ...b, content: mapInline(b.content, mentionToLink) }),
    children: Array.isArray(b.children) ? toPortable(b.children) : []
  }))

const fromPortable = (blocks: Json[]): Json[] =>
  blocks.map((b) => ({
    ...(b.type === 'codeBlock' && LATEX.has(String(b.props?.language ?? '').toLowerCase())
      ? { id: b.id, type: 'math', props: { latex: codeText(b.content).trim() }, children: [] }
      : { ...b, content: mapInline(b.content, linkToMention) }),
    children: Array.isArray(b.children) ? fromPortable(b.children) : []
  }))

export async function markdownToBlocks(md: string): Promise<unknown[]> {
  if (!md.trim()) return []
  md = md.replace(/\]\(unios:\/\/page\/([\w-]+)\)/g, `](${PLACEHOLDER}$1)`)
  return fromPortable((await getEditor().tryParseMarkdownToBlocks(md)) as Json[])
}

export async function blocksToMarkdown(blocks: unknown[]): Promise<string> {
  if (blocks.length === 0) return ''
  const out = await getEditor().blocksToMarkdownLossy(toPortable(blocks as Json[]) as never)
  return restoreWidths(out.split(PLACEHOLDER).join('unios://page/')).trim()
}
