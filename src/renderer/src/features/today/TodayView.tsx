import { useNavigate } from '@tanstack/react-router'
import { Plus } from 'lucide-react'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { Layers } from 'lucide-react'
import { isOverdue, OPEN_STATUS, type Assignment } from '@core/repo/assignments'
import type { CalendarEvent } from '@core/repo/events'
import { Button } from '../../components/ui/Button'
import { courseColor } from '../../lib/colors'
import { addDays, localDate, localNow, longDate, relativeDay } from '../../lib/dates'
import { useActiveSemester } from '../../lib/queries'
import { useAllCourses, useAssignments, useEvents, useOccurrences } from '../../lib/queries-schedule'
import { AssignmentDialog } from '../assignments/AssignmentDialog'
import { AssignmentRow } from '../assignments/AssignmentList'
import { EventDialog } from '../calendar/EventDialog'
import { SESSION_KIND_LABEL } from '../courses/CourseDialog'

function semesterWeek(start: string, end: string, today: string): number | null {
  if (today < start || today > end) return null
  return Math.floor((Date.parse(today) - Date.parse(start)) / (7 * 86_400_000)) + 1
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-baseline justify-between">
        <h2 className="text-[13px] font-medium text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  )
}

export function TodayView() {
  const today = localDate()
  const now = localNow()
  const navigate = useNavigate()
  const { semester } = useActiveSemester()
  const courses = useAllCourses()
  const occ = useOccurrences({ from: today, to: today })
  const todayEvents = useEvents({ from: today, to: today })
  const exams = useEvents({ from: today, to: addDays(today, 90) })
  const open = useAssignments({ status: OPEN_STATUS })
  const [assignment, setAssignment] = useState<{ open: boolean; a?: Assignment }>({ open: false })
  const [event, setEvent] = useState<CalendarEvent | undefined>()
  const cardsDue = useQuery({ queryKey: ['cards', 'due'], queryFn: () => api.cards.totalDue() })

  const course = (id: string | null) => courses.data?.find((c) => c.id === id)
  const week = semester ? semesterWeek(semester.startDate, semester.endDate, today) : null
  const horizon = addDays(today, 14)
  const assignments = open.data ?? []
  const overdue = assignments.filter((a) => isOverdue(a, now))
  const upcoming = assignments.filter((a) => !isOverdue(a, now) && a.dueAt && a.dueAt.slice(0, 10) <= horizon)
  const undated = assignments.filter((a) => !a.dueAt)
  const upcomingExams = (exams.data ?? []).filter((e) => e.kind === 'exam')

  const agenda = [
    ...(occ.data ?? []).map((o) => ({ key: o.sessionId, start: o.start, end: o.end, title: course(o.courseId)?.name ?? '', sub: [SESSION_KIND_LABEL[o.kind], o.location].filter(Boolean).join(' · '), color: courseColor(course(o.courseId)?.color).solid, onClick: () => void navigate({ to: '/courses/$courseId', params: { courseId: o.courseId } }) })),
    ...(todayEvents.data ?? []).map((e) => ({ key: e.id, start: e.allDay || !e.startsAt.includes('T') ? '' : e.startsAt.slice(11), end: e.endsAt?.slice(11) ?? '', title: e.title, sub: [course(e.courseId)?.name, e.location].filter(Boolean).join(' · '), color: e.kind === 'exam' ? 'var(--danger)' : courseColor(course(e.courseId)?.color).solid, onClick: () => setEvent(e) }))
  ].sort((a, b) => a.start.localeCompare(b.start))

  return (
    <div className="mx-auto max-w-5xl px-10 pt-14 pb-24">
      <header className="mb-8 flex items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-[32px] leading-tight font-semibold tracking-tight">{longDate(today)}</h1>
          <p className="mt-1 text-[13px] text-muted">{semester ? (week ? `${semester.name}, week ${week}` : semester.name) : 'No semester yet'}</p>
        </div>
        <Button size="sm" variant="primary" className="no-drag" onClick={() => setAssignment({ open: true })} disabled={!courses.data?.length}>
          <Plus size={14} /> Assignment
        </Button>
      </header>

      <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-12">
        <div>
          <Section title="Today">
            {agenda.length === 0 && <p className="text-[13px] text-faint">No classes or events today.</p>}
            <ol className="flex flex-col gap-1">
              {agenda.map((it) => {
                const past = it.end && it.end < now.slice(11)
                return (
                  <li key={it.key}>
                    <button onClick={it.onClick} className={`flex w-full items-stretch gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover ${past ? 'opacity-50' : ''}`}>
                      <span className="w-11 shrink-0 pt-px text-[12.5px] text-muted tabular-nums">{it.start || 'All day'}</span>
                      <span className="w-[3px] shrink-0 rounded-full" style={{ background: it.color }} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{it.title}</span>
                        {it.sub && <span className="block truncate text-[12.5px] text-muted">{it.sub}</span>}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </Section>
          {upcomingExams.length > 0 && (
            <Section title="Exams ahead">
              <ul className="flex flex-col gap-1">
                {upcomingExams.map((e) => {
                  const days = Math.round((Date.parse(e.startsAt.slice(0, 10)) - Date.parse(today)) / 86_400_000)
                  return (
                    <li key={e.id}>
                      <button onClick={() => setEvent(e)} className="flex w-full items-baseline gap-3 rounded-md px-2 py-1.5 text-left hover:bg-hover">
                        <span className="w-11 shrink-0 font-serif text-xl leading-none font-semibold tabular-nums">{days}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{e.title}</span>
                          <span className="block text-[12.5px] text-muted">
                            {days === 1 ? 'day' : 'days'} · {relativeDay(e.startsAt.slice(0, 10), today)}
                            {course(e.courseId) ? ` · ${course(e.courseId)!.name}` : ''}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            </Section>
          )}
        </div>

        <div>
          {(cardsDue.data ?? 0) > 0 && (
            <button onClick={() => void navigate({ to: '/flashcards' })} className="mb-8 flex w-full items-center gap-3 rounded-xl border border-line bg-raised px-4 py-3 text-left hover:border-faint">
              <Layers size={18} className="text-accent" />
              <span className="flex-1 text-sm">
                <span className="font-serif text-lg font-semibold tabular-nums">{cardsDue.data}</span> flashcard{cardsDue.data === 1 ? '' : 's'} due for review
              </span>
              <span className="text-[13px] text-accent">Review</span>
            </button>
          )}
          {overdue.length > 0 && (
            <Section title="Overdue">
              {overdue.map((a) => (
                <AssignmentRow key={a.id} a={a} showCourse onOpen={() => setAssignment({ open: true, a })} />
              ))}
            </Section>
          )}
          <Section title="Due in the next two weeks">
            {upcoming.length === 0 && <p className="text-[13px] text-faint">Nothing due. Enjoy it.</p>}
            {upcoming.map((a) => (
              <AssignmentRow key={a.id} a={a} showCourse onOpen={() => setAssignment({ open: true, a })} />
            ))}
          </Section>
          {undated.length > 0 && (
            <Section title="No due date">
              {undated.map((a) => (
                <AssignmentRow key={a.id} a={a} showCourse onOpen={() => setAssignment({ open: true, a })} />
              ))}
            </Section>
          )}
        </div>
      </div>

      <AssignmentDialog open={assignment.open} onOpenChange={(o) => setAssignment((s) => ({ ...s, open: o }))} assignment={assignment.a} defaultDue={addDays(today, 7)} />
      <EventDialog open={!!event} onOpenChange={(o) => !o && setEvent(undefined)} event={event} />
    </div>
  )
}
