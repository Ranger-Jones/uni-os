// What the user is looking at, in words for the model (used by the mascot).
import type { Db } from '../db/open'
import { blocksToMarkdown } from '../domain/markdown'
import { TYPE_LABEL } from '../domain/tests'
import * as courses from '../repo/courses'
import * as pages from '../repo/pages'
import * as tests from '../repo/tests'

export interface View {
  /** Router path, e.g. /pages/<id>, /courses/<id>, /today. */
  path: string
  pageId?: string
  courseId?: string
  /** Course tab (overview, notes, assignments, files, grades, cards, tests). */
  tab?: string
  testId?: string
}

const MAX_CONTENT = 12_000
const SCREENS: Record<string, string> = {
  '/today': 'the Today overview (timetable, deadlines and events of the day)',
  '/calendar': 'the calendar',
  '/grades': 'the grades overview',
  '/flashcards': 'the flashcard decks',
  '/chat': 'the assistant chat',
  '/settings': 'the settings'
}
const TABS: Record<string, string> = {
  overview: 'overview',
  notes: 'notes',
  assignments: 'assignments',
  files: 'materials (files, links and videos)',
  grades: 'grades',
  cards: 'flashcards',
  tests: 'quizzes and test exams'
}

const cut = (text: string, what: string) =>
  text.length > MAX_CONTENT ? `${text.slice(0, MAX_CONTENT)}\n\n[… ${what} truncated — use read_page for the rest]` : text

const courseName = (db: Db, id: string | null): string | null => {
  if (!id) return null
  try {
    return courses.get(db, id).name
  } catch {
    return null
  }
}

/** A short description of the current screen, with the content of an open note page or test. */
export async function describeView(db: Db, view: View): Promise<string> {
  const head = 'What the user is looking at right now:'
  if (view.pageId) {
    let p: ReturnType<typeof pages.get>
    try {
      p = pages.get(db, view.pageId)
    } catch {
      return `${head} a note page that no longer exists.`
    }
    const course = courseName(db, p.courseId)
    const md = (await blocksToMarkdown(JSON.parse(p.content) as unknown[])).trim()
    return [
      `${head} the note page "${p.title || 'Untitled'}" (page id ${p.id})${course ? ` of the course "${course}" (id ${p.courseId})` : ''}.`,
      md ? `Content of the page:\n\n${cut(md, 'page')}` : 'The page is still empty.'
    ].join('\n\n')
  }
  if (view.courseId) {
    const course = courseName(db, view.courseId)
    if (!course) return `${head} a course that no longer exists.`
    const where = `${head} the course "${course}" (id ${view.courseId}), tab ${TABS[view.tab ?? 'overview'] ?? view.tab}.`
    if (!view.testId) return where
    try {
      const t = tests.get(db, view.testId)
      const qs = t.questions.map((q, i) => `${i + 1}. (${TYPE_LABEL[q.type]}, ${q.points} pts) ${q.prompt}${q.options.length ? `\n   Options: ${q.options.join(' | ')}` : ''}`)
      return `${where}\nOpen: the ${t.kind === 'quiz' ? 'quiz' : 'test exam'} "${t.title}" (test id ${t.id}) with ${t.questions.length} questions:\n${cut(qs.join('\n'), 'question list')}\nIf the user is taking it right now, give hints rather than the answers unless they ask for the solution.`
    } catch {
      return where
    }
  }
  return `${head} ${SCREENS[view.path] ?? `the screen ${view.path}`}.`
}
