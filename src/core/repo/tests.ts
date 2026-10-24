import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { z } from 'zod'
import type { Db } from '../db/open'
import { files, pages, testAttempts, testQuestions, tests, type AttemptAnswer } from '../db/schema'
import { autoGrade, clampPoints, normalizeQuestion, percentOf, TEST_KINDS, type Question, type QuestionInput, type Response } from '../domain/tests'
import { AppError, notFound, parse } from '../errors'
import { dateStr, isoDateTime, newId, nowIso } from '../util'
import { get as getCourse } from './courses'
import * as search from './search'

export type Test = typeof tests.$inferSelect
export type Attempt = typeof testAttempts.$inferSelect
export type TestWithQuestions = Test & { questions: Question[] }
export type TestSummary = Test & { questionCount: number; maxPoints: number; attemptCount: number; lastPercent: number | null; bestPercent: number | null; lastAt: string | null }
export type { AttemptAnswer }

export const TestInput = z.object({
  courseId: z.string().min(1),
  kind: z.enum(TEST_KINDS),
  title: z.string().trim().min(1, 'Give the test a title'),
  description: z.string().trim().nullish(),
  timeLimitMin: z.number().int().positive().max(600).nullish(),
  fileIds: z.array(z.string()).optional()
})
export type TestInput = z.input<typeof TestInput> & { questions?: QuestionInput[] }
export const TestPatch = TestInput.omit({ courseId: true }).partial()

const round2 = (n: number) => Math.round(n * 100) / 100

function checkFiles(db: Db, courseId: string, ids: string[]): string[] {
  const unique = [...new Set(ids)]
  if (!unique.length) return []
  const found = db.select({ id: files.id, courseId: files.courseId }).from(files).where(inArray(files.id, unique)).all()
  for (const id of unique) if (!found.some((f) => f.id === id && f.courseId === courseId)) throw new AppError('VALIDATION', 'Linked file not found in this course')
  return unique
}

/** Drop links to files that were deleted since. */
function withLiveFiles(db: Db, t: Test): Test {
  if (!t.fileIds.length) return t
  const live = new Set(db.select({ id: files.id }).from(files).where(inArray(files.id, t.fileIds)).all().map((f) => f.id))
  return { ...t, fileIds: t.fileIds.filter((id) => live.has(id)) }
}

function questionsOf(db: Db, testId: string): Question[] {
  return db.select().from(testQuestions).where(eq(testQuestions.testId, testId)).orderBy(asc(testQuestions.sortOrder), asc(testQuestions.createdAt)).all() as Question[]
}

function reindex(db: Db, testId: string): void {
  const t = db.select().from(tests).where(eq(tests.id, testId)).get()
  if (!t) return
  const prompts = questionsOf(db, testId).map((q) => q.prompt)
  search.index(db, { entityType: 'test', entityId: t.id, courseId: t.courseId, title: t.title, body: [t.description ?? '', ...prompts].join('\n') })
}

/** Source pages must be live pages of the same course; anything else (made up, trashed, foreign) is dropped. */
function livePageIds(db: Db, courseId: string, ids: (string | null)[]): Set<string> {
  const wanted = [...new Set(ids.filter((x): x is string => !!x))]
  if (!wanted.length) return new Set()
  const rows = db.select({ id: pages.id }).from(pages).where(and(inArray(pages.id, wanted), eq(pages.courseId, courseId), isNull(pages.deletedAt))).all()
  return new Set(rows.map((r) => r.id))
}

function insertQuestions(db: Db, courseId: string, testId: string, inputs: QuestionInput[], startOrder: number, t: string): void {
  const normalized = inputs.map(normalizeQuestion)
  const live = livePageIds(db, courseId, normalized.map((q) => q.sourcePageId))
  const rows = normalized.map((q, i) => ({ ...q, sourcePageId: q.sourcePageId && live.has(q.sourcePageId) ? q.sourcePageId : null, id: newId(), testId, sortOrder: startOrder + i, createdAt: t, updatedAt: t }))
  if (rows.length) db.insert(testQuestions).values(rows).run()
}

export function list(db: Db, opts: { courseId?: string } = {}): TestSummary[] {
  const q = db.select().from(tests)
  const rows = (opts.courseId ? q.where(eq(tests.courseId, opts.courseId)) : q).orderBy(asc(tests.createdAt)).all()
  return rows.map((t) => {
    const qs = db.select({ points: testQuestions.points }).from(testQuestions).where(eq(testQuestions.testId, t.id)).all()
    const atts = listAttempts(db, t.id)
    const pcts = atts.map((a) => percentOf(a.score, a.maxScore)).filter((p): p is number => p !== null)
    const last = atts.at(-1)
    return {
      ...withLiveFiles(db, t),
      questionCount: qs.length,
      maxPoints: round2(qs.reduce((s, x) => s + x.points, 0)),
      attemptCount: atts.length,
      lastPercent: last ? percentOf(last.score, last.maxScore) : null,
      bestPercent: pcts.length ? Math.max(...pcts) : null,
      lastAt: last?.finishedAt ?? last?.startedAt ?? null
    }
  })
}

