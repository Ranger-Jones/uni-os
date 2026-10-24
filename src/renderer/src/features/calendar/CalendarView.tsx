import { useNavigate } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { startOfWeek } from '@core/domain/schedule'
import type { Assignment } from '@core/repo/assignments'
import type { CalendarEvent } from '@core/repo/events'
import type { Occurrence } from '@core/domain/schedule'
import { Button } from '../../components/ui/Button'
import { cn } from '../../lib/cn'
import { courseColor } from '../../lib/colors'
import { addDays, addMonths, dayName, localDate, localNow, monthTitle, shortDate, startOfMonth } from '../../lib/dates'
import { useAllCourses, useAssignments, useEvents, useOccurrences } from '../../lib/queries-schedule'
import { AssignmentDialog } from '../assignments/AssignmentDialog'
import { SESSION_KIND_LABEL } from '../courses/CourseDialog'
import { EventDialog } from './EventDialog'

const HOUR_PX = 48
const FIRST_HOUR = 7
const LAST_HOUR = 22
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))

type Mode = 'week' | 'month'

export function CalendarView() {
  const [mode, setMode] = useState<Mode>('week')
  const [anchor, setAnchor] = useState(localDate())
  const [eventDialog, setEventDialog] = useState<{ open: boolean; event?: CalendarEvent; defaults?: { date: string; start?: string } }>({ open: false })
  const [assignment, setAssignment] = useState<Assignment | undefined>()

  const range = useMemo(() => {
    if (mode === 'week') {
      const from = startOfWeek(anchor)
      return { from, to: addDays(from, 6) }
    }
    const from = startOfWeek(startOfMonth(anchor))
    return { from, to: addDays(from, 41) }
  }, [mode, anchor])

  const occ = useOccurrences(range)
  const events = useEvents(range)
  const assignments = useAssignments({ dueFrom: range.from, dueTo: range.to })
  const step = (n: number) => setAnchor(mode === 'week' ? addDays(anchor, 7 * n) : addMonths(anchor, n))
  const title = mode === 'week' ? `${shortDate(range.from)} – ${shortDate(range.to)} ${range.to.slice(0, 4)}` : monthTitle(anchor)

  return (
    <div className="flex h-full flex-col px-8 pt-12 pb-6">
      <header className="no-drag mb-4 flex items-center gap-3">
        <h1 className="mr-auto font-serif text-[28px] font-semibold tracking-tight">{title}</h1>
        <div className="flex rounded-md border border-line p-0.5">
          {(['week', 'month'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={cn('rounded px-2.5 py-0.5 text-[13px] capitalize', mode === m ? 'bg-active font-medium' : 'text-muted hover:text-ink')}>
              {m}
            </button>
          ))}
        </div>
        <div className="flex items-center">
          <Button size="icon" variant="ghost" onClick={() => step(-1)} aria-label="Previous">
            <ChevronLeft size={16} />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAnchor(localDate())}>
            Today
          </Button>
          <Button size="icon" variant="ghost" onClick={() => step(1)} aria-label="Next">
            <ChevronRight size={16} />
          </Button>
        </div>
        <Button size="sm" variant="primary" onClick={() => setEventDialog({ open: true, defaults: { date: localDate() } })}>
          <Plus size={14} /> Event
        </Button>
      </header>

      {mode === 'week' ? (
        <WeekGrid
          from={range.from}
          occurrences={occ.data ?? []}
          events={events.data ?? []}
          assignments={assignments.data ?? []}
          onSlot={(date, start) => setEventDialog({ open: true, defaults: { date, start } })}
          onEvent={(event) => setEventDialog({ open: true, event })}
          onAssignment={setAssignment}
        />
      ) : (
        <MonthGrid
          from={range.from}
          month={anchor.slice(0, 7)}
          occurrences={occ.data ?? []}
          events={events.data ?? []}
          assignments={assignments.data ?? []}
          onDay={(date) => {
            setAnchor(date)
            setMode('week')
          }}
        />
      )}

      <EventDialog open={eventDialog.open} onOpenChange={(open) => setEventDialog((d) => ({ ...d, open }))} event={eventDialog.event} defaults={eventDialog.defaults} />
      <AssignmentDialog open={!!assignment} onOpenChange={(o) => !o && setAssignment(undefined)} assignment={assignment} />
    </div>
  )
}

interface GridProps {
  from: string
  occurrences: Occurrence[]
  events: CalendarEvent[]
  assignments: Assignment[]
}

