// Markdown ⇄ BlockNote conversion, headless (works in the Electron main process and the MCP server).
import { ServerBlockNoteEditor } from '@blocknote/server-util'

let editor: ServerBlockNoteEditor | null = null
const getEditor = (): ServerBlockNoteEditor => (editor ??= ServerBlockNoteEditor.create())

export async function markdownToBlocks(md: string): Promise<unknown[]> {
  if (!md.trim()) return []
  return (await getEditor().tryParseMarkdownToBlocks(md)) as unknown[]
}

export async function blocksToMarkdown(blocks: unknown[]): Promise<string> {
  if (blocks.length === 0) return ''
  const out = await getEditor().blocksToMarkdownLossy(blocks as never)
  return out.trim()
}
