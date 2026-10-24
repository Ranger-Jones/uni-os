import { Check, ChevronRight, Plus } from 'lucide-react'
import { useState } from 'react'
import { isOverdue, OPEN_STATUS, type Assignment } from '@core/repo/assignments'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { courseColor } from '../../lib/colors'
import { dueLabel, localNow } from '../../lib/dates'
import { useApiMutation } from '../../lib/queries'
import { useAllCourses, useAssignments } from '../../lib/queries-schedule'
import { AssignmentDialog } from './AssignmentDialog'

const PRIORITY_DOT: Record<Assignment['priority'], string> = { low: 'bg-faint/50', medium: 'bg-warn', high: 'bg-danger' }

export function AssignmentRow({ a, showCourse, onOpen }: { a: Assignment; showCourse?: boolean; onOpen: () => void }) {
  const courses = useAllCourses()
  const course = courses.data?.find((c) => c.id === a.courseId)
  const done = !OPEN_STATUS.includes(a.status)
  const overdue = isOverdue(a, localNow())
  const toggle = useApiMutation(() => api.assignments.update({ id: a.id, patch: { status: done ? 'todo' : 'done' } }))

  return (
    <div onClick={onOpen} className="group flex min-h-9 items-center gap-3 rounded-md px-2 py-1.5 hover:bg-hover">
      <button
        onClick={(e) => {
          e.stopPropagation()
          toggle.mutate(undefined)
        }}
        aria-label={done ? 'Mark as not done' : 'Mark as done'}
        className={cn(
          'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] transition-colors',
          done ? 'border-ok bg-ok text-white' : 'border-faint hover:border-ok'
        )}
      >
        {done && <Check size={11} strokeWidth={3} />}
      </button>
      <span className={cn('min-w-0 flex-1 truncate text-sm', done && 'text-muted line-through decoration-faint')}>{a.title}</span>
      {a.status === 'in_progress' && <span className="text-[12px] text-accent">In progress</span>}
      {showCourse && course && (
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-muted">
          <span className="h-2 w-2 rounded-full" style={{ background: courseColor(course.color).solid }} />
          {course.name}
        </span>
      )}
      <span className={cn('h-1.5 w-1.5 shrink-0 rounded-full', PRIORITY_DOT[a.priority])} title={`${a.priority} priority`} />
      <span className={cn('w-28 shrink-0 text-right text-[12.5px] tabular-nums', overdue ? 'font-medium text-danger' : 'text-muted')}>{a.dueAt ? dueLabel(a.dueAt) : '—'}</span>
    </div>
  )
}

export function AssignmentList({ courseId }: { courseId?: string }) {
  const list = useAssignments(courseId ? { courseId } : {})
  const [editing, setEditing] = useState<Assignment | undefined>()
  const [dialog, setDialog] = useState(false)
  const [showDone, setShowDone] = useState(false)
  const all = list.data ?? []
  const open = all.filter((a) => OPEN_STATUS.includes(a.status))
  const closed = all.filter((a) => !OPEN_STATUS.includes(a.status))
  const edit = (a?: Assignment) => {
    setEditing(a)
    setDialog(true)
  }

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[13px] text-muted">{open.length === 0 ? 'Nothing open.' : `${open.length} open`}</p>
        <Button size="sm" variant="primary" onClick={() => edit()}>
          <Plus size={14} /> New assignment
        </Button>
      </div>
      {all.length === 0 && !list.isLoading && <EmptyState title="No assignments yet">Track exercise sheets, essays and projects with their deadlines.</EmptyState>}
      <div className="flex flex-col">
        {open.map((a) => (
          <AssignmentRow key={a.id} a={a} showCourse={!courseId} onOpen={() => edit(a)} />
        ))}
      </div>
      {closed.length > 0 && (
        <div className="mt-4">
          <button onClick={() => setShowDone(!showDone)} className="flex items-center gap-1 px-2 text-[13px] text-muted hover:text-ink">
            <ChevronRight size={13} className={cn('transition-transform', showDone && 'rotate-90')} />
            Completed ({closed.length})
          </button>
          {showDone && closed.map((a) => <AssignmentRow key={a.id} a={a} showCourse={!courseId} onOpen={() => edit(a)} />)}
        </div>
      )}
      <AssignmentDialog open={dialog} onOpenChange={setDialog} assignment={editing} courseId={courseId} />
    </div>
  )
}
