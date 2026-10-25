import { Link } from '@tanstack/react-router'
import { Copy, Layers, MessageSquare, MoreHorizontal, Smile, Sparkles, Trash2 } from 'lucide-react'
import { GenerateCardsDialog } from '../flashcards/GenerateCardsDialog'
import { NOTE_ZOOM, useUi, useWideContent } from '../../lib/store'
import { cn } from '../../lib/cn'
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmojiPicker } from '../../components/ui/EmojiPicker'
import { EmptyState } from '../../components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/Menu'
import { Slider } from '../../components/ui/Slider'
import { api, ApiError } from '../../lib/api'
import { createAutosaver } from '@core/autosave'
import { mergeBlocks } from '@core/domain/blocks'
import { toast } from 'sonner'
import { courseColor } from '../../lib/colors'
import { queryClient, useCourse, usePage, usePageAncestors } from '../../lib/queries'
import { pageRoute } from '../../router'
import { Editor, type EditorHandle } from './Editor'
import { usePageActions } from './usePageActions'
import { ReadingProgress } from './ReadingProgress'
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
  const zoom = useUi((s) => s.noteZoom)
  const hud = useNoteZoomShortcuts()
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
    // The column grows with the zoom so a zoomed note keeps its line length.
    <div className="mx-auto px-16 pt-12 pb-40 transition-[max-width] duration-200" style={{ maxWidth: `calc(${roomy ? 64 : 48}rem * ${zoom} + 8rem)` }}>
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
            <div className="w-64 px-2 pt-1.5 pb-2">
              <div className="mb-1 flex items-baseline justify-between text-[13px]">
                <span className="font-semibold">Zoom</span>
                <span className="text-[12px] text-faint tabular-nums">{Math.round(zoom * 100)} %</span>
              </div>
              <ZoomSlider />
            </div>
            <MenuSeparator />
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

      {/* The note's text is zoomed, not this wrapper: BlockNote's menus and table handles live next to the editor
          text and are placed in screen pixels, which an ancestor's zoom would scale a second time. */}
      <div style={{ '--note-zoom': zoom } as CSSProperties}>
      <div className="group" style={{ zoom }}>
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
      <div style={{ zoom }}>
        <Backlinks pageId={page.id} />
      </div>
      </div>
      <ZoomHud visible={hud.visible} onHover={hud.hold} />
      <ReadingProgress />
      <GenerateCardsDialog open={generate} onOpenChange={setGenerate} page={{ id: page.id, title, courseId: page.courseId }} />
    </div>
  )
}

function ZoomSlider() {
  const zoom = useUi((s) => s.noteZoom)
  const setZoom = useUi((s) => s.setNoteZoom)
  return (
    <Slider
      label="Zoom"
      value={zoom}
      min={NOTE_ZOOM.min}
      max={NOTE_ZOOM.max}
      step={NOTE_ZOOM.step}
      valueText={`${Math.round(zoom * 100)} %`}
      onChange={setZoom}
      onReset={() => setZoom(1)}
      start={<span className="w-4 text-center font-serif text-[12px] leading-none font-semibold">A</span>}
      end={<span className="w-4 text-center font-serif text-[19px] leading-none font-semibold">A</span>}
    />
  )
}

/** Shown briefly while zooming with the keyboard or trackpad, like the macOS volume overlay. */
function ZoomHud({ visible, onHover }: { visible: boolean; onHover: (hovered: boolean) => void }) {
  const zoom = useUi((s) => s.noteZoom)
  return (
    <div
      aria-hidden={!visible}
      onPointerEnter={() => onHover(true)}
      onPointerLeave={() => onHover(false)}
      className={cn(
        'no-drag fixed top-5 left-1/2 z-50 w-72 -translate-x-1/2 rounded-xl border border-line bg-raised/90 px-3.5 pt-2.5 pb-3 shadow-[0_8px_28px_rgba(0,0,0,0.18)] backdrop-blur-xl transition-all duration-300 ease-out',
        visible ? 'translate-y-0 scale-100 opacity-100' : 'pointer-events-none -translate-y-2 scale-95 opacity-0'
      )}
    >
      <div className="mb-1 flex items-baseline justify-between text-[13px]">
        <span className="font-semibold">Zoom</span>
        <span className="text-[12px] text-faint tabular-nums">{Math.round(zoom * 100)} %</span>
      </div>
      <ZoomSlider />
    </div>
  )
}

const HUD_TIMEOUT = 1400

/**
 * ⌘/Ctrl +, −, 0 and trackpad pinch zoom the note instead of the whole window.
 * Returns whether the zoom overlay is showing; `hold` keeps it open while the pointer is on it.
 */
function useNoteZoomShortcuts(): { visible: boolean; hold: (hovered: boolean) => void } {
  const [visible, setVisible] = useState(false)
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined)
  const hovered = useRef(false)
  const show = useCallback(() => {
    setVisible(true)
    clearTimeout(hide.current)
    if (!hovered.current) hide.current = setTimeout(() => setVisible(false), HUD_TIMEOUT)
  }, [])
  const hold = useCallback(
    (on: boolean) => {
      hovered.current = on
      if (on) clearTimeout(hide.current)
      else show()
    },
    [show]
  )
  useEffect(() => {
    const zoomBy = (factor: number) => {
      const { noteZoom, setNoteZoom } = useUi.getState()
      setNoteZoom(noteZoom * factor)
      show()
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return
      const { noteZoom, setNoteZoom } = useUi.getState()
      if (e.key === '+' || e.key === '=') setNoteZoom(noteZoom + NOTE_ZOOM.step)
      else if (e.key === '-') setNoteZoom(noteZoom - NOTE_ZOOM.step)
      else if (e.key === '0') setNoteZoom(1)
      else return
      e.preventDefault()
      show()
    }
    // Chromium reports a trackpad pinch as a wheel event with ctrlKey set.
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return
      e.preventDefault()
      zoomBy(Math.exp(-e.deltaY * 0.01))
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('wheel', onWheel)
      clearTimeout(hide.current)
    }
  }, [show])
  return { visible, hold }
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
