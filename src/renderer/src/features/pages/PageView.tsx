import { Link } from '@tanstack/react-router'
import { Copy, MoreHorizontal, Smile, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EmojiPicker } from '../../components/ui/EmojiPicker'
import { EmptyState } from '../../components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '../../components/ui/Menu'
import { api } from '../../lib/api'
import { courseColor } from '../../lib/colors'
import { queryClient, useCourse, usePage, usePageAncestors } from '../../lib/queries'
import { pageRoute } from '../../router'
import { Editor, type EditorHandle } from './Editor'
import { usePageActions } from './usePageActions'

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
  const ancestors = usePageAncestors(page.id)
  const editorRef = useRef<EditorHandle>(null)
  const [title, setTitle] = useState(page.title)
  const pending = useRef<unknown[] | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const ownVersions = useRef(new Set<string>([page.updatedAt]))
  const initialContent = useMemo(() => JSON.parse(page.content) as unknown[], []) // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(async () => {
    clearTimeout(timer.current)
    const blocks = pending.current
    if (!blocks) return
    pending.current = null
    const meta = await api.pages.updateContent({ id: page.id, content: blocks })
    ownVersions.current.add(meta.updatedAt)
    queryClient.setQueryData(['page', page.id], (old: PageData | undefined) => (old ? { ...old, updatedAt: meta.updatedAt, content: JSON.stringify(blocks) } : old))
  }, [page.id])

  useEffect(() => () => void flush(), [flush])
  useEffect(() => setTitle(page.title), [page.title])

  const external = ownVersions.current.has(page.updatedAt) ? undefined : { content: JSON.parse(page.content) as unknown[], version: page.updatedAt }

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
    <div className="mx-auto max-w-3xl px-16 pt-12 pb-40">
      <div className="no-drag mb-8 flex items-center justify-between gap-4">
        <Breadcrumbs courseId={page.courseId} ancestors={ancestors.data ?? []} />
        <Menu>
          <MenuTrigger className="rounded-md p-1 text-muted hover:bg-hover hover:text-ink" aria-label="Page actions">
            <MoreHorizontal size={18} />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem icon={<Copy size={14} />} onSelect={() => void flush().then(() => actions.duplicate(page.id))}>
              Duplicate
            </MenuItem>
            <MenuItem danger icon={<Trash2 size={14} />} onSelect={() => void flush().then(() => actions.trash(page.id, title))}>
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
          initialContent={initialContent}
          externalContent={external}
          onChange={(blocks) => {
            pending.current = blocks
            clearTimeout(timer.current)
            timer.current = setTimeout(() => void flush(), SAVE_DELAY)
          }}
        />
      </div>
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
