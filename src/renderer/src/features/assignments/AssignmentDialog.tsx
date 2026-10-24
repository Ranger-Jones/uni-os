import { useEffect, useState } from 'react'
import type { Assignment } from '@core/repo/assignments'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input, Select, Textarea } from '../../components/ui/Input'
import { confirm } from '../../components/ui/confirm'
import { api } from '../../lib/api'
import { useApiMutation, useActiveSemester, useCourses } from '../../lib/queries'

export const STATUS_LABEL: Record<Assignment['status'], string> = { todo: 'To do', in_progress: 'In progress', done: 'Done', submitted: 'Submitted' }
export const PRIORITY_LABEL: Record<Assignment['priority'], string> = { low: 'Low', medium: 'Medium', high: 'High' }

interface Form {
  courseId: string
  title: string
  description: string
  dueDate: string
  dueTime: string
  status: Assignment['status']
  priority: Assignment['priority']
}

export function AssignmentDialog({
  open,
  onOpenChange,
  assignment,
  courseId,
  defaultDue
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  assignment?: Assignment
  courseId?: string
  defaultDue?: string
}) {
  const { semester } = useActiveSemester()
  const courses = useCourses({ semesterId: semester?.id })
  const [f, setF] = useState<Form>({ courseId: '', title: '', description: '', dueDate: '', dueTime: '', status: 'todo', priority: 'medium' })

  useEffect(() => {
    if (!open) return
    if (assignment) {
      const [d, t] = (assignment.dueAt ?? '').split('T')
      setF({ courseId: assignment.courseId, title: assignment.title, description: assignment.description ?? '', dueDate: d ?? '', dueTime: t ?? '', status: assignment.status, priority: assignment.priority })
    } else {
      setF({ courseId: courseId ?? courses.data?.[0]?.id ?? '', title: '', description: '', dueDate: defaultDue ?? '', dueTime: '23:59', status: 'todo', priority: 'medium' })
    }
  }, [open, assignment, courseId, defaultDue, courses.data])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const dueAt = f.dueDate ? (f.dueTime ? `${f.dueDate}T${f.dueTime}` : f.dueDate) : null
  const payload = { courseId: f.courseId, title: f.title, description: f.description || null, dueAt, status: f.status, priority: f.priority }

  const save = useApiMutation(() => (assignment ? api.assignments.update({ id: assignment.id, patch: payload }) : api.assignments.create(payload)))
  const remove = useApiMutation(() => api.assignments.remove({ id: assignment!.id }))
  const submit = () => save.mutate(undefined, { onSuccess: () => onOpenChange(false) })

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={assignment ? 'Edit assignment' : 'New assignment'}
      footer={
        <>
          {assignment && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              onClick={async () => {
                if (await confirm({ title: 'Delete this assignment?', confirmLabel: 'Delete', danger: true })) remove.mutate(undefined, { onSuccess: () => onOpenChange(false) })
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!f.title.trim() || !f.courseId || save.isPending} onClick={submit}>
            {assignment ? 'Save changes' : 'Add assignment'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <Input autoFocus value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Exercise sheet 3" onKeyDown={(e) => e.key === 'Enter' && f.title.trim() && submit()} />
        </Field>
        {!courseId && (
          <Field label="Course">
            <Select value={f.courseId} onChange={(e) => set('courseId', e.target.value)}>
              {courses.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-[1fr_7rem] gap-3">
          <Field label="Due date">
            <Input type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
          </Field>
          <Field label="Time">
            <Input type="time" value={f.dueTime} disabled={!f.dueDate} onChange={(e) => set('dueTime', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Status">
            <Select value={f.status} onChange={(e) => set('status', e.target.value as Form['status'])}>
              {Object.entries(STATUS_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priority">
            <Select value={f.priority} onChange={(e) => set('priority', e.target.value as Form['priority'])}>
              {Object.entries(PRIORITY_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Tasks, submission link, group members…" />
        </Field>
      </div>
    </Dialog>
  )
}
