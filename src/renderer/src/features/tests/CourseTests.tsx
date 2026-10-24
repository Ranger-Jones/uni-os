import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ClipboardCheck, Eye, EyeOff, FileText, MoreHorizontal, Paperclip, Pencil, Play, Plus, RotateCcw, Sparkles, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { gradeEstimate, percentOf, solutionText, TYPE_LABEL, type Question } from '@core/domain/tests'
import type { Attempt, TestSummary } from '@core/repo/tests'
import { Button } from '../../components/ui/Button'
import { confirm } from '../../components/ui/confirm'
import { EmptyState } from '../../components/ui/EmptyState'
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from '../../components/ui/Menu'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useApiMutation } from '../../lib/queries'
import { courseRoute } from '../../router'
import { Markdown } from '../chat/Markdown'
import { md } from './AnswerInput'
import { AttemptResult, fmtDate, fmtPct } from './AttemptResult'
import { GenerateTestDialog } from './GenerateTestDialog'
import { TakeTest } from './TakeTest'
import { PaperResultDialog, TestDialog } from './TestDialogs'

/** Course tab with quizzes and test exams. The open test lives in the URL (?test=…). */
export function CourseTests({ courseId }: { courseId: string }) {
  const { test: openId } = courseRoute.useSearch()
  const navigate = useNavigate()
  const open = (test?: string) => void navigate({ to: '/courses/$courseId', params: { courseId }, search: { tab: 'tests', ...(test ? { test } : {}) } })
  if (openId) return <TestDetail key={openId} courseId={courseId} testId={openId} onBack={() => open()} />
  return <TestList courseId={courseId} onOpen={open} />
}

function TestList({ courseId, onOpen }: { courseId: string; onOpen: (id: string) => void }) {
  const list = useQuery({ queryKey: ['tests', courseId], queryFn: () => api.tests.list({ courseId }) })
  const [generate, setGenerate] = useState(false)
  const [manual, setManual] = useState(false)
  const all = list.data ?? []
  const quizzes = all.filter((t) => t.kind === 'quiz')
  const exams = all.filter((t) => t.kind === 'exam')

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <p className="text-[13px] text-muted">Practise with quizzes, take mock exams and keep old exams with your results.</p>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" onClick={() => setManual(true)}>
            <Plus size={14} /> Add test exam
          </Button>
          <Button size="sm" variant="primary" onClick={() => setGenerate(true)}>
            <Sparkles size={14} /> Generate with AI
          </Button>
        </div>
      </div>
      {all.length === 0 && !list.isLoading && (
        <EmptyState icon={<ClipboardCheck size={28} />} title="No quizzes or test exams yet">
          Let the assistant write a quiz or a mock exam from your notes, or add an old exam with its PDFs.
        </EmptyState>
      )}
      {[
        { label: 'Quizzes', items: quizzes },
        { label: 'Test exams', items: exams }
      ]
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.label} className="mb-6">
            <h3 className="mb-2 text-[13px] font-medium text-muted">{g.label}</h3>
            <div className="flex flex-col gap-2">
              {g.items.map((t) => (
                <TestRow key={t.id} t={t} onOpen={() => onOpen(t.id)} />
              ))}
            </div>
          </section>
        ))}
      <GenerateTestDialog open={generate} onOpenChange={setGenerate} courseId={courseId} onSaved={onOpen} />
      <TestDialog open={manual} onOpenChange={setManual} courseId={courseId} onSaved={onOpen} />
    </div>
  )
}

function TestRow({ t, onOpen }: { t: TestSummary; onOpen: () => void }) {
  const meta = [
    `${t.questionCount} question${t.questionCount === 1 ? '' : 's'}`,
    t.maxPoints ? `${t.maxPoints} pts` : null,
    t.timeLimitMin ? `${t.timeLimitMin} min` : null,
    t.fileIds.length ? `${t.fileIds.length} file${t.fileIds.length === 1 ? '' : 's'}` : null
  ].filter(Boolean)
  return (
    <button onClick={onOpen} className="flex items-center gap-4 rounded-xl border border-line bg-raised px-4 py-3 text-left hover:border-faint">
      <ClipboardCheck size={18} className={t.kind === 'quiz' ? 'text-accent' : 'text-warn'} />
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{t.title}</p>
        <p className="text-[12.5px] text-muted">{meta.join(' · ')}</p>
      </div>
      <div className="text-right text-[12.5px]">
        {t.attemptCount ? (
          <>
            <p>
              <span className="text-muted">Best </span>
              <span className="font-medium tabular-nums">{fmtPct(t.bestPercent)}</span>
              <span className="text-muted"> · last </span>
              <span className="tabular-nums">{fmtPct(t.lastPercent)}</span>
            </p>
            <p className="text-faint">
              {t.attemptCount} attempt{t.attemptCount === 1 ? '' : 's'}
              {t.lastAt && ` · ${fmtDate(t.lastAt)}`}
            </p>
          </>
        ) : (
          <p className="text-faint">Not taken yet</p>
        )}
      </div>
    </button>
  )
}

