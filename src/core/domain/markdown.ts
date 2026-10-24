// Markdown ⇄ BlockNote conversion, headless (works in the Electron main process and the MCP server).
import { ServerBlockNoteEditor } from '@blocknote/server-util'

let editor: ServerBlockNoteEditor | null = null
const getEditor = (): ServerBlockNoteEditor => (editor ??= ServerBlockNoteEditor.create())

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any
const LATEX = new Set(['latex', 'tex', 'math', 'katex'])
const codeText = (content: unknown) => (Array.isArray(content) ? content.map((c: Json) => c.text ?? '').join('') : '')

/** The app's formula block ("math") is not part of the default schema: it travels as a ```latex code block. */
const mathToCode = (blocks: Json[]): Json[] =>
  blocks.map((b) => ({
    ...(b.type === 'math' ? { ...b, type: 'codeBlock', props: { language: 'latex' }, content: [{ type: 'text', text: b.props?.latex ?? '', styles: {} }] } : b),
    children: Array.isArray(b.children) ? mathToCode(b.children) : []
  }))

const codeToMath = (blocks: Json[]): Json[] =>
  blocks.map((b) => ({
    ...(b.type === 'codeBlock' && LATEX.has(String(b.props?.language ?? '').toLowerCase()) ? { id: b.id, type: 'math', props: { latex: codeText(b.content).trim() }, children: [] } : b),
    children: Array.isArray(b.children) ? codeToMath(b.children) : []
  }))

export async function markdownToBlocks(md: string): Promise<unknown[]> {
  if (!md.trim()) return []
  return codeToMath((await getEditor().tryParseMarkdownToBlocks(md)) as Json[])
}

export async function blocksToMarkdown(blocks: unknown[]): Promise<string> {
  if (blocks.length === 0) return ''
  const out = await getEditor().blocksToMarkdownLossy(mathToCode(blocks as Json[]) as never)
  return out.trim()
}
