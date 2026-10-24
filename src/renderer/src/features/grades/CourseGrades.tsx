import { useQuery } from '@tanstack/react-query'
import { Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { requiredForCourse } from '@core/domain/grades'
import type { Course } from '@core/repo/courses'
import type { GradeComponent } from '@core/repo/grades'
import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { useApiMutation } from '../../lib/queries'
import { fmtGrade, fmtNum, parseNum } from './format'

/** Text cell that commits on blur / Enter and reverts on Escape. */
export function EditCell({
  value,
  onCommit,
  placeholder,
  className,
  align = 'left'
}: {
  value: string
  onCommit: (v: string) => void
  placeholder?: string
  className?: string
  align?: 'left' | 'right'
}) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <input
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setV(value)
          e.currentTarget.blur()
        }
      }}
      className={cn('h-8 w-full rounded-md border border-transparent bg-transparent px-2 text-sm outline-none placeholder:text-faint hover:border-line focus:border-accent focus:bg-raised', align === 'right' && 'text-right tabular-nums', className)}
    />
  )
}

export function CourseGrades({ course }: { course: Course }) {
  const comps = useQuery({ queryKey: ['grades', 'components', course.id], queryFn: () => api.grades.listComponents({ courseId: course.id }) })
  const overview = useQuery({ queryKey: ['grades', 'overview', 'course', course.semesterId], queryFn: () => api.grades.overview({ semesterId: course.semesterId }) })
  const row = overview.data?.courses.find((r) => r.course.id === course.id)
  const create = useApiMutation((name: string) => api.grades.createComponent({ courseId: course.id, name, weight: comps.data?.length ? 0 : 100 }))
  const update = useApiMutation(({ id, patch }: { id: string; patch: Partial<Pick<GradeComponent, 'name' | 'weight' | 'grade' | 'passed' | 'date'>> }) => api.grades.updateComponent({ id, patch }))
  const remove = useApiMutation((id: string) => api.grades.removeComponent({ id }))
  const passFail = course.gradingMode === 'pass_fail'
  const list = comps.data ?? []
  const weightSum = list.reduce((s, c) => s + c.weight, 0)
  const need = course.targetGrade && !passFail ? requiredForCourse(course.targetGrade, list) : null

  const commitNumber = (c: GradeComponent, key: 'weight' | 'grade', raw: string) => {
    const n = parseNum(raw)
    if (Number.isNaN(n)) return
    if (key === 'weight') update.mutate({ id: c.id, patch: { weight: n ?? 0 } })
    else update.mutate({ id: c.id, patch: { grade: n } })
  }

  return (
    <div className="grid grid-cols-[1fr_240px] gap-10">
      <div>
        <div className="grid grid-cols-[1fr_6rem_6rem_9rem_2rem] items-center gap-x-1 border-b border-line pb-1 text-[12px] text-muted">
          <span className="px-2">Component</span>
          <span className="px-2 text-right">Weight %</span>
          <span className="px-2 text-right">{passFail ? 'Passed' : 'Grade'}</span>
          <span className="px-2">Date</span>
          <span />
        </div>
        {list.map((c) => (
          <div key={c.id} className="group grid grid-cols-[1fr_6rem_6rem_9rem_2rem] items-center gap-x-1 border-b border-line/60 py-0.5">
            <EditCell value={c.name} onCommit={(name) => name.trim() && update.mutate({ id: c.id, patch: { name } })} />
            <EditCell align="right" value={fmtNum(c.weight)} onCommit={(v) => commitNumber(c, 'weight', v)} />
            {passFail ? (
              <span className="flex justify-end px-2">
                <input type="checkbox" checked={!!c.passed} onChange={(e) => update.mutate({ id: c.id, patch: { passed: e.target.checked } })} aria-label="Passed" />
              </span>
            ) : (
              <EditCell align="right" placeholder="–" value={c.grade == null ? '' : fmtGrade(c.grade)} onCommit={(v) => commitNumber(c, 'grade', v)} className={cn(c.grade != null && c.grade > 4 && 'text-danger')} />
            )}
            <input type="date" value={c.date ?? ''} onChange={(e) => update.mutate({ id: c.id, patch: { date: e.target.value || null } })} className="h-8 rounded-md bg-transparent px-2 text-[13px] text-muted outline-none hover:bg-hover" />
            <button onClick={() => remove.mutate(c.id)} className="invisible rounded p-1 text-muted group-hover:visible hover:bg-hover hover:text-ink" aria-label={`Remove ${c.name}`}>
              <X size={14} />
            </button>
          </div>
        ))}
        <div className="mt-2 flex items-center justify-between">
          <Button size="sm" variant="ghost" onClick={() => create.mutate(list.length ? 'New component' : 'Exam')}>
            <Plus size={14} /> Add component
          </Button>
          {list.length > 0 && <span className={cn('text-[12.5px] tabular-nums', Math.abs(weightSum - 100) > 0.01 ? 'text-warn' : 'text-faint')}>Weights add up to {fmtNum(weightSum)} %</span>}
        </div>
        {list.length === 0 && <p className="mt-3 text-[13px] text-muted">Add the parts that make up this course's grade, for example an exam (70 %) and a paper (30 %).</p>}
      </div>

      <aside>
        <div className="text-[13px] text-muted">{passFail ? 'Result' : 'Course grade'}</div>
        {passFail ? (
          <div className={cn('mt-1 font-serif text-[40px] leading-none font-semibold', row?.passed ? 'text-ok' : 'text-faint')}>{row?.passed ? 'Passed' : 'Open'}</div>
        ) : (
          <div className="mt-1 flex items-baseline gap-2">
            <span className={cn('font-serif text-[52px] leading-none font-semibold tabular-nums', row?.grade != null && row.grade > 4 && 'text-danger')}>{fmtGrade(row?.grade)}</span>
            {row?.provisional && row.grade != null && <span className="text-[12px] text-muted">provisional</span>}
          </div>
        )}
        <p className="mt-2 text-[13px] text-muted">{fmtNum(course.ects)} ECTS</p>
        {need && course.targetGrade && (
          <p className="mt-4 border-t border-line pt-3 text-[13px] leading-relaxed">
            Target {fmtGrade(course.targetGrade)}:{' '}
            {need.status === 'safe' && <span className="text-ok">reached with any passing grade.</span>}
            {need.status === 'unreachable' && <span className="text-danger">no longer reachable.</span>}
            {need.status === 'reachable' && need.required != null && (
              <>
                you need <strong className="tabular-nums">{fmtGrade(Math.floor(need.required * 10) / 10)}</strong> or better on the rest.
              </>
            )}
          </p>
        )}
      </aside>
    </div>
  )
}