type View = { kind: 'detail' } | { kind: 'run'; questionIds: string[] | null } | { kind: 'result'; attempt: Attempt }

function TestDetail({ courseId, testId, onBack }: { courseId: string; testId: string; onBack: () => void }) {
  const test = useQuery({ queryKey: ['test', testId], queryFn: () => api.tests.get({ id: testId }) })
  const attempts = useQuery({ queryKey: ['test', testId, 'attempts'], queryFn: () => api.tests.attempts({ testId }) })
  const files = useQuery({ queryKey: ['files', courseId], queryFn: () => api.files.list({ courseId }) })
  const [view, setView] = useState<View>({ kind: 'detail' })
  const [edit, setEdit] = useState(false)
  const [more, setMore] = useState(false)
  const [paper, setPaper] = useState(false)
  const [showSolutions, setShowSolutions] = useState(false)
  const remove = useApiMutation(() => api.tests.remove({ id: testId }), { success: 'Deleted' })
  const removeAttempt = useApiMutation((id: string) => api.tests.removeAttempt({ id }))
  const removeQuestion = useApiMutation((id: string) => api.tests.removeQuestion({ id }))

  if (test.isError) return <EmptyState title="This test no longer exists." action={<Button onClick={onBack}>Back to tests</Button>} />
  const t = test.data
  if (!t) return null
  const maxPoints = Math.round(t.questions.reduce((s, q) => s + q.points, 0) * 100) / 100
  const history = [...(attempts.data ?? [])].reverse()
  const lastRun = history.find((a) => a.mode === 'interactive')
  const mistakes = lastRun ? lastRun.answers.filter((a) => !a.correct && t.questions.some((q) => q.id === a.questionId)).map((a) => a.questionId) : []
  const linked = (files.data ?? []).filter((f) => t.fileIds.includes(f.id))

  if (view.kind === 'run') {
    const qs = view.questionIds ? t.questions.filter((q) => view.questionIds!.includes(q.id)) : t.questions
    return <TakeTest test={t} questions={qs} onDone={(a) => setView({ kind: 'result', attempt: a })} onCancel={() => setView({ kind: 'detail' })} />
  }
  if (view.kind === 'result')
    return <AttemptResult key={view.attempt.id} test={t} attempt={view.attempt} onBack={() => setView({ kind: 'detail' })} onRetry={(ids) => setView({ kind: 'run', questionIds: ids })} />

  return (
    <div>
      <button onClick={onBack} className="mb-4 flex items-center gap-1 rounded px-1 text-[13px] text-muted hover:bg-hover hover:text-ink">
        <ChevronLeft size={14} /> All tests
      </button>
      <header className="mb-5 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[12px] text-muted">{t.kind === 'quiz' ? 'Quiz' : 'Test exam'}</p>
          <h2 className="font-serif text-2xl font-semibold">{t.title}</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {[`${t.questions.length} questions`, maxPoints ? `${maxPoints} pts` : null, t.timeLimitMin ? `${t.timeLimitMin} min time limit` : null].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mistakes.length > 0 && (
            <Button size="sm" onClick={() => setView({ kind: 'run', questionIds: mistakes })}>
              <RotateCcw size={14} /> Retry {mistakes.length} mistake{mistakes.length === 1 ? '' : 's'}
            </Button>
          )}
          <Button size="sm" variant="primary" disabled={!t.questions.length} onClick={() => setView({ kind: 'run', questionIds: null })}>
            <Play size={14} /> {t.kind === 'quiz' ? 'Start quiz' : 'Start exam'}
          </Button>
          <Menu>
            <MenuTrigger className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink" aria-label="Test actions">
              <MoreHorizontal size={17} />
            </MenuTrigger>
            <MenuContent align="end">
              <MenuItem icon={<Sparkles size={14} />} onSelect={() => setMore(true)}>
                Add questions with AI
              </MenuItem>
              <MenuItem icon={<FileText size={14} />} onSelect={() => setPaper(true)}>
                Record a paper result
              </MenuItem>
              <MenuItem icon={<Pencil size={14} />} onSelect={() => setEdit(true)}>
                Edit details
              </MenuItem>
              <MenuSeparator />
              <MenuItem
                danger
                icon={<Trash2 size={14} />}
                onSelect={async () => (await confirm({ title: `Delete ${t.title}?`, body: 'All questions and results will be deleted.', confirmLabel: 'Delete', danger: true })) && remove.mutate(undefined, { onSuccess: onBack })}
              >
                Delete
              </MenuItem>
            </MenuContent>
          </Menu>
        </div>
      </header>

      {t.description && <Markdown text={t.description} className="mb-5 text-[14px] text-muted" />}

      {linked.length > 0 && (
        <section className="mb-6">
          <h3 className="mb-2 text-[13px] font-medium text-muted">Materials</h3>
          <div className="flex flex-wrap gap-2">
            {linked.map((f) => (
              <button key={f.id} onClick={() => void api.files.open({ id: f.id })} className="flex items-center gap-1.5 rounded-lg border border-line bg-raised px-3 py-1.5 text-[13px] hover:bg-hover">
                <Paperclip size={13} className="text-muted" /> {f.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="mb-6">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-muted">Results</h3>
          <button onClick={() => setPaper(true)} className="text-[12.5px] text-accent hover:underline">
            Record a paper result
          </button>
        </div>
        {history.length === 0 ? (
          <p className="text-[13px] text-faint">No attempts yet.</p>
        ) : (
          <table className="w-full text-[13px]">
            <tbody>
              {history.map((a) => {
                const pct = percentOf(a.score, a.maxScore)
                const pending = a.answers.some((x) => x.grading === 'pending')
                return (
                  <tr key={a.id} className="group border-t border-line first:border-t-0">
                    <td className="py-2 pr-3 whitespace-nowrap">{fmtDate(a.finishedAt ?? a.startedAt)}</td>
                    <td className="py-2 pr-3 text-muted">
                      {a.mode === 'paper' ? 'On paper' : `In the app · ${a.answers.length} question${a.answers.length === 1 ? '' : 's'}`}
                      {pending && ' · grading open'}
                      {a.note && <span className="text-faint"> · {a.note}</span>}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums">
                      {a.score} / {a.maxScore}
                    </td>
                    <td className="py-2 pr-3 text-right font-medium tabular-nums">{fmtPct(pct)}</td>
                    <td className="py-2 pr-3 text-right text-muted tabular-nums">{t.kind === 'exam' && pct !== null ? gradeEstimate(pct).toFixed(1) : ''}</td>
                    <td className="w-20 py-2 text-right whitespace-nowrap">
                      {a.mode === 'interactive' && (
                        <button onClick={() => setView({ kind: 'result', attempt: a })} className="rounded px-1.5 text-accent hover:underline">
                          Review
                        </button>
                      )}
                      <button
                        aria-label="Delete result"
                        onClick={async () => (await confirm({ title: 'Delete this result?', confirmLabel: 'Delete', danger: true })) && removeAttempt.mutate(a.id)}
                        className="invisible rounded p-0.5 align-middle text-muted group-hover:visible hover:text-danger"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[13px] font-medium text-muted">Questions</h3>
          {t.questions.length > 0 && (
            <button onClick={() => setShowSolutions(!showSolutions)} className="flex items-center gap-1 text-[12.5px] text-accent hover:underline">
              {showSolutions ? <EyeOff size={13} /> : <Eye size={13} />} {showSolutions ? 'Hide solutions' : 'Show solutions'}
            </button>
          )}
        </div>
        {t.questions.length === 0 && (
          <p className="text-[13px] text-faint">
            No interactive questions.{' '}
            <button className="text-accent hover:underline" onClick={() => setMore(true)}>
              Add questions with AI
            </button>
          </p>
        )}
        <ol className="flex flex-col gap-2">
          {t.questions.map((q, i) => (
            <QuestionRow key={q.id} q={q} n={i + 1} solution={showSolutions} onDelete={async () => (await confirm({ title: 'Delete this question?', confirmLabel: 'Delete', danger: true })) && removeQuestion.mutate(q.id)} />
          ))}
        </ol>
      </section>

      <TestDialog open={edit} onOpenChange={setEdit} courseId={courseId} test={t} />
      <GenerateTestDialog open={more} onOpenChange={setMore} courseId={courseId} addTo={{ id: t.id, kind: t.kind, title: t.title }} onSaved={() => {}} />
      <PaperResultDialog open={paper} onOpenChange={setPaper} testId={t.id} maxPoints={maxPoints} />
    </div>
  )
}

function QuestionRow({ q, n, solution, onDelete }: { q: Question; n: number; solution: boolean; onDelete: () => void }) {
  return (
    <li className="group rounded-lg border border-line bg-raised px-4 py-3">
      <div className="mb-1 flex items-center justify-between text-[11.5px] text-muted">
        <span>
          {n}. {TYPE_LABEL[q.type]} · {q.points} pt{q.points === 1 ? '' : 's'}
        </span>
        <button aria-label="Delete question" onClick={onDelete} className="invisible rounded p-0.5 group-hover:visible hover:text-danger">
          <Trash2 size={13} />
        </button>
      </div>
      <Markdown text={q.prompt} className="text-[13.5px]" />
      {solution && (
        <div className={cn('mt-1.5 border-t border-line pt-1.5 text-[13px]')}>
          <span className="text-ok">Answer: </span>
          <Markdown text={solutionText(q)} className={md} />
          {q.explanation && <Markdown text={q.explanation} className="mt-1 text-[12.5px] text-muted" />}
        </div>
      )}
    </li>
  )
}