export function getTest(db: Db, id: string): Test {
  const row = db.select().from(tests).where(eq(tests.id, id)).get()
  if (!row) throw notFound('Test')
  return row
}

export function get(db: Db, id: string): TestWithQuestions {
  return { ...withLiveFiles(db, getTest(db, id)), questions: questionsOf(db, id) }
}

export function create(db: Db, input: TestInput): Test {
  const v = parse(TestInput, input)
  getCourse(db, v.courseId)
  const fileIds = checkFiles(db, v.courseId, v.fileIds ?? [])
  const t = nowIso()
  const id = newId()
  db.transaction((tx) => {
    tx.insert(tests)
      .values({ id, courseId: v.courseId, kind: v.kind, title: v.title, description: v.description || null, timeLimitMin: v.timeLimitMin ?? null, fileIds, createdAt: t, updatedAt: t })
      .run()
    insertQuestions(tx as unknown as Db, v.courseId, id, input.questions ?? [], 0, t)
  })
  reindex(db, id)
  return getTest(db, id)
}

export function update(db: Db, id: string, patch: z.input<typeof TestPatch>): Test {
  const v = parse(TestPatch, patch)
  const cur = getTest(db, id)
  const fileIds = v.fileIds ? checkFiles(db, cur.courseId, v.fileIds) : undefined
  db.update(tests)
    .set({
      ...(v.kind ? { kind: v.kind } : {}),
      ...(v.title ? { title: v.title } : {}),
      ...(v.description !== undefined ? { description: v.description || null } : {}),
      ...(v.timeLimitMin !== undefined ? { timeLimitMin: v.timeLimitMin ?? null } : {}),
      ...(fileIds ? { fileIds } : {}),
      updatedAt: nowIso()
    })
    .where(eq(tests.id, id))
    .run()
  reindex(db, id)
  return getTest(db, id)
}

export function remove(db: Db, id: string): void {
  db.delete(tests).where(eq(tests.id, id)).run()
}

export function addQuestions(db: Db, testId: string, inputs: QuestionInput[]): Question[] {
  const test = getTest(db, testId)
  const existing = questionsOf(db, testId)
  const before = new Set(existing.map((q) => q.id))
  const start = existing.length ? Math.max(...existing.map((q) => q.sortOrder)) + 1 : 0
  db.transaction((tx) => insertQuestions(tx as unknown as Db, test.courseId, testId, inputs, start, nowIso()))
  db.update(tests).set({ updatedAt: nowIso() }).where(eq(tests.id, testId)).run()
  reindex(db, testId)
  return questionsOf(db, testId).filter((q) => !before.has(q.id))
}

export function getQuestion(db: Db, id: string): Question {
  const row = db.select().from(testQuestions).where(eq(testQuestions.id, id)).get()
  if (!row) throw notFound('Question')
  return row as Question
}

export function removeQuestion(db: Db, questionId: string): void {
  const q = db.select().from(testQuestions).where(eq(testQuestions.id, questionId)).get()
  if (!q) throw notFound('Question')
  db.transaction((tx) => {
    tx.delete(testQuestions).where(eq(testQuestions.id, questionId)).run()
    // Answers to the deleted question that still wait for grading would otherwise never be settled.
    for (const a of tx.select().from(testAttempts).where(eq(testAttempts.testId, q.testId)).all()) {
      if (!a.answers.some((x) => x.questionId === questionId && x.grading === 'pending')) continue
      const answers = a.answers.map((x) => (x.questionId === questionId && x.grading === 'pending' ? { ...x, points: 0, correct: false, grading: 'auto' as const } : x))
      tx.update(testAttempts).set({ answers, score: sum(answers), updatedAt: nowIso() }).where(eq(testAttempts.id, a.id)).run()
    }
  })
  reindex(db, q.testId)
}

// ----- attempts -----

export function listAttempts(db: Db, testId: string): Attempt[] {
  return db.select().from(testAttempts).where(eq(testAttempts.testId, testId)).orderBy(asc(testAttempts.startedAt), asc(testAttempts.createdAt)).all()
}

export function getAttempt(db: Db, id: string): Attempt {
  const row = db.select().from(testAttempts).where(eq(testAttempts.id, id)).get()
  if (!row) throw notFound('Attempt')
  return row
}

export interface SubmittedAnswer {
  questionId: string
  response: Response
  /** A grade the AI already gave while taking a quiz (open questions only). */
  grade?: { points: number; feedback?: string | null }
}

const sum = (answers: AttemptAnswer[]) => round2(answers.reduce((s, a) => s + a.points, 0))

/**
 * Store a finished run. Choice/number answers are graded here; open answers keep a grade the AI already gave
 * (quiz mode) or stay "pending" until applyGrades. Only the answered questions count towards max score,
 * so "retry mistakes" runs score against their own subset.
 */
