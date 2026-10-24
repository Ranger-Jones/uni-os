import { useNavigate } from '@tanstack/react-router'
import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Course } from '@core/repo/courses'
import type { CourseSession } from '@core/repo/sessions'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { EmojiPicker } from '../../components/ui/EmojiPicker'
import { Field, Input, Select } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { COURSE_COLORS } from '../../lib/colors'
import { useApiMutation } from '../../lib/queries'

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
export const SESSION_KIND_LABEL: Record<CourseSession['kind'], string> = {
  lecture: 'Lecture',
  tutorial: 'Tutorial',
  lab: 'Lab',
  seminar: 'Seminar',
  other: 'Other'
}

type Row = Pick<CourseSession, 'kind' | 'weekday' | 'startTime' | 'endTime'> & { location: string }

interface Form {
  name: string
  code: string
  ects: string
  color: Course['color']
  icon: string | null
  lecturer: string
  location: string
  gradingMode: Course['gradingMode']
  targetGrade: string
}

const empty: Form = { name: '', code: '', ects: '5', color: 'blue', icon: null, lecturer: '', location: '', gradingMode: 'graded', targetGrade: '' }

export function CourseDialog({
  open,
  onOpenChange,
  semesterId,
  course,
  sessions
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  semesterId: string
  course?: Course
  sessions?: CourseSession[]
}) {
  const navigate = useNavigate()
  const [form, setForm] = useState<Form>(empty)
  const [rows, setRows] = useState<Row[]>([])

  useEffect(() => {
    if (!open) return
    if (course) {
      setForm({
        name: course.name,
        code: course.code ?? '',
        ects: String(course.ects),
        color: course.color,
        icon: course.icon,
        lecturer: course.lecturer ?? '',
        location: course.location ?? '',
        gradingMode: course.gradingMode,
        targetGrade: course.targetGrade?.toString() ?? ''
      })
      setRows((sessions ?? []).map((s) => ({ kind: s.kind, weekday: s.weekday, startTime: s.startTime, endTime: s.endTime, location: s.location ?? '' })))
    } else {
      setForm({ ...empty, color: (Object.keys(COURSE_COLORS) as Course['color'][])[1 + Math.floor(Math.random() * 8)] })
      setRows([])
    }
  }, [open, course, sessions])

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }))
  const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))

  const save = useApiMutation(async () => {
    const payload = {
      name: form.name,
      code: form.code || null,
      ects: num(form.ects) ?? 0,
      color: form.color,
      icon: form.icon,
      lecturer: form.lecturer || null,
      location: form.location || null,
      gradingMode: form.gradingMode,
      targetGrade: num(form.targetGrade)
    }
    const saved = course ? await api.courses.update({ id: course.id, patch: payload }) : await api.courses.create({ ...payload, semesterId })
    await api.sessions.replaceForCourse({
      courseId: saved.id,
      rows: rows.map((r) => ({ ...r, location: r.location || null }))
    })
    return saved
  })

  const submit = () =>
    save.mutate(undefined, {
      onSuccess: (c) => {
        onOpenChange(false)
        if (!course) void navigate({ to: '/courses/$courseId', params: { courseId: c.id } })
      }
    })

  const updateRow = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={course ? 'Edit course' : 'New course'}
      width="max-w-xl"
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!form.name.trim() || save.isPending} onClick={submit}>
            {course ? 'Save changes' : 'Create course'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-end gap-3">
          <EmojiPicker value={form.icon} onChange={(e) => set('icon', e)}>
            <button className="flex h-8 w-10 items-center justify-center rounded-md border border-line text-lg hover:bg-hover" aria-label="Choose icon">
              {form.icon ?? '📘'}
            </button>
          </EmojiPicker>
          <Field label="Course name" className="flex-1">
            <Input autoFocus value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Analysis I" onKeyDown={(e) => e.key === 'Enter' && form.name.trim() && submit()} />
          </Field>
          <Field label="Code" className="w-28">
            <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="MA-101" />
          </Field>
        </div>

        <div className="flex items-center gap-1.5">
          {(Object.entries(COURSE_COLORS) as [Course['color'], (typeof COURSE_COLORS)[Course['color']]][]).map(([key, c]) => (
            <button
              key={key}
              title={c.label}
              aria-label={c.label}
              onClick={() => set('color', key)}
              className={cn('h-5 w-5 rounded-full ring-offset-2 ring-offset-raised', form.color === key && 'ring-2 ring-ink/40')}
              style={{ background: c.solid }}
            />
          ))}
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Field label="ECTS">
            <Input inputMode="decimal" value={form.ects} onChange={(e) => set('ects', e.target.value)} />
          </Field>
          <Field label="Grading">
            <Select value={form.gradingMode} onChange={(e) => set('gradingMode', e.target.value as Course['gradingMode'])}>
              <option value="graded">Graded (1.0–5.0)</option>
              <option value="pass_fail">Pass / fail</option>
            </Select>
          </Field>
          <Field label="Target grade">
            <Input inputMode="decimal" placeholder="e.g. 1.7" disabled={form.gradingMode === 'pass_fail'} value={form.targetGrade} onChange={(e) => set('targetGrade', e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Lecturer">
            <Input value={form.lecturer} onChange={(e) => set('lecturer', e.target.value)} placeholder="Prof. Dr. …" />
          </Field>
          <Field label="Room">
            <Input value={form.location} onChange={(e) => set('location', e.target.value)} placeholder="Audimax" />
          </Field>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[13px] font-medium text-muted">Weekly schedule</span>
            <Button size="sm" variant="ghost" onClick={() => setRows((r) => [...r, { kind: 'lecture', weekday: 1, startTime: '10:00', endTime: '12:00', location: form.location }])}>
              <Plus size={14} /> Add time
            </Button>
          </div>
          {rows.length === 0 && <p className="text-[13px] text-faint">No regular sessions yet.</p>}
          <div className="flex flex-col gap-1.5">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Select className="w-28" value={r.kind} onChange={(e) => updateRow(i, { kind: e.target.value as Row['kind'] })}>
                  {Object.entries(SESSION_KIND_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
                <Select className="w-20" value={r.weekday} onChange={(e) => updateRow(i, { weekday: Number(e.target.value) })}>
                  {WEEKDAYS.map((d, j) => (
                    <option key={d} value={j + 1}>
                      {d}
                    </option>
                  ))}
                </Select>
                <Input type="time" className="w-24" value={r.startTime} onChange={(e) => updateRow(i, { startTime: e.target.value })} />
                <span className="text-faint">–</span>
                <Input type="time" className="w-24" value={r.endTime} onChange={(e) => updateRow(i, { endTime: e.target.value })} />
                <Input className="flex-1" placeholder="Room" value={r.location} onChange={(e) => updateRow(i, { location: e.target.value })} />
                <button className="rounded p-1 text-muted hover:bg-hover hover:text-ink" aria-label="Remove time" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Dialog>
  )
}
