import { useBlocker } from '@tanstack/react-router'
import { CircleCheck, CircleX, Clock, Loader2 } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { solutionText, type Question, type Response } from '@core/domain/tests'
import type { Attempt, TestWithQuestions } from '@core/repo/tests'
import { Button } from '../../components/ui/Button'
import { confirm } from '../../components/ui/confirm'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { queryClient } from '../../lib/queries'
import { Markdown } from '../chat/Markdown'
import { AnswerInput, isAnswered, md } from './AnswerInput'

/** `pending`: an open answer the AI could not grade right now — it is stored ungraded and can be graded from the results. */
type Grade = { points: number; correct: boolean; feedback: string | null; pending?: boolean }

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e))

/** Runs a quiz (question by question with instant feedback) or an exam (all at once, optional timer). */
export function TakeTest({ test, questions, onDone, onCancel }: { test: TestWithQuestions; questions: Question[]; onDone: (a: Attempt) => void; onCancel: () => void }) {
  const [startedAt] = useState(() => new Date().toISOString())
  const [responses, setResponses] = useState<Record<string, Response>>({})
  const set = (id: string, r: Response) => setResponses((m) => ({ ...m, [id]: r }))
  // Leaving mid-test (swipe back, sidebar, …) would lose the answers, so ask first.
  const finished = useRef(false)
  const answered = Object.keys(responses).length > 0
  useBlocker({
    shouldBlockFn: async () =>
      answered && !finished.current && !(await confirm({ title: 'Leave this test?', body: 'Your answers so far will be lost.', confirmLabel: 'Leave', danger: true })),
    enableBeforeUnload: false
  })
  const done = (a: Attempt) => {
    finished.current = true
    onDone(a)
  }
  const props = { test, questions, startedAt, responses, set, onDone: done, onCancel }
  return test.kind === 'quiz' ? <QuizRun {...props} /> : <ExamRun {...props} />
}

interface RunProps {
  test: TestWithQuestions
  questions: Question[]
  startedAt: string
  responses: Record<string, Response>
  set: (id: string, r: Response) => void
  onDone: (a: Attempt) => void
  onCancel: () => void
}

