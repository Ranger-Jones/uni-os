// Calendar math on local date strings (YYYY-MM-DD). Using UTC internally avoids DST shifts.

const toUtc = (d: string): Date => {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day))
}
const fromUtc = (d: Date): string => d.toISOString().slice(0, 10)

/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const weekdayOf = (d: string): number => ((toUtc(d).getUTCDay() + 6) % 7) + 1

export const addDays = (d: string, n: number): string => {
  const x = toUtc(d)
  x.setUTCDate(x.getUTCDate() + n)
  return fromUtc(x)
}

export function eachDay(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to && out.length < 1000; d = addDays(d, 1)) out.push(d)
  return out
}

/** Monday of the week containing `d`. */
export const startOfWeek = (d: string): string => addDays(d, 1 - weekdayOf(d))

export interface ExpandableSession {
  id: string
  courseId: string
  kind: 'lecture' | 'tutorial' | 'lab' | 'seminar' | 'other'
  weekday: number
  startTime: string
  endTime: string
  location: string | null
  startDate: string | null
  endDate: string | null
  /** Semester bounds, used when the session has no own start/end date. */
  boundsStart: string
  boundsEnd: string
}

export interface Occurrence {
  sessionId: string
  courseId: string
  date: string
  start: string
  end: string
  kind: ExpandableSession['kind']
  location: string | null
}

export function expandSessions(sessions: ExpandableSession[], range: { from: string; to: string }): Occurrence[] {
  const out: Occurrence[] = []
  for (const s of sessions) {
    const from = [range.from, s.startDate ?? s.boundsStart].sort()[1]
    const to = [range.to, s.endDate ?? s.boundsEnd].sort()[0]
    if (from > to) continue
    let d = addDays(from, (s.weekday - weekdayOf(from) + 7) % 7)
    for (; d <= to; d = addDays(d, 7)) {
      out.push({ sessionId: s.id, courseId: s.courseId, date: d, start: s.startTime, end: s.endTime, kind: s.kind, location: s.location })
    }
  }
  return out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
}
