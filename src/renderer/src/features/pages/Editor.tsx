import '@blocknote/mantine/style.css'
import { BlockNoteView, type Theme } from '@blocknote/mantine'
import { useCreateBlockNote } from '@blocknote/react'
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
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
}

interface Props {
  pageId: string
  initialContent: unknown[]
  /** Content written by someone else (e.g. the assistant). Applied while the editor is not focused. */
  externalContent?: { content: unknown[]; version: string }
  onChange(blocks: unknown[]): void
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor({ initialContent, externalContent, onChange }, ref) {
  const editor = useCreateBlockNote({
    initialContent: initialContent.length ? (initialContent as never) : undefined,
    uploadFile: async (file: File) => api.assets.store({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) })
  })
  const wrapper = useRef<HTMLDivElement>(null)
  const appliedVersion = useRef<string | undefined>(externalContent?.version)

  useImperativeHandle(ref, () => ({ focus: () => editor.focus() }), [editor])

  useEffect(() => {
    if (!externalContent || externalContent.version === appliedVersion.current) return
    if (wrapper.current?.contains(document.activeElement)) return
    appliedVersion.current = externalContent.version
    editor.replaceBlocks(editor.document, (externalContent.content.length ? externalContent.content : [{ type: 'paragraph' }]) as never)
  }, [externalContent, editor])

  return (
    <div ref={wrapper} className="unios-editor -mx-[54px]">
      <BlockNoteView editor={editor} theme={{ light: theme, dark: theme }} onChange={() => onChange(editor.document)} />
    </div>
  )
})
