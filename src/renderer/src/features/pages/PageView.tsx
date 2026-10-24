import { Link } from '@tanstack/react-router'
import { Copy, Layers, MessageSquare, MoreHorizontal, Smile, Sparkles, Trash2 } from 'lucide-react'
import { GenerateCardsDialog } from '../flashcards/GenerateCardsDialog'
import { useUi, useWideContent } from '../../lib/store'
import { cn } from '../../lib/cn'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmojiPicker } from '../../components/ui/EmojiPicker'
import { EmptyState } from '../../components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/Menu'
import { api, ApiError } from '../../lib/api'
import { createAutosaver } from '@core/autosave'
import { mergeBlocks } from '@core/domain/blocks'
import { toast } from 'sonner'
import { courseColor } from '../../lib/colors'
import { queryClient, useCourse, usePage, usePageAncestors } from '../../lib/queries'
import { pageRoute } from '../../router'
import { Editor, type EditorHandle } from './Editor'
import { usePageActions } from './usePageActions'
import { useQuery } from '@tanstack/react-query'

const SAVE_DELAY = 500

export function PageView() {
  const { pageId } = pageRoute.useParams()
  const page = usePage(pageId)
  if (page.isError) return <EmptyState title="This page no longer exists." />
  if (!page.data) return null
  if (page.data.deletedAt) return <EmptyState title="This page is in the trash." >Restore it from Settings → Trash.</EmptyState>
  return <PageEditor key={pageId} page={page.data} />
}

type PageData = NonNullable<ReturnType<typeof usePage>['data']>

function PageEditor({ page }: { page: PageData }) {
  const actions = usePageActions()
  const ask = useUi((s) => s.askAssistant)
  const roomy = useWideContent()
  const [generate, setGenerate] = useState(false)
  const ancestors = usePageAncestors(page.id)
  const editorRef = useRef<EditorHandle>(null)
  const [title, setTitle] = useState(page.title)
  const base = useRef(page.updatedAt)
  const ownVersions = useRef(new Set<string>([page.updatedAt]))
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'error'>('saved')
  const initialContent = useMemo(() => JSON.parse(page.content) as unknown[], []) // eslint-disable-line react-hooks/exhaustive-deps

  const saver = useMemo(
    () =>
      createAutosaver<unknown[]>({
        delay: SAVE_DELAY,
        save: async (blocks) => {
          setSaveState('saving')
          let content = blocks
          for (let attempt = 0; ; attempt++) {
            try {
              const meta = await api.pages.updateContent({ id: page.id, content, expectedUpdatedAt: base.current })
              base.current = meta.updatedAt
              ownVersions.current.add(meta.updatedAt)
              queryClient.setQueryData(['page', page.id], (old: PageData | undefined) => (old ? { ...old, updatedAt: meta.updatedAt, content: JSON.stringify(content) } : old))
              return
            } catch (err) {
              if (!(err instanceof ApiError && err.code === 'CONFLICT') || attempt >= 2) throw err
              // Someone else (assistant, Claude via MCP) changed the page: keep both versions.
              const remote = await api.pages.get({ id: page.id })
              const remoteBlocks = JSON.parse(remote.content) as unknown[]
              const merged = mergeBlocks(content, remoteBlocks)
              editorRef.current?.appendBlocks(merged.slice(content.length))
              content = merged
              base.current = remote.updatedAt
              ownVersions.current.add(remote.updatedAt)
            }
          }
        },
        onSaved: () => setSaveState('saved'),
        onError: (err) => {
          setSaveState('error')
          toast.error(`Could not save “${page.title || 'Untitled'}”: ${err instanceof Error ? err.message : String(err)}. Retrying…`, { id: `save-${page.id}` })
        }
      }),
    [page.id] // eslint-disable-line react-hooks/exhaustive-deps
  )

  const flush = useCallback(() => saver.flush(), [saver])

  useEffect(
    () => () => {
      saver.flush().catch(() => toast.error('Your latest changes to this page could not be saved.'))
      saver.dispose()
    },
    [saver]
  )
  useEffect(() => setTitle(page.title), [page.title])

  const external = ownVersions.current.has(page.updatedAt) ? undefined : { content: JSON.parse(page.content) as unknown[], version: page.updatedAt }

  const onExternalApplied = useCallback((version: string) => {
    base.current = version
    ownVersions.current.add(version)
  }, [])

  const saveTitle = async () => {
    if (title === page.title) return
    await api.pages.update({ id: page.id, patch: { title } })
    void queryClient.invalidateQueries({ queryKey: ['pages'] })
    void queryClient.invalidateQueries({ queryKey: ['page', page.id] })
  }

  const setIcon = async (icon: string | null) => {
    await api.pages.update({ id: page.id, patch: { icon } })
    void queryClient.invalidateQueries({ queryKey: ['pages'] })
    void queryClient.invalidateQueries({ queryKey: ['page', page.id] })
  }

  return (
    <div className={cn('mx-auto px-16 pt-12 pb-40 transition-[max-width] duration-200', roomy ? 'max-w-5xl' : 'max-w-3xl')}>
      <div className="no-drag mb-8 flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <Breadcrumbs courseId={page.courseId} ancestors={ancestors.data ?? []} />
          {saveState !== 'saved' && <span className={saveState === 'error' ? 'text-[12px] text-danger' : 'text-[12px] text-faint'}>{saveState === 'error' ? 'Not saved' : 'Saving…'}</span>}
        </div>
        <Menu>
          <MenuTrigger className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink" aria-label="Page actions">
            <MoreHorizontal size={18} />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<Sparkles size={14} />} onSelect={() => void flush().catch(() => {}).then(() => ask(`Summarize my note page "${title || 'Untitled'}" in a few bullet points and point out anything that seems unclear or missing.`, page.courseId))}>
              Summarize with assistant
            </MenuItem>
            <MenuItem icon={<Layers size={14} />} onSelect={() => void flush().catch(() => {}).then(() => setGenerate(true))}>
              Generate flashcards
            </MenuItem>
            <MenuItem icon={<MessageSquare size={14} />} onSelect={() => void flush().catch(() => {}).then(() => ask(`About my note page "${title || 'Untitled'}": `, page.courseId))}>
              Ask about this page
            </MenuItem>
            <MenuItem icon={<Copy size={14} />} onSelect={() => void flush().catch(() => {}).then(() => actions.duplicate(page.id))}>
              Duplicate
            </MenuItem>
            <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => void flush().catch(() => {}).then(() => actions.trash(page.id, title))}>
              Move to trash
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>

      <div className="group">
        {page.icon ? (
          <EmojiPicker value={page.icon} onChange={setIcon}>
            <button className="mb-2 -ml-1 rounded-md px-1 text-[56px] leading-none hover:bg-hover" aria-label="Change icon">
              {page.icon}
            </button>
          </EmojiPicker>
        ) : (
          <EmojiPicker value={null} onChange={setIcon}>
            <button className="mb-1 flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[13px] text-faint opacity-0 group-hover:opacity-100 hover:bg-hover hover:text-muted">
              <Smile size={14} /> Add icon
            </button>
          </EmojiPicker>
        )}
        <textarea
          rows={1}
          value={title}
          placeholder="Untitled"
          onChange={(e) => setTitle(e.target.value.replace(/\n/g, ''))}
          onBlur={() => void saveTitle()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void saveTitle()
              editorRef.current?.focus()
            }
          }}
          ref={(el) => {
            if (el) {
              el.style.height = '0'
              el.style.height = `${el.scrollHeight}px`
            }
          }}
          className="w-full resize-none overflow-hidden bg-transparent font-serif text-[40px] leading-[1.15] font-semibold tracking-tight outline-none placeholder:text-faint/70"
        />
      </div>

      <div className="mt-4">
        <Editor
          ref={editorRef}
          pageId={page.id}
          courseId={page.courseId}
          initialContent={initialContent}
          externalContent={external}
          onExternalApplied={onExternalApplied}
          onChange={(blocks) => {
            setSaveState('saving')
            saver.schedule(blocks)
          }}
        />
      </div>
      <Backlinks pageId={page.id} />
      <GenerateCardsDialog open={generate} onOpenChange={setGenerate} page={{ id: page.id, title, courseId: page.courseId }} />
    </div>
  )
}