function WeekGrid({
  from,
  occurrences,
  events,
  assignments,
  onSlot,
  onEvent,
  onAssignment
}: GridProps & { onSlot: (date: string, start: string) => void; onEvent: (e: CalendarEvent) => void; onAssignment: (a: Assignment) => void }) {
  const navigate = useNavigate()
  const courses = useAllCourses()
  const color = (id: string | null) => courseColor(courses.data?.find((c) => c.id === id)?.color)
  const courseName = (id: string | null) => courses.data?.find((c) => c.id === id)?.name ?? ''
  const days = Array.from({ length: 7 }, (_, i) => addDays(from, i))
  const today = localDate()
  const scroller = useRef<HTMLDivElement>(null)
  const [now, setNow] = useState(localNow())

  useEffect(() => {
    scroller.current?.scrollTo({ top: HOUR_PX * 1 })
    const t = setInterval(() => setNow(localNow()), 60_000)
    return () => clearInterval(t)
  }, [])

  const allDay = (d: string) => [
    ...events.filter((e) => (e.allDay || !e.startsAt.includes('T')) && e.startsAt.slice(0, 10) <= d && (e.endsAt ?? e.startsAt).slice(0, 10) >= d).map((e) => ({ kind: 'event' as const, e })),
    ...assignments.filter((a) => a.dueAt?.slice(0, 10) === d).map((a) => ({ kind: 'assignment' as const, a }))
  ]
  const hasAllDay = days.some((d) => allDay(d).length > 0)
  const top = (t: string) => ((toMin(t) - FIRST_HOUR * 60) / 60) * HOUR_PX
  const height = (s: string, e: string) => Math.max(20, ((toMin(e) - toMin(s)) / 60) * HOUR_PX - 2)

  return (
    <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto rounded-lg border border-line bg-raised">
      <div className="sticky top-0 z-20 bg-raised">
      <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-line">
        <div />
        {days.map((d) => (
          <div key={d} className="border-l border-line px-2 py-1.5 text-[12px]">
            <span className="text-muted">{dayName(d)} </span>
            <span className={cn('inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 font-medium tabular-nums', d === today && 'bg-accent text-white dark:text-[#10213f]')}>{Number(d.slice(8))}</span>
          </div>
        ))}
      </div>
      {hasAllDay && (
        <div className="grid grid-cols-[52px_repeat(7,1fr)] border-b border-line">
          <div className="px-1 py-1 text-right text-[10.5px] text-faint">all-day</div>
          {days.map((d) => (
            <div key={d} className="flex min-w-0 flex-col gap-0.5 border-l border-line p-0.5">
              {allDay(d).map((it) =>
                it.kind === 'event' ? (
                  <button key={it.e.id} onClick={() => onEvent(it.e)} className="truncate rounded px-1.5 py-0.5 text-left text-[11.5px] font-medium" style={{ background: color(it.e.courseId).soft }}>
                    {it.e.title}
                  </button>
                ) : (
                  <button key={it.a.id} onClick={() => onAssignment(it.a)} className={cn('truncate rounded border border-dashed px-1.5 py-0.5 text-left text-[11.5px]', it.a.status === 'done' && 'line-through opacity-60')} style={{ borderColor: color(it.a.courseId).solid }}>
                    {it.a.dueAt?.includes('T') && <span className="tabular-nums text-muted">{it.a.dueAt.slice(11)} </span>}
                    {it.a.title}
                  </button>
                )
              )}
            </div>
          ))}
        </div>
      )}
      </div>
      <div className="relative">
        <div className="relative grid grid-cols-[52px_repeat(7,1fr)]" style={{ height: (LAST_HOUR - FIRST_HOUR) * HOUR_PX }}>
          <div className="relative">
            {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => (
              <div key={i} className="absolute right-2 -translate-y-1/2 text-[10.5px] text-faint tabular-nums" style={{ top: i * HOUR_PX }}>
                {i === 0 ? '' : `${FIRST_HOUR + i}:00`}
              </div>
            ))}
          </div>
          {days.map((d) => (
            <div
              key={d}
              className={cn('relative border-l border-line', d === today && 'bg-accent-soft/40')}
              onDoubleClick={(e) => {
                const y = e.clientY - e.currentTarget.getBoundingClientRect().top
                const h = Math.min(LAST_HOUR - 1, FIRST_HOUR + Math.floor(y / HOUR_PX))
                onSlot(d, `${String(h).padStart(2, '0')}:00`)
              }}
            >
              {Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => (
                <div key={i} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR_PX }} />
              ))}
              {occurrences
                .filter((o) => o.date === d)
                .map((o) => (
                  <button
                    key={o.sessionId + o.date}
                    onClick={() => void navigate({ to: '/courses/$courseId', params: { courseId: o.courseId } })}
                    className="absolute inset-x-1 overflow-hidden rounded-md border-l-[3px] px-1.5 py-1 text-left text-[11.5px] leading-tight"
                    style={{ top: top(o.start) + 1, height: height(o.start, o.end), background: color(o.courseId).soft, borderColor: color(o.courseId).solid }}
                  >
                    <div className="truncate font-medium">{courseName(o.courseId)}</div>
                    <div className="truncate text-muted">
                      {SESSION_KIND_LABEL[o.kind]}
                      {o.location ? ` · ${o.location}` : ''}
                    </div>
                  </button>
                ))}
              {events
                .filter((e) => !e.allDay && e.startsAt.includes('T') && e.startsAt.slice(0, 10) === d)
                .map((e) => {
                  const s = e.startsAt.slice(11)
                  const end = e.endsAt?.slice(0, 10) === d ? e.endsAt.slice(11) : e.endsAt ? '23:59' : `${String(Math.min(23, Number(s.slice(0, 2)) + 1)).padStart(2, '0')}:${s.slice(3)}`
                  return (
                    <button
                      key={e.id}
                      onClick={() => onEvent(e)}
                      className="absolute inset-x-1 overflow-hidden rounded-md px-1.5 py-1 text-left text-[11.5px] leading-tight text-white shadow-sm"
                      style={{ top: top(s) + 1, height: height(s, end), background: e.kind === 'exam' ? 'var(--danger)' : color(e.courseId).solid }}
                    >
                      <div className="truncate font-medium">{e.title}</div>
                      <div className="truncate opacity-85">
                        {s}
                        {e.location ? ` · ${e.location}` : ''}
                      </div>
                    </button>
                  )
                })}
              {d === today && now.slice(11) >= `${String(FIRST_HOUR).padStart(2, '0')}:00` && (
                <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-danger" style={{ top: top(now.slice(11)) }}>
                  <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-danger" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function MonthGrid({ from, month, occurrences, events, assignments, onDay }: GridProps & { month: string; onDay: (d: string) => void }) {
  const courses = useAllCourses()
  const color = (id: string | null) => courseColor(courses.data?.find((c) => c.id === id)?.color)
  const today = localDate()
  const days = Array.from({ length: 42 }, (_, i) => addDays(from, i))
  return (
    <div className="grid min-h-0 flex-1 grid-cols-7 grid-rows-[auto_repeat(6,1fr)] overflow-hidden rounded-lg border border-line bg-raised">
      {days.slice(0, 7).map((d) => (
        <div key={d} className="border-b border-line px-2 py-1 text-[12px] text-muted">
          {dayName(d)}
        </div>
      ))}
      {days.map((d, i) => {
        const items = [
          ...events.filter((e) => e.startsAt.slice(0, 10) <= d && (e.endsAt ?? e.startsAt).slice(0, 10) >= d).map((e) => ({ id: e.id, label: e.title, color: e.kind === 'exam' ? 'var(--danger)' : color(e.courseId).solid, strong: true })),
          ...assignments.filter((a) => a.dueAt?.slice(0, 10) === d).map((a) => ({ id: a.id, label: a.title, color: color(a.courseId).solid, strong: false }))
        ]
        const classes = occurrences.filter((o) => o.date === d).length
        return (
          <button
            key={d}
            onClick={() => onDay(d)}
            className={cn('flex min-h-0 flex-col gap-0.5 overflow-hidden border-line p-1 text-left hover:bg-hover', i % 7 !== 0 && 'border-l', i >= 7 && 'border-t', !d.startsWith(month) && 'opacity-45')}
          >
            <span className="flex items-center justify-between text-[12px]">
              <span className={cn('inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 tabular-nums', d === today && 'bg-accent font-medium text-white dark:text-[#10213f]')}>{Number(d.slice(8))}</span>
              {classes > 0 && <span className="text-[10.5px] text-faint">{classes} class{classes > 1 ? 'es' : ''}</span>}
            </span>
            {items.slice(0, 3).map((it) => (
              <span key={it.id} className="flex items-center gap-1 truncate text-[11.5px]">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: it.color }} />
                <span className={cn('truncate', it.strong && 'font-medium')}>{it.label}</span>
              </span>
            ))}
            {items.length > 3 && <span className="text-[11px] text-faint">+{items.length - 3} more</span>}
          </button>
        )
      })}
    </div>
  )
}
