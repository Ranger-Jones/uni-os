import { useEffect, useState } from 'react'
import type { CalendarEvent } from '@core/repo/events'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input, Select, Textarea } from '../../components/ui/Input'
import { confirm } from '../../components/ui/confirm'
import { api } from '../../lib/api'
import { useActiveSemester, useApiMutation, useCourses } from '../../lib/queries'

export const EVENT_KIND_LABEL: Record<CalendarEvent['kind'], string> = { exam: 'Exam', deadline: 'Deadline', appointment: 'Appointment', other: 'Other' }

interface Form {
  title: string
  kind: CalendarEvent['kind']
  courseId: string
  date: string
  endDate: string
  allDay: boolean
  start: string
  end: string
  location: string
  description: string
}

export function EventDialog({
  open,
  onOpenChange,
  event,
  defaults
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  event?: CalendarEvent
  defaults?: { date: string; start?: string; courseId?: string }
}) {
  const { semester } = useActiveSemester()
  const courses = useCourses({ semesterId: semester?.id })
  const [f, setF] = useState<Form>({ title: '', kind: 'appointment', courseId: '', date: '', endDate: '', allDay: false, start: '10:00', end: '11:00', location: '', description: '' })

  useEffect(() => {
    if (!open) return
    if (event) {
      const [d, s] = event.startsAt.split('T')
      const [ed, e] = (event.endsAt ?? '').split('T')
      setF({
        title: event.title,
        kind: event.kind,
        courseId: event.courseId ?? '',
        date: d,
        endDate: ed && ed !== d ? ed : '',
        allDay: event.allDay,
        start: s ?? '10:00',
        end: e ?? '',
        location: event.location ?? '',
        description: event.description ?? ''
      })
    } else {
      const start = defaults?.start ?? '10:00'
      const endH = String(Math.min(23, Number(start.slice(0, 2)) + 1)).padStart(2, '0')
      setF({ title: '', kind: 'appointment', courseId: defaults?.courseId ?? '', date: defaults?.date ?? '', endDate: '', allDay: false, start, end: `${endH}:${start.slice(3)}`, location: '', description: '' })
    }
  }, [open, event, defaults])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }))
  const payload = {
    title: f.title,
    kind: f.kind,
    courseId: f.courseId || null,
    allDay: f.allDay,
    startsAt: f.allDay ? f.date : `${f.date}T${f.start}`,
    endsAt: f.allDay ? f.endDate || null : f.end ? `${f.endDate || f.date}T${f.end}` : null,
    location: f.location || null,
    description: f.description || null
  }
  const save = useApiMutation(() => (event ? api.events.update({ id: event.id, patch: payload }) : api.events.create(payload)))
  const remove = useApiMutation(() => api.events.remove({ id: event!.id }))

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={event ? 'Edit event' : 'New event'}
      footer={
        <>
          {event && (
            <Button
              variant="ghost"
              className="mr-auto text-danger"
              onClick={async () => {
                if (await confirm({ title: 'Delete this event?', confirmLabel: 'Delete', danger: true })) remove.mutate(undefined, { onSuccess: () => onOpenChange(false) })
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!f.title.trim() || !f.date || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            {event ? 'Save changes' : 'Add event'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <Field label="Title">
          <Input autoFocus value={f.title} onChange={(e) => set('title', e.target.value)} placeholder="Final exam" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={f.kind} onChange={(e) => set('kind', e.target.value as Form['kind'])}>
              {Object.entries(EVENT_KIND_LABEL).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Course">
            <Select value={f.courseId} onChange={(e) => set('courseId', e.target.value)}>
              <option value="">No course</option>
              {courses.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={f.allDay} onChange={(e) => set('allDay', e.target.checked)} /> All day
        </label>
        <div className="grid grid-cols-[1fr_6.5rem_6.5rem] gap-3">
          <Field label="Date">
            <Input type="date" value={f.date} onChange={(e) => set('date', e.target.value)} />
          </Field>
          {f.allDay ? (
            <Field label="Until (optional)" className="col-span-2">
              <Input type="date" value={f.endDate} min={f.date} onChange={(e) => set('endDate', e.target.value)} />
            </Field>
          ) : (
            <>
              <Field label="From">
                <Input type="time" value={f.start} onChange={(e) => set('start', e.target.value)} />
              </Field>
              <Field label="To">
                <Input type="time" value={f.end} onChange={(e) => set('end', e.target.value)} />
              </Field>
            </>
          )}
        </div>
        <Field label="Location">
          <Input value={f.location} onChange={(e) => set('location', e.target.value)} />
        </Field>
        <Field label="Notes">
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}