function Breadcrumbs({ courseId, ancestors }: { courseId: string | null; ancestors: { id: string; title: string; icon: string | null }[] }) {
  const course = useCourse(courseId ?? '')
  return (
    <nav className="flex min-w-0 items-center gap-1 text-[13px] text-muted">
      {courseId && course.data && (
        <Link to="/courses/$courseId" params={{ courseId }} search={{ tab: 'notes' }} className="flex items-center gap-1.5 truncate rounded px-1 hover:bg-hover hover:text-ink">
          <span className="h-2.5 w-2.5 rounded-full" style={{ background: courseColor(course.data.color).solid }} />
          {course.data.name}
        </Link>
      )}
      {!courseId && <span className="px-1">Pages</span>}
      {ancestors.map((a) => (
        <span key={a.id} className="flex min-w-0 items-center gap-1">
          <span className="text-faint">/</span>
          <Link to="/pages/$pageId" params={{ pageId: a.id }} className="truncate rounded px-1 hover:bg-hover hover:text-ink">
            {a.icon} {a.title || 'Untitled'}
          </Link>
        </span>
      ))}
    </nav>
  )
}

function Backlinks({ pageId }: { pageId: string }) {
  const links = useQuery({ queryKey: ['page', pageId, 'backlinks'], queryFn: () => api.pages.backlinks({ id: pageId }) })
  if (!links.data?.length) return null
  return (
    <section className="mt-16 border-t border-line pt-4">
      <h2 className="mb-2 text-[13px] font-medium text-muted">Linked from</h2>
      <ul className="flex flex-col">
        {links.data.map((l) => (
          <li key={l.id}>
            <Link to="/pages/$pageId" params={{ pageId: l.id }} className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-hover">
              <span className="w-4 text-center text-muted">{l.icon ?? '↳'}</span>
              {l.title || 'Untitled'}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
