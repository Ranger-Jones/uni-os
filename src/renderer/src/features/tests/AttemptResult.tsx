import { Link } from '@tanstack/react-router'
import { ChevronLeft, CircleCheck, CircleX, FileText, Loader2, RotateCcw, Sparkles } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { gradeEstimate, percentOf, responseText, solutionText } from '@core/domain/tests'
import type { Attempt, TestWithQuestions } from '@core/repo/tests'
import { Button } from '../../components/ui/Button'
import { Input } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { queryClient } from '../../lib/queries'
import { Markdown } from '../chat/Markdown'
import { md } from './AnswerInput'

export const fmtPct = (p: number | null) => (p === null ? '—' : `${Math.round(p * 10) / 10} %`)
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })

/** Result of one attempt: score, grade estimate, and every answer with solution, feedback and point override. */
export function AttemptResult({ test, attempt: initial, onBack, onRetry }: { test: TestWithQuestions; attempt: Attempt; onBack: () => void; onRetry: (questionIds: string[]) => void }) {
  const [attempt, setAttempt] = useState(initial)
  const [grading, setGrading] = useState(false)
  const pct = percentOf(attempt.score, attempt.maxScore)
  const qs = new Map(test.questions.map((q) => [q.id, q]))
  const wrong = attempt.answers.filter((a) => !a.correct && qs.has(a.questionId)).map((a) => a.questionId)
  const pending = attempt.answers.some((a) => a.grading === 'pending')
  const minutes = attempt.finishedAt ? Math.max(1, Math.round((Date.parse(attempt.finishedAt) - Date.parse(attempt.startedAt)) / 60_000)) : null

  const refresh = (a: Attempt) => {
    setAttempt(a)
    void queryClient.invalidateQueries()
  }
  const gradeNow = async () => {
    setGrading(true)
    try {
      const a = await api.tests.gradeAttempt({ attemptId: attempt.id })
      refresh(a)
      if (a.answers.some((x) => x.grading === 'pending')) toast.error('Some answers could not be graded. Try again or set the points yourself.')
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    } finally {
      setGrading(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <button onClick={onBack} className="mb-4 flex items-center gap-1 rounded px-1 text-[13px] text-muted hover:bg-hover hover:text-ink">
        <ChevronLeft size={14} /> {test.title}
      </button>
      <section className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-xl border border-line bg-raised p-5">
        <div>
          <p className="text-[12px] text-muted">
            {fmtDate(attempt.finishedAt ?? attempt.startedAt)}
            {minutes && ` · ${minutes} min`}
          </p>
          <p className="font-serif text-4xl font-semibold tabular-nums">
            {attempt.score} <span className="text-xl text-muted">/ {attempt.maxScore} pts</span>
          </p>
          <p className="mt-1 text-[14px] text-muted">
            {fmtPct(pct)}
            {test.kind === 'exam' && pct !== null && (
              <>
                {' '}
                · grade estimate <span className="font-medium text-ink">{gradeEstimate(pct).toFixed(1)}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {pending && (
            <Button size="sm" disabled={grading} onClick={() => void gradeNow()}>
              {grading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Grade open answers
            </Button>
          )}
          {wrong.length > 0 && (
            <Button size="sm" variant="primary" onClick={() => onRetry(wrong)}>
              <RotateCcw size={14} /> Retry {wrong.length} mistake{wrong.length === 1 ? '' : 's'}
            </Button>
          )}
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {attempt.answers.map((a, i) => {
          const q = qs.get(a.questionId)
          if (!q) return null
          const partial = !a.correct && a.points > 0
          return (
            <section key={a.questionId} className="rounded-xl border border-line bg-raised p-4">
              <div className="mb-2 flex items-center justify-between gap-3 text-[12px]">
                <span className={cn('flex items-center gap-1.5 font-medium', a.grading === 'pending' ? 'text-muted' : a.correct ? 'text-ok' : partial ? 'text-warn' : 'text-danger')}>
                  {a.correct ? <CircleCheck size={14} /> : <CircleX size={14} />} Question {i + 1}
                  {a.grading === 'pending' && ' · waiting for grading'}
                  {a.grading === 'manual' && ' · points set by you'}
                </span>
                <PointsEditor
                  value={a.points}
                  max={q.points}
                  onSave={async (points) => refresh(await api.tests.overridePoints({ attemptId: attempt.id, questionId: q.id, points }))}
                />
              </div>
              <Markdown text={q.prompt} className="mb-3 text-[14.5px]" />
              <dl className="grid grid-cols-[110px_1fr] gap-x-3 gap-y-1.5 text-[13.5px]">
                <dt className="text-muted">Your answer</dt>
                <dd className="min-w-0">
                  <Markdown text={responseText(q, a.response)} className={md} />
                </dd>
                {!a.correct && (
                  <>
                    <dt className="text-muted">{q.type === 'text' ? 'Model answer' : 'Correct'}</dt>
                    <dd className="min-w-0">
                      <Markdown text={solutionText(q)} className={md} />
                    </dd>
                  </>
                )}
                {a.feedback && (
                  <>
                    <dt className="text-muted">Feedback</dt>
                    <dd className="min-w-0">
                      <Markdown text={a.feedback} className={md} />
                    </dd>
                  </>
                )}
                {q.explanation && (
                  <>
                    <dt className="text-muted">Explanation</dt>
                    <dd className="min-w-0 text-muted">
                      <Markdown text={q.explanation} className={md} />
                    </dd>
                  </>
                )}
              </dl>
              {q.sourcePageId && (
                <Link to="/pages/$pageId" params={{ pageId: q.sourcePageId }} className="mt-2 inline-flex items-center gap-1 text-[12.5px] text-accent hover:underline">
                  <FileText size={12} /> Open the source page
                </Link>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

function PointsEditor({ value, max, onSave }: { value: number; max: number; onSave: (p: number) => Promise<void> }) {
  const [edit, setEdit] = useState<string | null>(null)
  if (edit === null)
    return (
      <button onClick={() => setEdit(String(value))} title="Change points" className="rounded px-1.5 py-0.5 text-[12.5px] text-muted tabular-nums hover:bg-hover hover:text-ink">
        {value} / {max} pts
      </button>
    )
  const save = async () => {
    const n = Number(edit.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0 || n > max) return void toast.error(`Points must be between 0 and ${max}`)
    try {
      if (n !== value) await onSave(n)
      setEdit(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e))
    }
  }
  return (
    <span className="flex items-center gap-1 text-[12.5px] text-muted">
      <Input
        autoFocus
        className="h-6 w-16 px-1.5 text-[12.5px]"
        value={edit}
        onChange={(e) => setEdit(e.target.value)}
        onBlur={() => void save()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void save()
          if (e.key === 'Escape') setEdit(null)
        }}
      />
      / {max}
    </span>
  )
}
