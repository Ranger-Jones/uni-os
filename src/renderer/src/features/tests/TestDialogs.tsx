import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { localDate } from '@core/util'
import type { Test } from '@core/repo/tests'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input, Textarea } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useApiMutation } from '../../lib/queries'

/** Create a test by hand (typically an old exam with its PDFs) or edit a test's details. */
export function TestDialog({ open, onOpenChange, courseId, test, onSaved }: { open: boolean; onOpenChange: (o: boolean) => void; courseId: string; test?: Test; onSaved?: (id: string) => void }) {
  const files = useQuery({ queryKey: ['files', courseId], queryFn: () => api.files.list({ courseId }), enabled: open })
  const [kind, setKind] = useState<Test['kind']>('exam')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [timeLimit, setTimeLimit] = useState('')
  const [fileIds, setFileIds] = useState<string[]>([])

  useEffect(() => {
    if (!open) return
    setKind(test?.kind ?? 'exam')
    setTitle(test?.title ?? '')
    setDescription(test?.description ?? '')
    setTimeLimit(test?.timeLimitMin ? String(test.timeLimitMin) : '')
    setFileIds(test?.fileIds ?? [])
  }, [open, test])

  const save = useApiMutation(async () => {
    const minutes = Number(timeLimit)
    const fields = { title, description: description || null, timeLimitMin: minutes > 0 ? Math.round(minutes) : null, fileIds }
    return test ? api.tests.update({ id: test.id, patch: fields }) : api.tests.create({ courseId, kind, ...fields })
  })

  const docs = (files.data ?? []).filter((f) => !f.mime.startsWith('video/'))
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={test ? 'Edit details' : 'Add a test exam'}
      description={test ? undefined : 'For an old or mock exam: attach the PDFs from Materials and record your results. You can add interactive questions later with the assistant.'}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={!title.trim() || save.isPending}
            onClick={() =>
              save.mutate(undefined, {
                onSuccess: (t) => {
                  onOpenChange(false)
                  onSaved?.(t.id)
                }
              })
            }
          >
            {test ? 'Save' : 'Add'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {!test && (
          <div className="flex gap-1.5">
            {(['exam', 'quiz'] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={cn('h-8 rounded-md border px-3 text-[13px]', kind === k ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-hover')}>
                {k === 'exam' ? 'Test exam' : 'Quiz'}
              </button>
            ))}
          </div>
        )}
        <Field label="Title">
          <Input autoFocus placeholder="e.g. Exam WS 2024/25" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Description (optional)">
          <Textarea className="min-h-16" placeholder="Source, allowed aids, which topics it covers…" value={description} onChange={(e) => setDescription(e.target.value)} />
        </Field>
        {kind === 'exam' && (
          <Field label="Time limit in minutes (optional)">
            <Input type="number" min={1} className="max-w-32" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
          </Field>
        )}
        <Field label={`Attached materials (${fileIds.length})`} hint="Add the PDFs under Materials first.">
          <div className="max-h-44 overflow-y-auto rounded-md border border-line p-1">
            {docs.length === 0 && <p className="p-2 text-[13px] text-faint">No files in this course yet.</p>}
            {docs.map((f) => (
              <label key={f.id} className="flex h-7 items-center gap-2 rounded px-2 text-[13px] hover:bg-hover">
                <input type="checkbox" checked={fileIds.includes(f.id)} onChange={() => setFileIds(fileIds.includes(f.id) ? fileIds.filter((x) => x !== f.id) : [...fileIds, f.id])} />
                <span className="truncate">{f.name}</span>
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Dialog>
  )
}

/** Record a result done on paper. */
export function PaperResultDialog({ open, onOpenChange, testId, maxPoints }: { open: boolean; onOpenChange: (o: boolean) => void; testId: string; maxPoints: number }) {
  const [date, setDate] = useState(localDate())
  const [score, setScore] = useState('')
  const [max, setMax] = useState('')
  const [note, setNote] = useState('')
  useEffect(() => {
    if (!open) return
    setDate(localDate())
    setScore('')
    setMax(maxPoints ? String(maxPoints) : '')
    setNote('')
  }, [open, maxPoints])
  const num = (s: string) => Number(s.replace(',', '.'))
  const valid = date && score !== '' && num(max) > 0 && num(score) >= 0 && num(score) <= num(max)
  const save = useApiMutation(() => api.tests.recordPaper({ testId, date, score: num(score), maxScore: num(max), note: note || null }), { success: 'Result recorded' })
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Record a result"
      description="For an exam you wrote on paper."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!valid || save.isPending} onClick={() => save.mutate(undefined, { onSuccess: () => onOpenChange(false) })}>
            Save result
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-3 gap-3">
        <Field label="Date">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Points">
          <Input inputMode="decimal" autoFocus value={score} onChange={(e) => setScore(e.target.value)} />
        </Field>
        <Field label="Out of">
          <Input inputMode="decimal" value={max} onChange={(e) => setMax(e.target.value)} />
        </Field>
        <Field label="Note (optional)" className="col-span-3">
          <Input placeholder="e.g. without formula sheet, task 4 skipped" value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
      </div>
    </Dialog>
  )
}
