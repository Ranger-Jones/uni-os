import type { Db } from '@core/db/open'
import * as courses from '@core/repo/courses'
import * as semesters from '@core/repo/semesters'

export function seedCourse(db: Db, name = 'Analysis I', extra: Partial<courses.CourseInput> = {}) {
  const s = semesters.list(db)[0] ?? semesters.create(db, { name: 'WS 26/27', startDate: '2026-10-01', endDate: '2027-03-31' })
  return courses.create(db, { semesterId: s.id, name, ects: 5, ...extra })
}

export const para = (text: string, children: unknown[] = []) => ({
  id: crypto.randomUUID(),
  type: 'paragraph',
  props: {},
  content: [{ type: 'text', text, styles: {} }],
  children
})
