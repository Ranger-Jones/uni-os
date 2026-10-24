import { useQuery } from '@tanstack/react-query'
import { Loader2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { QUESTION_TYPES, solutionText, toQuestionInput, TYPE_LABEL, type NormalizedQuestion, type QuestionType, type TestKind } from '@core/domain/tests'
import type { PageNode } from '@core/repo/pages'
import { Button } from '../../components/ui/Button'
import { Dialog } from '../../components/ui/Dialog'
import { Field, Input, Textarea } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { queryClient, usePageTree } from '../../lib/queries'
import { Markdown } from '../chat/Markdown'
import { md } from './AnswerInput'

const flatten = (nodes: PageNode[], depth = 0): { id: string; title: string; icon: string | null; depth: number }[] =>
  nodes.flatMap((n) => [{ id: n.id, title: n.title || 'Untitled', icon: n.icon, depth }, ...flatten(n.children, depth + 1)])

/** Let the assistant write a quiz or exam from chosen course pages and files — or more questions for an existing test. */
export function GenerateTestDialog({
  open,
  onOpenChange,
  courseId,
  addTo,
  onSaved
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  courseId: string
  addTo?: { id: string; kind: TestKind; title: string }
  onSaved: (testId: string) => void
}) {
  const tree = usePageTree(courseId)
  const files = useQuery({ queryKey: ['files', courseId], queryFn: () => api.files.list({ courseId }), enabled: open })
  const pages = useMemo(() => flatten(tree.data ?? []), [tree.data])
  const textFiles = (files.data ?? []).filter((f) => f.hasText)

  const [kind, setKind] = useState<TestKind>('quiz')
  const [pageIds, setPageIds] = useState<string[]>([])
  const [fileIds, setFileIds] = useState<string[]>([])
  const [count, setCount] = useState('10')
  const [types, setTypes] = useState<QuestionType[]>([...QUESTION_TYPES])
  const [timeLimit, setTimeLimit] = useState('')
  const [focus, setFocus] = useState('')
  const [state, setState] = useState<'setup' | 'loading' | 'review'>('setup')
  const [title, setTitle] = useState('')
  const [proposals, setProposals] = useState<(NormalizedQuestion & { keep: boolean })[]>([])
  const [dropped, setDropped] = useState(0)
  const [saving, setSaving] = useState(false)
  const effectiveKind = addTo?.kind ?? kind

  useEffect(() => {
    if (!open) return
    setState('setup')
    setProposals([])
    setFocus('')
    setPageIds([])
    setFileIds([])
  }, [open])
  useEffect(() => setCount(effectiveKind === 'quiz' ? '10' : '15'), [effectiveKind])

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const n = Math.min(50, Math.max(1, Number(count) || 0))
  const canGenerate = (pageIds.length > 0 || fileIds.length > 0) && types.length > 0 && n > 0

  const generate = async () => {
    setState('loading')
    try {
      const r = await api.tests.generate({ courseId, pageIds, fileIds, kind: effectiveKind, count: n, types, focus })
      setTitle(r.title)
      setProposals(r.questions.map((q) => ({ ...q, keep: true })))
      setDropped(r.dropped)
      setState('review')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
      setState('setup')
    }
  }

  const kept = proposals.filter((p) => p.keep)
  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      const questions = kept.map(({ keep: _k, ...q }) => toQuestionInput(q))
      let id = addTo?.id
      if (id) await api.tests.addQuestions({ testId: id, questions })
      else {
        const minutes = Number(timeLimit)
        const t = await api.tests.create({ courseId, kind, title: title.trim() || (kind === 'quiz' ? 'Quiz' : 'Mock exam'), timeLimitMin: kind === 'exam' && minutes > 0 ? Math.round(minutes) : null, questions })
        id = t.id
      }
      toast.success(addTo ? `Added ${questions.length} questions` : `Created “${title.trim() || 'Quiz'}” with ${questions.length} questions`)
      onOpenChange(false)
      onSaved(id)
      void queryClient.invalidateQueries()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setSaving(false)
    }
  }

  const footer =
    state === 'review' ? (
      <>
        <Button variant="ghost" onClick={() => setState('setup')}>
          Back
        </Button>
        <Button variant="primary" disabled={!kept.length || saving} onClick={() => void save()}>
          {addTo ? `Add ${kept.length} questions` : `Save ${effectiveKind === 'quiz' ? 'quiz' : 'exam'} with ${kept.length} questions`}
        </Button>
      </>
    ) : (
      <>
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button variant="primary" disabled={!canGenerate || state === 'loading'} onClick={() => void generate()}>
          {state === 'loading' && <Loader2 size={14} className="animate-spin" />} Generate {n} questions
        </Button>
      </>
    )

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      width="max-w-2xl"
      title={addTo ? `More questions for “${addTo.title}”` : 'Generate a quiz or test exam'}
      description={state === 'review' ? 'Untick questions you don’t want, then save.' : 'Pick the material — the assistant writes questions with solutions from it.'}
      footer={footer}
    >
      {state === 'loading' && <p className="py-16 text-center text-[13px] text-muted">The assistant is reading the material and writing questions…</p>}

      {state === 'setup' && (
        <div className="flex flex-col gap-4">
          {!addTo && (
            <div className="grid grid-cols-2 gap-2">
              {(['quiz', 'exam'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  className={cn('rounded-lg border p-3 text-left', kind === k ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover')}
                >
                  <p className="text-[14px] font-medium">{k === 'quiz' ? 'Quiz' : 'Test exam'}</p>
                  <p className="text-[12.5px] text-muted">{k === 'quiz' ? 'Short, feedback after every question' : 'Mock exam with points, optional time limit, graded at the end'}</p>
                </button>
              ))}
            </div>
          )}

          <Field label={`Pages (${pageIds.length} selected)`}>
            <div className="max-h-52 overflow-y-auto rounded-md border border-line p-1">
              {pages.length === 0 && <p className="p-2 text-[13px] text-faint">This course has no pages yet.</p>}
              {pages.length > 1 && (
                <button className="px-2 py-1 text-[12px] text-accent hover:underline" onClick={() => setPageIds(pageIds.length === pages.length ? [] : pages.map((p) => p.id))}>
                  {pageIds.length === pages.length ? 'Select none' : 'Select all'}
                </button>
              )}
              {pages.map((p) => (
                <label key={p.id} className="flex h-7 items-center gap-2 rounded px-2 text-[13px] hover:bg-hover" style={{ paddingLeft: 8 + p.depth * 16 }}>
                  <input type="checkbox" checked={pageIds.includes(p.id)} onChange={() => setPageIds(toggle(pageIds, p.id))} />
                  <span className="w-4 text-center">{p.icon ?? '📄'}</span>
                  <span className="truncate">{p.title}</span>
                </label>
              ))}
            </div>
          </Field>

          {textFiles.length > 0 && (
            <Field label={`Materials with text (${fileIds.length} selected)`}>
              <div className="max-h-36 overflow-y-auto rounded-md border border-line p-1">
                {textFiles.map((f) => (
                  <label key={f.id} className="flex h-7 items-center gap-2 rounded px-2 text-[13px] hover:bg-hover">
                    <input type="checkbox" checked={fileIds.includes(f.id)} onChange={() => setFileIds(toggle(fileIds, f.id))} />
                    <span className="truncate">{f.name}</span>
                  </label>
                ))}
              </div>
            </Field>
          )}

          <div className="grid grid-cols-[120px_1fr] gap-4">
            <Field label="Questions">
              <Input type="number" min={1} max={50} value={count} onChange={(e) => setCount(e.target.value)} />
            </Field>
            <Field label="Question types">
              <div className="flex flex-wrap gap-1.5">
                {QUESTION_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypes(toggle(types, t))}
                    className={cn('h-8 rounded-md border px-2.5 text-[12.5px]', types.includes(t) ? 'border-accent bg-accent-soft text-accent' : 'border-line text-muted hover:bg-hover')}
                  >
                    {TYPE_LABEL[t]}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          {!addTo && kind === 'exam' && (
            <Field label="Time limit in minutes (optional)">
              <Input type="number" min={1} className="max-w-32" placeholder="e.g. 90" value={timeLimit} onChange={(e) => setTimeLimit(e.target.value)} />
            </Field>
          )}
          <Field label="Focus (optional)">
            <Textarea className="min-h-16" placeholder="e.g. calculations with entropy and information gain; exam level difficulty" value={focus} onChange={(e) => setFocus(e.target.value)} />
          </Field>
        </div>
      )}

      {state === 'review' && (
        <div className="flex flex-col gap-3">
          {!addTo && (
            <Field label="Title">
              <Input value={title} onChange={(e) => setTitle(e.target.value)} />
            </Field>
          )}
          {dropped > 0 && <p className="text-[12.5px] text-warn">{dropped} malformed question{dropped === 1 ? ' was' : 's were'} skipped.</p>}
          {proposals.map((q, i) => (
            <label key={i} className={cn('flex gap-3 rounded-lg border border-line p-3', !q.keep && 'opacity-50')}>
              <input type="checkbox" className="mt-1" checked={q.keep} onChange={() => setProposals((ps) => ps.map((p, j) => (j === i ? { ...p, keep: !p.keep } : p)))} />
              <div className="min-w-0 flex-1">
                <p className="mb-1 text-[11.5px] text-muted">
                  {TYPE_LABEL[q.type]} · {q.points} pt{q.points === 1 ? '' : 's'}
                </p>
                <Markdown text={q.prompt} className="text-[13.5px]" />
                {q.options.length > 0 && (
                  <ul className="mt-1 list-disc pl-5 text-[13px] text-muted">
                    {q.options.map((o, j) => (
                      <li key={j}>
                        <Markdown text={o} className={md} />
                      </li>
                    ))}
                  </ul>
                )}
                <div className="mt-1 text-[13px]">
                  <span className="text-ok">Answer: </span>
                  <Markdown text={solutionText(q)} className={md} />
                </div>
              </div>
            </label>
          ))}
        </div>
      )}
    </Dialog>
  )
}
