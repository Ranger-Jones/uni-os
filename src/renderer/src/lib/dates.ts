import { addDays, weekdayOf } from '@core/domain/schedule'
import { localDate, localNow } from '@core/util'

export { addDays, localDate, localNow, weekdayOf }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const DAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

const parts = (d: string) => d.split('-').map(Number) as [number, number, number]

export const dayName = (d: string, long = false) => (long ? DAYS_LONG : DAYS)[weekdayOf(d) - 1]
export const shortDate = (d: string) => `${parts(d)[2]} ${MONTHS[parts(d)[1] - 1]}`
export const longDate = (d: string) => `${dayName(d, true)}, ${parts(d)[2]} ${MONTHS_LONG[parts(d)[1] - 1]}`
export const monthTitle = (d: string) => `${MONTHS_LONG[parts(d)[1] - 1]} ${parts(d)[0]}`

/** "Today", "Tomorrow", "Yesterday", "Thu" (within a week) or "3 Nov". */
export function relativeDay(d: string, today = localDate()): string {
  const diff = Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Tomorrow'
  if (diff === -1) return 'Yesterday'
  if (diff > 1 && diff < 7) return dayName(d)
  return shortDate(d)
}

/** Due label like "Tomorrow 23:59" or "3 Nov". */
export function dueLabel(dueAt: string, today = localDate()): string {
  const [d, t] = dueAt.split('T')
  return t ? `${relativeDay(d, today)} ${t}` : relativeDay(d, today)
}

export const startOfMonth = (d: string) => `${d.slice(0, 7)}-01`
export function addMonths(d: string, n: number): string {
  const [y, m] = parts(d)
  const total = y * 12 + (m - 1) + n
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}-01`
}
