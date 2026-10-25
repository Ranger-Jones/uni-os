import { integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import type { QuestionType, Response, Solution, TestKind } from '../domain/tests'

export const COURSE_COLORS = ['gray', 'red', 'orange', 'yellow', 'green', 'teal', 'blue', 'purple', 'pink'] as const

const id = () => text('id').primaryKey()
const timestamps = {
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull()
}

export const semesters = sqliteTable('semesters', {
  id: id(),
  name: text('name').notNull(),
  startDate: text('start_date').notNull(),
  endDate: text('end_date').notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
  ...timestamps
})

export const courses = sqliteTable('courses', {
  id: id(),
  semesterId: text('semester_id').notNull(),
  name: text('name').notNull(),
  code: text('code'),
  ects: real('ects').notNull().default(0),
  color: text('color', { enum: COURSE_COLORS }).notNull().default('blue'),
  icon: text('icon'),
  lecturer: text('lecturer'),
  location: text('location'),
  gradingMode: text('grading_mode', { enum: ['graded', 'pass_fail'] }).notNull().default('graded'),
  targetGrade: real('target_grade'),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  overview: text('overview'),
  ...timestamps
})

export const courseSessions = sqliteTable('course_sessions', {
  id: id(),
  courseId: text('course_id').notNull(),
  kind: text('kind', { enum: ['lecture', 'tutorial', 'lab', 'seminar', 'other'] }).notNull(),
  weekday: integer('weekday').notNull(),
  startTime: text('start_time').notNull(),
  endTime: text('end_time').notNull(),
  location: text('location'),
  startDate: text('start_date'),
  endDate: text('end_date'),
  ...timestamps
})

export const events = sqliteTable('events', {
  id: id(),
  courseId: text('course_id'),
  title: text('title').notNull(),
  kind: text('kind', { enum: ['exam', 'deadline', 'appointment', 'other'] }).notNull(),
  startsAt: text('starts_at').notNull(),
  endsAt: text('ends_at'),
  allDay: integer('all_day', { mode: 'boolean' }).notNull().default(false),
  location: text('location'),
  description: text('description'),
  ...timestamps
})

export const pages = sqliteTable('pages', {
  id: id(),
  courseId: text('course_id'),
  parentId: text('parent_id'),
  title: text('title').notNull().default(''),
  icon: text('icon'),
  content: text('content').notNull().default('[]'),
  contentText: text('content_text').notNull().default(''),
  sortOrder: real('sort_order').notNull().default(0),
  deletedAt: text('deleted_at'),
  ...timestamps
})

export const gradeComponents = sqliteTable('grade_components', {
  id: id(),
  courseId: text('course_id').notNull(),
  name: text('name').notNull(),
  weight: real('weight').notNull(),
  grade: real('grade'),
  passed: integer('passed', { mode: 'boolean' }),
  date: text('date'),
  ...timestamps
})

export const assignments = sqliteTable('assignments', {
  id: id(),
  courseId: text('course_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  dueAt: text('due_at'),
  status: text('status', { enum: ['todo', 'in_progress', 'done', 'submitted'] }).notNull().default('todo'),
  priority: text('priority', { enum: ['low', 'medium', 'high'] }).notNull().default('medium'),
  gradeComponentId: text('grade_component_id'),
  ...timestamps
})

export const files = sqliteTable('files', {
  id: id(),
  courseId: text('course_id').notNull(),
  name: text('name').notNull(),
  storedPath: text('stored_path').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  text: text('text'),
  pageCount: integer('page_count'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  ...timestamps
})

export const decks = sqliteTable('decks', {
  id: id(),
  courseId: text('course_id'),
  name: text('name').notNull(),
  ...timestamps
})

export const cards = sqliteTable('cards', {
  id: id(),
  deckId: text('deck_id').notNull(),
  front: text('front').notNull(),
  back: text('back').notNull(),
  sourcePageId: text('source_page_id'),
  due: text('due').notNull(),
  stability: real('stability').notNull().default(0),
  difficulty: real('difficulty').notNull().default(0),
  elapsedDays: real('elapsed_days').notNull().default(0),
  scheduledDays: real('scheduled_days').notNull().default(0),
  learningSteps: integer('learning_steps').notNull().default(0),
  reps: integer('reps').notNull().default(0),
  lapses: integer('lapses').notNull().default(0),
  state: integer('state').notNull().default(0),
  lastReview: text('last_review'),
  ...timestamps
})

export const chatThreads = sqliteTable('chat_threads', {
  id: id(),
  title: text('title').notNull(),
  courseId: text('course_id'),
  provider: text('provider', { enum: ['anthropic', 'openai', 'local'] }).notNull(),
  model: text('model').notNull(),
  ...timestamps
})

export const chatMessages = sqliteTable('chat_messages', {
  id: id(),
  threadId: text('thread_id').notNull(),
  role: text('role', { enum: ['user', 'assistant', 'tool'] }).notNull(),
  content: text('content').notNull(),
  createdAt: text('created_at').notNull()
})

export const pageLinks = sqliteTable(
  'page_links',
  {
    fromId: text('from_id').notNull(),
    toId: text('to_id').notNull()
  },
  (t) => [primaryKey({ columns: [t.fromId, t.toId] })]
)

export const courseLinks = sqliteTable('course_links', {
  id: id(),
  courseId: text('course_id').notNull(),
  title: text('title').notNull(),
  url: text('url').notNull(),
  kind: text('kind', { enum: ['link', 'video'] }).notNull().default('link'),
  note: text('note'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  ...timestamps
})

export interface AttemptAnswer {
  questionId: string
  response: Response
  points: number
  /** Full points reached. */
  correct: boolean
  grading: 'auto' | 'ai' | 'manual' | 'pending'
  feedback?: string | null
}

export const tests = sqliteTable('tests', {
  id: id(),
  courseId: text('course_id').notNull(),
  kind: text('kind').$type<TestKind>().notNull(),
  title: text('title').notNull(),
  description: text('description'),
  timeLimitMin: integer('time_limit_min'),
  fileIds: text('file_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  ...timestamps
})

export const testQuestions = sqliteTable('test_questions', {
  id: id(),
  testId: text('test_id').notNull(),
  type: text('type').$type<QuestionType>().notNull(),
  prompt: text('prompt').notNull(),
  options: text('options', { mode: 'json' }).$type<string[]>().notNull().default([]),
  solution: text('solution', { mode: 'json' }).$type<Solution>().notNull(),
  points: real('points').notNull().default(1),
  explanation: text('explanation'),
  sourcePageId: text('source_page_id'),
  sortOrder: real('sort_order').notNull().default(0),
  ...timestamps
})

export const testAttempts = sqliteTable('test_attempts', {
  id: id(),
  testId: text('test_id').notNull(),
  mode: text('mode').$type<'interactive' | 'paper'>().notNull(),
  startedAt: text('started_at').notNull(),
  finishedAt: text('finished_at'),
  score: real('score').notNull().default(0),
  maxScore: real('max_score').notNull().default(0),
  answers: text('answers', { mode: 'json' }).$type<AttemptAnswer[]>().notNull().default([]),
  note: text('note'),
  ...timestamps
})