export function submitAttempt(db: Db, testId: string, input: { startedAt: string; answers: SubmittedAnswer[] }): Attempt {
  parse(isoDateTime, input.startedAt)
  const qs = new Map(questionsOf(db, testId).map((q) => [q.id, q]))
  getTest(db, testId)
  const answers: AttemptAnswer[] = input.answers.map((a) => {
    const q = qs.get(a.questionId)
    if (!q) throw new AppError('VALIDATION', 'Answer for a question that is not part of this test')
    const auto = autoGrade(q, a.response ?? null)
    if (auto) return { questionId: q.id, response: a.response ?? null, ...auto, grading: 'auto' }
    if (a.grade) {
      const points = clampPoints(a.grade.points, q.points)
      return { questionId: q.id, response: a.response ?? null, points, correct: points === q.points, grading: 'ai', feedback: a.grade.feedback ?? null }
    }
    const empty = typeof a.response !== 'string' || !a.response.trim()
    return { questionId: q.id, response: a.response ?? null, points: 0, correct: false, grading: empty ? 'auto' : 'pending' }
  })
  const maxScore = round2(input.answers.reduce((s, a) => s + (qs.get(a.questionId)?.points ?? 0), 0))
  const t = nowIso()
  return db
    .insert(testAttempts)
    .values({ id: newId(), testId, mode: 'interactive', startedAt: input.startedAt, finishedAt: t, score: sum(answers), maxScore, answers, note: null, createdAt: t, updatedAt: t })
    .returning()
    .get()
}

/** Open answers still waiting for a grade, with what a grader needs. */
export function pendingAnswers(db: Db, attemptId: string): { questionId: string; prompt: string; modelAnswer: string; response: string; points: number }[] {
  const a = getAttempt(db, attemptId)
  const qs = new Map(questionsOf(db, a.testId).map((q) => [q.id, q]))
  return a.answers
    .filter((x) => x.grading === 'pending')
    .flatMap((x) => {
      const q = qs.get(x.questionId)
      if (!q || !('modelAnswer' in q.solution)) return []
      return [{ questionId: q.id, prompt: q.prompt, modelAnswer: q.solution.modelAnswer, response: String(x.response ?? ''), points: q.points }]
    })
}

function saveAnswers(db: Db, a: Attempt, answers: AttemptAnswer[]): Attempt {
  return db.update(testAttempts).set({ answers, score: sum(answers), updatedAt: nowIso() }).where(eq(testAttempts.id, a.id)).returning().get()
}

export function applyGrades(db: Db, attemptId: string, grades: { questionId: string; points: number; feedback?: string | null }[]): Attempt {
  const a = getAttempt(db, attemptId)
  const qs = new Map(questionsOf(db, a.testId).map((q) => [q.id, q]))
  const answers = a.answers.map((x) => {
    const g = grades.find((y) => y.questionId === x.questionId)
    const max = qs.get(x.questionId)?.points ?? 0
    if (!g || x.grading !== 'pending') return x
    const points = clampPoints(g.points, max)
    return { ...x, points, correct: points === max, grading: 'ai' as const, feedback: g.feedback ?? null }
  })
  return saveAnswers(db, a, answers)
}

export function overridePoints(db: Db, attemptId: string, questionId: string, points: number): Attempt {
  const a = getAttempt(db, attemptId)
  const q = questionsOf(db, a.testId).find((x) => x.id === questionId)
  if (!q || !a.answers.some((x) => x.questionId === questionId)) throw notFound('Answer')
  if (!(points >= 0 && points <= q.points)) throw new AppError('VALIDATION', `Points must be between 0 and ${q.points}`)
  const answers = a.answers.map((x) => (x.questionId === questionId ? { ...x, points: round2(points), correct: points === q.points, grading: 'manual' as const } : x))
  return saveAnswers(db, a, answers)
}

export const PaperInput = z
  .object({ date: dateStr, score: z.number().min(0), maxScore: z.number().positive(), note: z.string().trim().nullish() })
  .refine((v) => v.score <= v.maxScore, 'Score cannot be higher than the maximum')

/** A result written on paper (e.g. an old exam), without per-question answers. */
export function recordPaperAttempt(db: Db, testId: string, input: z.input<typeof PaperInput>): Attempt {
  const v = parse(PaperInput, input)
  getTest(db, testId)
  const t = nowIso()
  return db
    .insert(testAttempts)
    .values({ id: newId(), testId, mode: 'paper', startedAt: `${v.date}T12:00:00.000Z`, finishedAt: `${v.date}T12:00:00.000Z`, score: v.score, maxScore: v.maxScore, answers: [], note: v.note || null, createdAt: t, updatedAt: t })
    .returning()
    .get()
}

export function removeAttempt(db: Db, id: string): void {
  db.delete(testAttempts).where(eq(testAttempts.id, id)).run()
}