function Header({ test, right, onCancel }: { test: TestWithQuestions; right?: React.ReactNode; onCancel: () => void }) {
  return (
    <div className="sticky top-0 z-10 -mx-2 mb-6 flex items-center justify-between gap-4 bg-paper/95 px-2 py-2 backdrop-blur">
      <div className="min-w-0">
        <p className="text-[12px] text-muted">{test.kind === 'quiz' ? 'Quiz' : 'Test exam'}</p>
        <h2 className="truncate font-serif text-xl font-semibold">{test.title}</h2>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        {right}
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function QuizRun({ test, questions, startedAt, responses, set, onDone, onCancel }: RunProps) {
  const [idx, setIdx] = useState(0)
  const [grades, setGrades] = useState<Record<string, Grade>>({})
  const [busy, setBusy] = useState(false)
  const q = questions[idx]
  const grade = q ? grades[q.id] : undefined
  const score = Object.values(grades).reduce((s, g) => s + g.points, 0)
  const last = idx === questions.length - 1

  const check = async () => {
    if (!q || grade || busy) return
    setBusy(true)
    try {
      const g = await api.tests.check({ questionId: q.id, response: responses[q.id] ?? null })
      setGrades((m) => ({ ...m, [q.id]: g }))
    } catch (e) {
      if (q.type !== 'text') return void toast.error(errText(e))
      toast.error(`Your answer could not be graded: ${errText(e)}`)
      setGrades((m) => ({ ...m, [q.id]: { points: 0, correct: false, feedback: null, pending: true } }))
    } finally {
      setBusy(false)
    }
  }

  const finish = async () => {
    if (busy) return
    setBusy(true)
    try {
      const answers = questions.map((x) => ({
        questionId: x.id,
        response: responses[x.id] ?? null,
        ...(x.type === 'text' && grades[x.id] && !grades[x.id].pending ? { grade: { points: grades[x.id].points, feedback: grades[x.id].feedback } } : {})
      }))
      const a = await api.tests.submit({ testId: test.id, startedAt, answers })
      void queryClient.invalidateQueries()
      onDone(a)
    } catch (e) {
      toast.error(errText(e))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || busy || e.target instanceof HTMLTextAreaElement) return
      if (e.target instanceof HTMLElement && e.target.closest('[role=dialog]')) return
      e.preventDefault()
      if (!grade) void check()
      else if (last) void finish()
      else setIdx((i) => i + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!q) return null
  return (
    <div className="mx-auto max-w-2xl">
      <Header
        test={test}
        onCancel={onCancel}
        right={
          <span className="text-[13px] text-muted tabular-nums">
            {idx + 1} / {questions.length} · {Math.round(score * 100) / 100} pts
          </span>
        }
      />
      <div className="mb-5 h-1 overflow-hidden rounded-full bg-hover">
        <div className="h-full bg-accent transition-all" style={{ width: `${((idx + (grade ? 1 : 0)) / questions.length) * 100}%` }} />
      </div>
      <QuestionCard q={q} n={idx + 1}>
        <AnswerInput q={q} value={responses[q.id] ?? null} onChange={(r) => set(q.id, r)} reveal={!!grade} />
      </QuestionCard>
      {grade && <Feedback q={q} grade={grade} />}
      <div className="mt-5 flex justify-end gap-2">
        {!grade ? (
          <Button variant="primary" disabled={busy} onClick={() => void check()}>
            {busy && <Loader2 size={14} className="animate-spin" />}
            {busy && q.type === 'text' ? 'Grading…' : 'Check'}
          </Button>
        ) : last ? (
          <Button variant="primary" disabled={busy} onClick={() => void finish()}>
            Finish quiz
          </Button>
        ) : (
          <Button variant="primary" onClick={() => setIdx((i) => i + 1)}>
            Next question
          </Button>
        )}
      </div>
      <p className="mt-3 text-right text-[12px] text-faint">Enter to {grade ? 'continue' : 'check'}</p>
    </div>
  )
}

export function QuestionCard({ q, n, children }: { q: Question; n: number; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-line bg-raised p-5">
      <div className="mb-2 flex items-baseline justify-between gap-3 text-[12px] text-muted">
        <span className="font-medium">Question {n}</span>
        <span className="tabular-nums">
          {q.points} pt{q.points === 1 ? '' : 's'}
        </span>
      </div>
      <Markdown text={q.prompt} className="mb-4 text-[15px]" />
      {children}
    </section>
  )
}

function Feedback({ q, grade }: { q: Question; grade: Grade }) {
  const partial = !grade.correct && grade.points > 0
  if (grade.pending)
    return (
      <div className="mt-3 rounded-xl border border-line bg-hover/40 p-4 text-[13.5px]">
        <p className="font-medium">Not graded yet</p>
        <p className="mt-1 text-muted">Your answer is saved with the quiz. Grade it from the results once the assistant is reachable.</p>
        <div className="mt-2">
          <span className="text-muted">Model answer: </span>
          <Markdown text={solutionText(q)} className={md} />
        </div>
      </div>
    )
  return (
    <div className={cn('mt-3 rounded-xl border p-4', grade.correct ? 'border-ok/40 bg-ok/5' : partial ? 'border-warn/40 bg-warn/5' : 'border-danger/40 bg-danger/5')}>
      <p className={cn('flex items-center gap-1.5 text-[14px] font-medium', grade.correct ? 'text-ok' : partial ? 'text-warn' : 'text-danger')}>
        {grade.correct ? <CircleCheck size={16} /> : <CircleX size={16} />}
        {grade.correct ? 'Correct' : partial ? 'Partly correct' : 'Not quite'} · {grade.points} / {q.points} pts
      </p>
      {grade.feedback && <Markdown text={grade.feedback} className="mt-2 text-[13.5px]" />}
      {(q.type === 'number' || q.type === 'text') && (
        <div className="mt-2 text-[13.5px]">
          <span className="text-muted">{q.type === 'text' ? 'Model answer' : 'Correct result'}: </span>
          <Markdown text={solutionText(q)} className={md} />
        </div>
      )}
      {q.explanation && <Markdown text={q.explanation} className="mt-2 text-[13.5px] text-muted" />}
    </div>
  )
}

function ExamRun({ test, questions, startedAt, responses, set, onDone, onCancel }: RunProps) {
  const [phase, setPhase] = useState<'answering' | 'submitting' | 'grading'>('answering')
  const deadline = test.timeLimitMin ? Date.parse(startedAt) + test.timeLimitMin * 60_000 : null
  const [now, setNow] = useState(Date.now())
  const submitted = useRef(false)
  const autoSubmitted = useRef(false)
  const answered = questions.filter((q) => isAnswered(responses[q.id])).length

  const submit = useCallback(async () => {
    if (submitted.current) return
    submitted.current = true
    setPhase('submitting')
    try {
      const a = await api.tests.submit({ testId: test.id, startedAt, answers: questions.map((q) => ({ questionId: q.id, response: responses[q.id] ?? null })) })
      let result = a
      if (a.answers.some((x) => x.grading === 'pending')) {
        setPhase('grading')
        try {
          result = await api.tests.gradeAttempt({ attemptId: a.id })
        } catch (e) {
          toast.error(`Open answers could not be graded: ${errText(e)}. You can grade them from the results.`)
        }
      }
      void queryClient.invalidateQueries()
      onDone(result)
    } catch (e) {
      submitted.current = false
      setPhase('answering')
      toast.error(`Submitting failed: ${errText(e)}`)
    }
  }, [onDone, questions, responses, startedAt, test.id])

  useEffect(() => {
    if (!deadline) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [deadline])
  const left = deadline ? Math.max(0, deadline - now) : null
  useEffect(() => {
    if (left === 0 && phase === 'answering' && !autoSubmitted.current) {
      autoSubmitted.current = true
      toast.info('Time is up — your answers are being submitted.')
      void submit()
    }
  }, [left, phase, submit])

  const askSubmit = async () => {
    const open = questions.length - answered
    if (open && !(await confirm({ title: 'Submit the exam?', body: `${open} question${open === 1 ? ' is' : 's are'} still unanswered.`, confirmLabel: 'Submit' }))) return
    void submit()
  }

  const mm = left !== null ? `${Math.floor(left / 60_000)}:${String(Math.floor((left % 60_000) / 1000)).padStart(2, '0')}` : null
  return (
    <div className="mx-auto max-w-3xl">
      <Header
        test={test}
        onCancel={async () => (await confirm({ title: 'Leave the exam?', body: 'Your answers will be lost.', confirmLabel: 'Leave', danger: true })) && onCancel()}
        right={
          <>
            <span className="text-[13px] text-muted tabular-nums">
              {answered} / {questions.length} answered
            </span>
            {mm && (
              <span className={cn('flex items-center gap-1 rounded-md px-2 py-0.5 text-[13px] font-medium tabular-nums', left! < 5 * 60_000 ? 'bg-danger/10 text-danger' : 'bg-hover')}>
                <Clock size={13} /> {mm}
              </span>
            )}
            <Button size="sm" variant="primary" disabled={phase !== 'answering'} onClick={() => void askSubmit()}>
              Submit
            </Button>
          </>
        }
      />
      {phase !== 'answering' ? (
        <div className="flex flex-col items-center gap-3 py-24 text-[14px] text-muted">
          <Loader2 className="animate-spin" />
          {phase === 'grading' ? 'The assistant is grading your open answers…' : 'Submitting…'}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {questions.map((q, i) => (
            <QuestionCard key={q.id} q={q} n={i + 1}>
              <AnswerInput q={q} value={responses[q.id] ?? null} onChange={(r) => set(q.id, r)} />
            </QuestionCard>
          ))}
          <div className="flex justify-end pt-2">
            <Button variant="primary" onClick={() => void askSubmit()}>
              Submit exam
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
