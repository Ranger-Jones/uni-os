import { isModKey } from '../../lib/platform'
import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { Command } from 'cmdk'
import { BookOpen, CalendarDays, FileText, GraduationCap, Paperclip, Plus, Settings, Sun, SquareCheck } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import * as D from '@radix-ui/react-dialog'
import type { SearchHit } from '@core/repo/search'
import { api } from '../../lib/api'
import { courseColor } from '../../lib/colors'
import { useActiveSemester, useCourses } from '../../lib/queries'
import { useUi } from '../../lib/store'
import { usePageActions } from '../../features/pages/usePageActions'

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const HIT_ICON: Record<SearchHit['entityType'], ReactNode> = {
  page: <FileText size={15} />,
  file: <Paperclip size={15} />,
  assignment: <SquareCheck size={15} />,
  course: <BookOpen size={15} />
}

/** Renders «highlight» markers from FTS snippets. */
function Snippet({ text }: { text: string }) {
  const parts = text.split(/(«[^»]*»)/g)
  return (
    <span className="truncate text-[12px] text-muted">
      {parts.map((p, i) => (p.startsWith('«') ? <mark key={i} className="rounded-sm bg-accent-soft px-0.5 text-ink">{p.slice(1, -1)}</mark> : p))}
    </span>
  )
}

export function CommandPalette() {
  const open = useUi((s) => s.paletteOpen)
  const setOpen = useUi((s) => s.setPaletteOpen)
  const navigate = useNavigate()
  const pageActions = usePageActions()
  const { semester } = useActiveSemester()
  const courses = useCourses({ semesterId: semester?.id })
  const [q, setQ] = useState('')
  const dq = useDebounced(q, 120)
  const hits = useQuery({ queryKey: ['search', dq], queryFn: () => api.search.query({ q: dq }), enabled: dq.trim().length > 1 })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isModKey(e) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(!useUi.getState().paletteOpen)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  useEffect(() => {
    if (!open) setQ('')
  }, [open])

  const run = (fn: () => void) => {
    setOpen(false)
    fn()
  }
  const courseName = (id: string | null) => courses.data?.find((c) => c.id === id)?.name

  const openHit = (h: SearchHit) => {
    if (h.entityType === 'page') void navigate({ to: '/pages/$pageId', params: { pageId: h.entityId } })
    else if (h.courseId) void navigate({ to: '/courses/$courseId', params: { courseId: h.courseId }, search: { tab: h.entityType === 'file' ? 'files' : 'assignments' } })
  }

  const item = 'flex h-9 cursor-default items-center gap-2.5 rounded-md px-2.5 text-[13.5px] data-[selected=true]:bg-hover'

  return (
    <D.Root open={open} onOpenChange={setOpen}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/20 dark:bg-black/45" />
        <D.Content className="fixed top-[14vh] left-1/2 z-50 w-[620px] max-w-[calc(100vw-32px)] -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-raised shadow-[0_20px_60px_rgba(0,0,0,0.22)]">
          <D.Title className="sr-only">Search</D.Title>
          <D.Description className="sr-only">Search notes, files and assignments, or run a command</D.Description>
          <Command shouldFilter={dq.trim().length < 2} loop>
            <Command.Input
              autoFocus
              value={q}
              onValueChange={setQ}
              placeholder="Search notes, files, assignments… or type a command"
              className="h-12 w-full border-b border-line bg-transparent px-4 text-[15px] outline-none placeholder:text-faint"
            />
            <Command.List className="max-h-[52vh] overflow-y-auto p-1.5">
              <Command.Empty className="px-3 py-6 text-center text-[13px] text-muted">{hits.isFetching ? 'Searching…' : 'No results.'}</Command.Empty>
              {dq.trim().length > 1 && (hits.data?.length ?? 0) > 0 && (
                <Command.Group heading="Results" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint">
                  {hits.data!.map((h) => (
                    <Command.Item key={`${h.entityType}:${h.entityId}`} value={`${h.entityType}:${h.entityId}`} onSelect={() => run(() => openHit(h))} className={`${item} h-auto py-1.5`}>
                      <span className="text-muted">{HIT_ICON[h.entityType]}</span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate">
                          {h.title}
                          {h.courseId && <span className="ml-2 text-[12px] text-faint">{courseName(h.courseId)}</span>}
                        </span>
                        <Snippet text={h.snippet} />
                      </span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
              {dq.trim().length < 2 && (
                <>
                  <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint">
                    {courses.data?.map((c) => (
                      <Command.Item key={c.id} value={`course ${c.name} ${c.code ?? ''}`} onSelect={() => run(() => void navigate({ to: '/courses/$courseId', params: { courseId: c.id } }))} className={item}>
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: courseColor(c.color).solid }} />
                        {c.name}
                      </Command.Item>
                    ))}
                    <Command.Item value="today" onSelect={() => run(() => void navigate({ to: '/today' }))} className={item}>
                      <Sun size={15} className="text-muted" /> Today
                    </Command.Item>
                    <Command.Item value="calendar" onSelect={() => run(() => void navigate({ to: '/calendar' }))} className={item}>
                      <CalendarDays size={15} className="text-muted" /> Calendar
                    </Command.Item>
                    <Command.Item value="grades" onSelect={() => run(() => void navigate({ to: '/grades' }))} className={item}>
                      <GraduationCap size={15} className="text-muted" /> Grades
                    </Command.Item>
                    <Command.Item value="settings" onSelect={() => run(() => void navigate({ to: '/settings' }))} className={item}>
                      <Settings size={15} className="text-muted" /> Settings
                    </Command.Item>
                  </Command.Group>
                  <Command.Group heading="Create" className="[&_[cmdk-group-heading]]:px-2.5 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:text-faint">
                    <Command.Item value="new page" onSelect={() => run(() => void pageActions.create({ courseId: null }))} className={item}>
                      <Plus size={15} className="text-muted" /> New page
                    </Command.Item>
                    {courses.data?.map((c) => (
                      <Command.Item key={c.id} value={`new page in ${c.name}`} onSelect={() => run(() => void pageActions.create({ courseId: c.id }))} className={item}>
                        <Plus size={15} className="text-muted" /> New page in {c.name}
                      </Command.Item>
                    ))}
                  </Command.Group>
                </>
              )}
            </Command.List>
          </Command>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}
