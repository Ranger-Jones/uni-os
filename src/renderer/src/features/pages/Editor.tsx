import 'katex/dist/katex.min.css'
import '@blocknote/mantine/style.css'
import { BlockNoteView, type Theme } from '@blocknote/mantine'
import { filterSuggestionItems, insertOrUpdateBlockForSlashMenu } from '@blocknote/core'
import { FormattingToolbar, FormattingToolbarController, getDefaultReactSlashMenuItems, getFormattingToolbarItems, SuggestionMenuController, useCreateBlockNote } from '@blocknote/react'
import { FilePlus, FileText, Sigma } from 'lucide-react'
import { ImageCropButton, InlineCropper, type CropTarget } from './ImageCrop'
import { schema } from './schema'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { queryClient } from '../../lib/queries'

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
  courseId: string | null
  initialContent: unknown[]
  /** Content written by someone else (e.g. the assistant). Applied while the editor is not focused. */
  externalContent?: { content: unknown[]; version: string }
  /** Called after externalContent has been applied, with its version. */
  onExternalApplied?(version: string): void
  onChange(blocks: unknown[]): void
}

export const Editor = forwardRef<EditorHandle, Props>(function Editor({ pageId, courseId, initialContent, externalContent, onExternalApplied, onChange }, ref) {
  const editor = useCreateBlockNote({
    schema,
    initialContent: initialContent.length ? (initialContent as never) : undefined,
    uploadFile: async (file: File) => api.assets.store({ pageId, name: file.name, data: new Uint8Array(await file.arrayBuffer()) })
  })
  const wrapper = useRef<HTMLDivElement>(null)
  const appliedVersion = useRef<string | undefined>(externalContent?.version)

  const [blurTick, setBlurTick] = useState(0)
  // Lives here, not in the toolbar: the toolbar unmounts as soon as the cropper takes the pointer.
  const [cropTarget, setCropTarget] = useState<CropTarget | null>(null)
  const closeCrop = useCallback(() => setCropTarget(null), [])

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
      <BlockNoteView editor={editor} theme={{ light: theme, dark: theme }} slashMenu={false} formattingToolbar={false} onChange={() => onChange(editor.document)}>
        <FormattingToolbarController
          formattingToolbar={() => {
            const items = getFormattingToolbarItems()
            const at = items.findIndex((i) => i.key === 'fileCaptionButton') + 1
            items.splice(at, 0, <ImageCropButton key="imageCropButton" onCrop={setCropTarget} />)
            return <FormattingToolbar>{items}</FormattingToolbar>
          }}
        />
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
        {['@', '[['].map((trigger) => (
          <SuggestionMenuController
            key={trigger}
            triggerCharacter={trigger}
            getItems={async (query) => {
              const hits = await api.pages.searchTitles({ q: query, exclude: pageId })
              const insert = (id: string, title: string) =>
                editor.insertInlineContent([{ type: 'pageMention', props: { pageId: id, title } }, ' '] as never)
              const items = hits.map((h) => ({
                title: h.title || 'Untitled',
                subtext: h.courseName ?? 'Pages',
                icon: h.icon ? <span className="text-base">{h.icon}</span> : <FileText size={16} />,
                onItemClick: () => insert(h.id, h.title)
              }))
              const name = query.trim()
              if (name && !hits.some((h) => h.title.toLowerCase() === name.toLowerCase()))
                items.push({
                  title: `New page “${name}”`,
                  subtext: 'Create it and link here',
                  icon: <FilePlus size={16} />,
                  onItemClick: () =>
                    void api.pages.create({ courseId, title: name }).then((p) => {
                      insert(p.id, p.title)
                      void queryClient.invalidateQueries({ queryKey: ['pages'] })
                    })
                })
              return items
            }}
          />
        ))}
      </BlockNoteView>
      <InlineCropper
        pageId={pageId}
        target={cropTarget}
        onClose={closeCrop}
        onCropped={(url, previewWidth) => {
          const target = cropTarget
          setCropTarget(null)
          if (target && editor.getBlock(target.blockId))
            editor.updateBlock(target.blockId, { props: { url, ...(previewWidth ? { previewWidth } : {}) } } as never)
        }}
      />
    </div>
  )
})
