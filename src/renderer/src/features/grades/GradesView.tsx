import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { requiredAverage } from '@core/domain/grades'
import type { CourseGradeRow } from '@core/repo/grades'
import { Page } from '../../components/layout/Page'
import { EmptyState } from '../../components/ui/EmptyState'
import { Input, Select } from '../../components/ui/Input'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { courseColor } from '../../lib/colors'
import { useSemesters } from '../../lib/queries'
import { fmtGrade, fmtNum, parseNum } from './format'

export function GradesView() {
  const semesters = useSemesters()
  const [scope, setScope] = useState<string>('all')
  const overview = useQuery({ queryKey: ['grades', 'overview', scope], queryFn: () => api.grades.overview(scope === 'all' ? {} : { semesterId: scope }) })
  const [target, setTarget] = useState('')
  const o = overview.data
  const navigate = useNavigate()

  if (!o) return null
  const done = o.courses.filter((r) => r.course.gradingMode === 'graded' && r.passed && r.grade != null).map((r) => ({ ects: r.course.ects, grade: r.grade! }))
  const t = parseNum(target)
  const forecast = t && !Number.isNaN(t) && t >= 1 && t <= 4 ? requiredAverage(t, done, o.remainingEcts) : null
  const pct = o.ectsTotal ? Math.round((o.ectsEarned / o.ectsTotal) * 100) : 0
  const bySemester = (semesters.data ?? []).map((s) => ({ s, rows: o.courses.filter((r) => r.course.semesterId === s.id) })).filter((g) => g.rows.length)

  return (
    <Page
      title="Grades"
      wide
      actions={
        <Select value={scope} onChange={(e) => setScope(e.target.value)} className="w-44">
          <option value="all">All semesters</option>
          {semesters.data?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
      }
    >
      {o.courses.length === 0 ? (
        <EmptyState title="No courses yet">Grades appear here once you add courses and their exams.</EmptyState>
      ) : (
        <>
          <div className="mb-10 grid grid-cols-[auto_1fr_minmax(0,280px)] items-end gap-12 border-b border-line pb-8">
            <div>
              <div className="text-[13px] text-muted">Grade point average</div>
              <div className="font-serif text-[72px] leading-[0.9] font-semibold tracking-tight tabular-nums">{o.gpa == null ? "–" : fmtGpa(o.gpa)}</div>
              {o.provisionalGpa != null && o.provisionalGpa !== o.gpa && <div className="mt-2 text-[13px] text-muted">{fmtGpa(o.provisionalGpa)} including provisional grades</div>}
            </div>
            <div className="pb-1">
              <div className="mb-2 flex justify-between text-[13px]">
                <span className="text-muted">Credits earned</span>
                <span className="tabular-nums">
                  {fmtNum(o.ectsEarned)} / {fmtNum(o.ectsTotal)} ECTS
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-hover">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="pb-1">
              <label className="mb-1.5 block text-[13px] text-muted" htmlFor="target">
                Target average
              </label>
              <div className="flex items-center gap-3">
                <Input id="target" className="w-20 tabular-nums" placeholder="2,0" value={target} onChange={(e) => setTarget(e.target.value)} />
                <p className="text-[13px] leading-snug">
                  {!forecast && <span className="text-faint">Enter a grade to see what you need on the remaining {fmtNum(o.remainingEcts)} ECTS.</span>}
                  {forecast?.status === 'safe' && <span className="text-ok">Reached with any passing grades.</span>}
                  {forecast?.status === 'unreachable' && <span className="text-danger">Not reachable anymore.</span>}
                  {forecast?.status === 'reachable' && (
                    <>
                      Average of <strong className="tabular-nums">{fmtGrade(Math.floor(forecast.required! * 10) / 10)}</strong> needed on {fmtNum(o.remainingEcts)} ECTS.
                    </>
                  )}
                </p>
              </div>
            </div>
          </div>

          {bySemester.map(({ s, rows }) => (
            <section key={s.id} className="mb-10">
              <h2 className="mb-2 text-[15px] font-semibold">{s.name}</h2>
              <div className="grid grid-cols-[1fr_5rem_minmax(0,1.3fr)_6rem] border-b border-line px-2 pb-1 text-[12px] text-muted">
                <span>Course</span>
                <span className="text-right">ECTS</span>
                <span className="pl-6">Components</span>
                <span className="text-right">Grade</span>
              </div>
              {rows.map((r) => (
                <GradeRow key={r.course.id} r={r} onOpen={() => void navigate({ to: '/courses/$courseId', params: { courseId: r.course.id }, search: { tab: 'grades' } })} />
              ))}
            </section>
          ))}
        </>
      )}
    </Page>
  )
}

const fmtGpa = (x: number) => (Math.floor(x * 100 + 1e-6) / 100).toFixed(2).replace(".", ",")

function GradeRow({ r, onOpen }: { r: CourseGradeRow; onOpen: () => void }) {
  const comps = r.components.filter((c) => c.grade != null || c.passed != null)
  return (
    <button onClick={onOpen} className="grid w-full grid-cols-[1fr_5rem_minmax(0,1.3fr)_6rem] items-center rounded-md px-2 py-2 text-left hover:bg-hover">
      <span className="flex min-w-0 items-center gap-2.5">
        <span className="h-4 w-[3px] shrink-0 rounded-full" style={{ background: courseColor(r.course.color).solid }} />
        <span className="truncate text-sm">{r.course.name}</span>
      </span>
      <span className="text-right text-[13px] text-muted tabular-nums">{fmtNum(r.course.ects)}</span>
      <span className="truncate pl-6 text-[12.5px] text-muted">
        {r.components.length === 0 ? <span className="text-faint">—</span> : comps.map((c) => `${c.name} ${c.grade != null ? fmtGrade(c.grade) : c.passed ? '✓' : '✗'}`).join(' · ') || <span className="text-faint">not graded yet</span>}
      </span>
      <span className="text-right">
        {r.course.gradingMode === 'pass_fail' ? (
          <span className={cn('text-[13px]', r.passed ? 'text-ok' : 'text-faint')}>{r.passed ? 'Passed' : 'Pass/fail'}</span>
        ) : (
          <span className={cn('font-serif text-lg font-semibold tabular-nums', r.grade == null && 'text-faint', r.grade != null && r.grade > 4 && 'text-danger', r.provisional && 'text-muted italic')}>
            {fmtGrade(r.grade)}
          </span>
        )}
      </span>
    </button>
  )
}
