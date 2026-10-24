import 'katex/dist/katex.min.css'
import '@blocknote/mantine/style.css'
import { BlockNoteView, type Theme } from '@blocknote/mantine'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import { getDefaultReactSlashMenuItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react'
import { Sigma } from 'lucide-react'
import { schema } from './schema'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { api } from '../../lib/api'

// Theme values point at the app's CSS variables, so one theme serves light and dark mode.
const theme: Theme = {
  colors: {
    editor: { text: 'var(--ink)', background: 'var(--paper)' },
    menu: { text: 'var(--ink)', background: 'var(--raised)' },
    tooltip: { text: 'var(--ink)', background: 'var(--raised)' },
    hovered: { text: 'var(--ink)', background: 'var(--hover)' },
    selected: { text: '#fff', background: 'var(--accent)' },
    disabled: { text: 'var(--faint)', background: 'var(--hover)' },
    shadow: 'var(--line)',
    border: 'var(--line)',
    sideMenu: 'var(--faint)'
  },
  borderRadius: 6,
  fontFamily: 'var(--font-sans)'
}

export interface EditorHandle {
  focus(): void
  /** Append blocks at the end without touching the user's cursor (used when merging foreign edits). */
  appendBlocks(blocks: unknown[]): void
  document(): unknown[]
}

interface Props {
  pageId: string
  initialContent: unknown[]
  /** Content written by someone else (e.g. the assistant). Applied while the editor is not focused. */
  externalContent?: { content: unknown[]; version: string }
  /** Called after externalContent has been applied, with its version. */
  onExternalApplied?(version: string): void
  onChange(blocks: unknown[]): void
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor({ pageId, initialContent, externalContent, onExternalApplied, onChange }, ref) {
  const editor = useCreateBlockNote({
    schema,
    initialContent: initialContent.length ? (initialContent as never) : undefined,
    uploadFile: async (file: File) => api.assets.store({ pageId, name: file.name, data: new Uint8Array(await file.arrayBuffer()) })
  })
  const wrapper = useRef<HTMLDivElement>(null)
  const appliedVersion = useRef<string | undefined>(externalContent?.version)

  const [blurTick, setBlurTick] = useState(0)

  useImperativeHandle(
    ref,
    () => ({
      focus: () => editor.focus(),
      document: () => editor.document as unknown[],
      appendBlocks: (blocks) => {
        if (!blocks.length) return
        const last = editor.document.at(-1)
        if (last) editor.insertBlocks(blocks as never, last, 'after')
      }
    }),
    [editor]
  )

  // Foreign changes (assistant, MCP) are applied while the user is not typing here — also right after blur.
  useEffect(() => {
    if (!externalContent || externalContent.version === appliedVersion.current) return
    if (wrapper.current?.contains(document.activeElement)) return
    appliedVersion.current = externalContent.version
    editor.replaceBlocks(editor.document, (externalContent.content.length ? externalContent.content : [{ type: 'paragraph' }]) as never)
    onExternalApplied?.(externalContent.version)
  }, [externalContent, editor, blurTick, onExternalApplied])

  return (
    <div
      ref={wrapper}
      className="unios-editor -mx-[54px]"
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setBlurTick((t) => t + 1)
      }}
    >
      <BlockNoteView editor={editor} theme={{ light: theme, dark: theme }} slashMenu={false} onChange={() => onChange(editor.document)}>
        <SuggestionMenuController
          triggerCharacter="/"
          getItems={async (query) =>
            filterSuggestionItems(
              [
                ...getDefaultReactSlashMenuItems(editor),
                {
                  title: 'Formula',
                  subtext: 'Display math written in LaTeX',
                  aliases: ['math', 'latex', 'equation', 'formel', 'tex'],
                  group: 'Advanced',
                  icon: <Sigma size={18} />,
                  onItemClick: () => insertOrUpdateBlockForSlashMenu(editor, { type: 'math' })
                }
              ],
              query
            )
          }
        />
      </BlockNoteView>
    </div>
  )
})
