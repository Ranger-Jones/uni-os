import { z } from 'zod'
import { findInText } from '../domain/pageText'
import { requiredAverage } from '../domain/grades'
import { blocksToMarkdown } from '../domain/markdown'
import { localDate } from '../util'
import * as assignments from '../repo/assignments'
import * as courses from '../repo/courses'
import * as events from '../repo/events'
import * as files from '../repo/files'
import * as grades from '../repo/grades'
import * as links from '../repo/links'
import * as pages from '../repo/pages'
import * as search from '../repo/search'
import * as semesters from '../repo/semesters'
import * as sessions from '../repo/sessions'
import { addDays } from '../domain/schedule'
import { defineTool, id } from './define'

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe('YYYY-MM-DD')

const courseSummary = (c: courses.Course) => ({
  id: c.id,
  name: c.name,
  code: c.code,
  ects: c.ects,
  grading: c.gradingMode,
  target_grade: c.targetGrade,
  lecturer: c.lecturer,
  archived: c.archived
})

export const readTools = [
  defineTool({
    name: 'list_semesters',
    description: 'List all semesters with their date ranges, newest first. Includes which one is current.',
    input: z.object({}),
    mutates: false,
    run: ({ db, now }) => {
      const cur = semesters.current(db, localDate(now()))
      return semesters.list(db).map((s) => ({ id: s.id, name: s.name, start: s.startDate, end: s.endDate, current: s.id === cur?.id }))
    }
  }),
  defineTool({
    name: 'list_courses',
    description: 'List courses. Defaults to the current semester; pass semester_id for another one or all=true for every semester.',
    input: z.object({ semester_id: z.string().optional(), all: z.boolean().optional(), include_archived: z.boolean().optional() }),
    mutates: false,
    run: ({ db, now }, i) => {
      const semesterId = i.all ? undefined : (i.semester_id ?? semesters.current(db, localDate(now()))?.id)
      return courses.list(db, { semesterId, includeArchived: i.include_archived }).map(courseSummary)
    }
  }),
  defineTool({
    name: 'get_course',
    description: 'Everything about one course: details, weekly schedule, grade components and grade, open assignments, upcoming events, note pages and files.',
    input: z.object({ course_id: id('Course') }),
    mutates: false,
    run: ({ db, now }, i) => {
      const c = courses.get(db, i.course_id)
      const today = localDate(now())
      const g = grades.summarize(c, grades.listComponents(db, c.id))
      return {
        ...courseSummary(c),
        location: c.location,
        overview: c.overview,
        schedule: sessions.listForCourse(db, c.id).map((s) => ({ kind: s.kind, weekday: s.weekday, start: s.startTime, end: s.endTime, location: s.location })),
        grade: { value: g.grade, provisional: g.provisional, passed: g.passed, components: g.components.map((x) => ({ id: x.id, name: x.name, weight: x.weight, grade: x.grade, passed: x.passed })) },
        open_assignments: assignments.list(db, { courseId: c.id, status: assignments.OPEN_STATUS }).map((a) => ({ id: a.id, title: a.title, due_at: a.dueAt, status: a.status })),
        upcoming_events: events.list(db, { from: today, to: addDays(today, 180), courseId: c.id }).map((e) => ({ id: e.id, title: e.title, kind: e.kind, starts_at: e.startsAt })),
        pages: pages.list(db, { courseId: c.id }).map((p) => ({ id: p.id, title: p.title || 'Untitled', parent_id: p.parentId })),
        files: files.list(db, { courseId: c.id }).map((f) => ({ id: f.id, name: f.name, tags: f.tags, has_text: f.hasText, pages: f.pageCount })),
        links: links.list(db, { courseId: c.id }).map((l) => ({ id: l.id, title: l.title, url: l.url, kind: l.kind, tags: l.tags }))
      }
    }
  }),
  defineTool({
    name: 'list_pages',
    description: 'List note pages of a course (or pages without a course when course_id is null).',
    input: z.object({ course_id: z.string().nullable() }),
    mutates: false,
    run: ({ db }, i) => pages.list(db, { courseId: i.course_id }).map((p) => ({ id: p.id, title: p.title || 'Untitled', parent_id: p.parentId, updated_at: p.updatedAt }))
  }),
  defineTool({
    name: 'read_page',
    description: 'Read a note page as Markdown. Links to other pages appear as [Title](unios://page/<id>); linked_from lists pages that link here.',
    input: z.object({ page_id: id('Page') }),
    mutates: false,
    run: async ({ db }, i) => {
      const p = pages.get(db, i.page_id)
      return {
        id: p.id,
        title: p.title,
        course_id: p.courseId,
        markdown: await blocksToMarkdown(JSON.parse(p.content) as unknown[]),
        linked_from: pages.backlinks(db, p.id).map((b) => ({ id: b.id, title: b.title || 'Untitled' }))
      }
    }
  }),
  defineTool({
    name: 'search',
    description: 'Full-text search across note pages, file contents (PDF text) and assignments. Returns matches with snippets.',
    input: z.object({ query: z.string().min(1), course_id: z.string().optional() }),
    mutates: false,
    run: ({ db }, i) => search.query(db, i.query, { courseId: i.course_id, limit: 15 }).map((h) => ({ type: h.entityType, id: h.entityId, course_id: h.courseId, title: h.title, snippet: h.snippet.replace(/[«»]/g, '') }))
  }),
  defineTool({
    name: 'list_assignments',
    description: 'List assignments (homework, exercise sheets, projects). Filter by course, status and due date range.',
    input: z.object({
      course_id: z.string().optional(),
      status: z.array(z.enum(assignments.ASSIGNMENT_STATUS)).optional(),
      due_from: date.optional(),
      due_to: date.optional()
    }),
    mutates: false,
    run: ({ db }, i) =>
      assignments.list(db, { courseId: i.course_id, status: i.status, dueFrom: i.due_from, dueTo: i.due_to }).map((a) => ({ id: a.id, course_id: a.courseId, title: a.title, description: a.description, due_at: a.dueAt, status: a.status, priority: a.priority }))
  }),
  defineTool({
    name: 'list_events',
    description: 'List one-off calendar events (exams, deadlines, appointments) in a date range.',
    input: z.object({ from: date, to: date, course_id: z.string().optional() }),
    mutates: false,
    run: ({ db }, i) => events.list(db, { from: i.from, to: i.to, courseId: i.course_id }).map((e) => ({ id: e.id, course_id: e.courseId, title: e.title, kind: e.kind, starts_at: e.startsAt, ends_at: e.endsAt, location: e.location }))
  }),
  defineTool({
    name: 'get_schedule',
    description: 'Concrete class meetings (lectures, tutorials…) between two dates, expanded from the weekly schedules.',
    input: z.object({ from: date, to: date }),
    mutates: false,
    run: ({ db }, i) => {
      const names = new Map(courses.list(db, { includeArchived: true }).map((c) => [c.id, c.name]))
      return sessions.occurrences(db, { from: i.from, to: i.to > addDays(i.from, 62) ? addDays(i.from, 62) : i.to }).map((o) => ({ date: o.date, start: o.start, end: o.end, course: names.get(o.courseId), course_id: o.courseId, kind: o.kind, location: o.location }))
    }
  }),
  defineTool({
    name: 'get_grades',
    description: 'Grades per course (German scale 1.0 best – 5.0 fail, truncated to one decimal), ECTS-weighted GPA, earned and remaining ECTS. Optionally for one semester.',
    input: z.object({ semester_id: z.string().optional() }),
    mutates: false,
    run: ({ db }, i) => {
      const o = grades.overview(db, { semesterId: i.semester_id })
      return {
        gpa: o.gpa,
        gpa_including_provisional: o.provisionalGpa,
        ects_earned: o.ectsEarned,
        ects_total: o.ectsTotal,
        ects_remaining_graded: o.remainingEcts,
        courses: o.courses.map((r) => ({ course_id: r.course.id, course: r.course.name, ects: r.course.ects, grading: r.course.gradingMode, grade: r.grade, provisional: r.provisional, passed: r.passed, components: r.components.map((c) => ({ id: c.id, name: c.name, weight: c.weight, grade: c.grade, passed: c.passed })) }))
      }
    }
  }),
  defineTool({
    name: 'grade_forecast',
    description: 'Average grade needed on the remaining graded ECTS to reach a target GPA.',
    input: z.object({ target: z.number().min(1).max(4), semester_id: z.string().optional() }),
    mutates: false,
    run: ({ db }, i) => {
      const o = grades.overview(db, { semesterId: i.semester_id })
      const done = o.courses.filter((r) => r.course.gradingMode === 'graded' && r.passed && r.grade !== null).map((r) => ({ ects: r.course.ects, grade: r.grade as number }))
      return { ...requiredAverage(i.target, done, o.remainingEcts), remaining_ects: o.remainingEcts, current_gpa: o.gpa }
    }
  }),
  defineTool({
    name: 'list_files',
    description: 'List files (lecture slides, exercise sheets, …) of a course with their tags. Filter with tag, e.g. "lecture", "exercise", "solution", "notes", "exam", "literature".',
    input: z.object({ course_id: id('Course'), tag: z.string().optional() }),
    mutates: false,
    run: ({ db }, i) => {
      courses.get(db, i.course_id)
      return files.list(db, { courseId: i.course_id, tag: i.tag }).map((f) => ({ id: f.id, name: f.name, tags: f.tags, type: f.mime, has_text: f.hasText, pages: f.pageCount }))
    }
  }),
  defineTool({
    name: 'list_links',
    description: 'List web resources of a course (links and video links such as lecture recordings) with their tags. Filter with tag.',
    input: z.object({ course_id: id('Course'), tag: z.string().optional() }),
    mutates: false,
    run: ({ db }, i) => {
      courses.get(db, i.course_id)
      return links.list(db, { courseId: i.course_id, tag: i.tag }).map((l) => ({ id: l.id, title: l.title, url: l.url, kind: l.kind, tags: l.tags, note: l.note }))
    }
  }),
  defineTool({
    name: 'read_file_text',
    description:
      'Read the extracted text of a file (e.g. lecture slides as PDF). Pages are marked "[Page N]" (= slide N). Pass page (and to_page) to read specific pages, otherwise it returns 20,000 characters at a time; use next_offset to continue.',
    input: z.object({
      file_id: id('File'),
      page: z.number().int().min(1).optional().describe('First page to read (1-based)'),
      to_page: z.number().int().min(1).optional().describe('Last page to read (default: page)'),
      offset: z.number().int().min(0).optional()
    }),
    mutates: false,
    run: ({ db }, i) => {
      const f = files.get(db, i.file_id)
      if (!f.text) return { name: f.name, text: null, note: 'No text could be extracted from this file (scanned PDF or unsupported type).' }
      return { name: f.name, ...files.textPage(db, f.id, i.page ? { page: i.page, toPage: i.to_page } : { offset: i.offset, limit: 20_000 }) }
    }
  }),
  defineTool({
    name: 'find_in_files',
    description:
      "Query in ENGLISH (the slides are in English): translate German terms first, e.g. 'Linie im Unendlichen' → 'line infinity', 'Kreuzprodukt' → 'cross product'. Finds on which page (slide) of the user's lecture files a topic appears: searches the text of all course files (PDF slides, scripts, exercise sheets) and returns file, page number and a snippet for every page containing all words of the query. Use it whenever the user asks where/on which slide something is, or before answering questions about lecture material. The slides are usually in English: search with English terms even when the user writes German (e.g. 'line infinity' for 'Linie im Unendlichen').",
    input: z.object({
      query: z.string().min(2).describe('Words that must all appear on the page, e.g. "line infinity"'),
      course_id: z.string().optional(),
      file_id: z.string().optional().describe('Search only this file')
    }),
    mutates: false,
    run: ({ db }, i) => {
      const candidates = i.file_id ? [files.get(db, i.file_id)] : files.list(db, { courseId: i.course_id }).filter((f) => f.hasText).map((f) => files.get(db, f.id))
      const search = (partial: boolean) =>
        candidates.flatMap((f) =>
          findInText(f.text ?? '', i.query, { partial }).map((h) => ({
            file: f.name,
            file_id: f.id,
            course_id: f.courseId,
            page: h.page,
            snippet: h.snippet,
            ...(partial ? { partial: true, words_found: h.matched } : {})
          }))
        )
      let matches = search(false)
      let note: string | undefined
      if (!matches.length) {
        matches = search(true).sort((a, b) => (b.words_found?.length ?? 0) - (a.words_found?.length ?? 0))
        note = matches.length
          ? 'Not all words appear on one page; these pages contain some of them (best first). Check them, or search again with other words.'
          : 'Nothing found. The slides are usually in English: translate the words (e.g. "Linie im Unendlichen" → "line infinity", "Kreuzprodukt" → "cross product") or use synonyms, and call find_in_files again before you answer.'
      }
      const limited = matches.slice(0, 25)
      return { matches: limited, ...(matches.length > limited.length ? { more: matches.length - limited.length } : {}), ...(note ? { note } : {}) }
    }
  })
]
