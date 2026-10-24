import { useNavigate } from '@tanstack/react-router'
import { Archive, MessageSquare, MoreHorizontal, Pencil, Trash2 } from 'lucide-react'
import { useUi } from '../../lib/store'
import { useEffect, useState } from 'react'
import { EmptyState } from '../../components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/Menu'
import { Tabs } from '../../components/ui/Tabs'
import { Textarea } from '../../components/ui/Input'
import { confirm } from '../../components/ui/confirm'
import { api } from '../../lib/api'
import { courseColor } from '../../lib/colors'
import { useApiMutation, useCourse, useSessions } from '../../lib/queries'
import { courseRoute } from '../../router'
import { AssignmentList } from '../assignments/AssignmentList'
import { CourseGrades } from '../grades/CourseGrades'
import { CourseFiles } from '../files/CourseFiles'
import { Decks } from '../flashcards/Decks'
import { PageTree } from '../pages/PageTree'
import { usePageActions } from '../pages/usePageActions'
import { Button } from '../../components/ui/Button'
import { Plus } from 'lucide-react'
import { CourseDialog, SESSION_KIND_LABEL, WEEKDAYS } from './CourseDialog'

export type CourseTab = 'overview' | 'notes' | 'assignments' | 'files' | 'grades' | 'cards'

const TABS: { value: CourseTab; label: string }[] = [
  { value: 'overview', label: 'Overview' },
  { value: 'notes', label: 'Notes' },
  { value: 'assignments', label: 'Assignments' },
  { value: 'files', label: 'Materials' },
  { value: 'grades', label: 'Grades' },
  { value: 'cards', label: 'Flashcards' }
]

export function CourseView() {
  const { courseId } = courseRoute.useParams()
  const { tab = 'overview' } = courseRoute.useSearch()
  const navigate = useNavigate()
  const course = useCourse(courseId)
  const sessions = useSessions(courseId)
  const [editOpen, setEditOpen] = useState(false)
  const ask = useUi((s) => s.askAssistant)
  const update = useApiMutation((patch: Parameters<typeof api.courses.update>[0]['patch']) => api.courses.update({ id: courseId, patch }))
  const remove = useApiMutation(() => api.courses.remove({ id: courseId }), { success: 'Course deleted' })

  if (course.isError) return <EmptyState title="This course no longer exists." />
  if (!course.data) return null
  const c = course.data
  const color = courseColor(c.color)
  const meta = [c.code, c.ects ? `${c.ects} ECTS` : null, c.lecturer, c.location].filter(Boolean)

  return (
    <div className="mx-auto max-w-5xl px-10 pt-12 pb-24">
      <header className="relative mb-5 pl-5">
        <span className="absolute top-1 bottom-1 left-0 w-1.5 rounded-full" style={{ background: color.solid }} />
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-1 text-[34px] leading-none">{c.icon ?? '📘'}</div>
            <h1 className="font-serif text-[32px] leading-tight font-semibold tracking-tight">{c.name}</h1>
            {meta.length > 0 && (
              <p className="mt-1 flex flex-wrap gap-x-3 text-[13px] text-muted">
                {meta.map((m) => (
                  <span key={m}>{m}</span>
                ))}
                {c.gradingMode === 'pass_fail' && <span>Pass / fail</span>}
              </p>
            )}
          </div>
          <Menu>
            <MenuTrigger className="no-drag rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink" aria-label="Course actions">
              <MoreHorizontal size={18} />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem icon={<MessageSquare size={14} />} onSelect={() => ask('', courseId)}>
                Ask assistant about this course
              </MenuItem>
              <MenuItem icon={<Pencil size={14} />} onSelect={() => setEditOpen(true)}>
                Edit course
              </MenuItem>
              <MenuItem icon={<Archive size={14} />} onSelect={() => update.mutate({ archived: !c.archived })}>
                {c.archived ? 'Unarchive' : 'Archive'}
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash2 size={14} />}
                onSelect={async () => {
                  const ok = await confirm({
                    title: `Delete ${c.name}?`,
                    body: 'Notes, assignments, files, grades and flashcards of this course will be deleted. Backups keep older versions.',
                    confirmLabel: 'Delete course',
                    danger: true
                  })
                  if (ok) remove.mutate(undefined, { onSuccess: () => void navigate({ to: '/today' }) })
                }}
              >
                Delete course
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      <Tabs value={tab} onChange={(t) => void navigate({ to: '/courses/$courseId', params: { courseId }, search: { tab: t } })} items={TABS} />

      <div className="pt-6">
        {tab === 'overview' && <Overview courseId={courseId} overview={c.overview ?? ''} sessions={sessions.data ?? []} onSave={(overview) => update.mutate({ overview })} />}
        {tab === 'notes' && <Notes courseId={courseId} />}
        {tab === 'assignments' && <AssignmentList courseId={courseId} />}
        {tab === 'grades' && <CourseGrades course={c} />}
        {tab === 'files' && <CourseFiles courseId={courseId} />}
        {tab === 'cards' && <Decks courseId={courseId} />}
      </div>

      <CourseDialog open={editOpen} onOpenChange={setEditOpen} semesterId={c.semesterId} course={c} sessions={sessions.data} />
    </div>
  )
}

function Overview({
  overview,
  sessions,
  onSave
}: {
  courseId: string
  overview: string
  sessions: NonNullable<ReturnType<typeof useSessions>['data']>
  onSave: (v: string) => void
}) {
  const [text, setText] = useState(overview)
  useEffect(() => setText(overview), [overview])

  return (
    <div className="grid grid-cols-[1fr_280px] gap-10">
      <section>
        <h2 className="mb-2 text-[13px] font-medium text-muted">About this course</h2>
        <Textarea
          className="min-h-32 border-transparent bg-transparent px-0 hover:border-line focus:px-2.5"
          placeholder="Exam format, admission requirements, links, anything worth remembering…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => text !== overview && onSave(text)}
        />
      </section>
      <aside>
        <h2 className="mb-2 text-[13px] font-medium text-muted">Weekly schedule</h2>
        {sessions.length === 0 && <p className="text-[13px] text-faint">No regular sessions. Add them via Edit course.</p>}
        <ul className="flex flex-col gap-1.5">
          {sessions.map((s) => (
            <li key={s.id} className="flex items-baseline gap-2 text-[13px]">
              <span className="w-8 font-medium">{WEEKDAYS[s.weekday - 1]}</span>
              <span className="tabular-nums">
                {s.startTime}–{s.endTime}
              </span>
              <span className="text-muted">{SESSION_KIND_LABEL[s.kind]}</span>
              {s.location && <span className="truncate text-faint">{s.location}</span>}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  )
}

function Notes({ courseId }: { courseId: string }) {
  const actions = usePageActions()
  return (
    <div className="max-w-xl">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] text-muted">Drag pages to reorder or nest them.</p>
        <Button size="sm" variant="primary" onClick={() => void actions.create({ courseId })}>
          <Plus size={14} /> New page
        </Button>
      </div>
      <PageTree courseId={courseId} emptyHint="No notes yet. Create the first page for this course." />
    </div>
  )
}
