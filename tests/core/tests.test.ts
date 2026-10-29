import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { autoGrade, gradeEstimate, normalizeQuestion, parseNumber, responseText, solutionText, toQuestionInput, type Question } from '@core/domain/tests'
import * as courses from '@core/repo/courses'
import * as files from '@core/repo/files'
import * as search from '@core/repo/search'
import * as tests from '@core/repo/tests'
import { runTool } from '@core/tools'
import { memDb } from '../helpers/db'
import { seedCourse } from '../helpers/fixtures'

let db: Db
let courseId: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db, 'Introduction to Machine Learning').id
})

const q = (over: Partial<Question>): Question =>
  ({ id: 'q', testId: 't', type: 'single', prompt: 'P', options: [], solution: { correct: [0] }, points: 2, explanation: null, sourcePageId: null, sortOrder: 0, ...over }) as Question

test('numbers are parsed with comma or dot decimals', () => {
  expect(parseNumber('0,5')).toBe(0.5)
  expect(parseNumber(' -1.25e-2 ')).toBe(-0.0125)
  expect(parseNumber('abc')).toBeNull()
  expect(parseNumber('')).toBeNull()
})

test('fractions are accepted as numbers', () => {
  expect(parseNumber('3/20')).toBe(0.15)
  expect(parseNumber(' -1 / 4 ')).toBe(-0.25)
  expect(parseNumber('1,5/3')).toBe(0.5)
  expect(parseNumber('1/0')).toBeNull()
  expect(parseNumber('1/2/3')).toBeNull()
  expect(autoGrade(q({ type: 'number', solution: { value: 0.15, tolerance: 0.001 } }), '3/20')).toEqual({ points: 2, correct: true })
})

test('auto grading: single, truefalse, number with tolerance', () => {
  const single = q({ type: 'single', options: ['a', 'b', 'c'], solution: { correct: [1] } })
  expect(autoGrade(single, 1)).toEqual({ points: 2, correct: true })
  expect(autoGrade(single, 0)).toEqual({ points: 0, correct: false })
  expect(autoGrade(single, null)).toEqual({ points: 0, correct: false })
  const tf = q({ type: 'truefalse', solution: { truth: false } })
  expect(autoGrade(tf, false)).toEqual({ points: 2, correct: true })
  expect(autoGrade(tf, true)?.correct).toBe(false)
  const num = q({ type: 'number', solution: { value: 0.322, tolerance: 0.005 } })
  expect(autoGrade(num, '0,32')).toEqual({ points: 2, correct: true })
  expect(autoGrade(num, '0.33')?.correct).toBe(false)
  const exact = q({ type: 'number', solution: { value: 36, tolerance: null } })
  expect(autoGrade(exact, '36')?.correct).toBe(true)
  expect(autoGrade(exact, '36.1')?.correct).toBe(false)
})

test('multiple choice gives partial credit and punishes wrong picks', () => {
  const m = q({ type: 'multiple', options: ['a', 'b', 'c', 'd'], solution: { correct: [0, 2] }, points: 4 })
  expect(autoGrade(m, [0, 2])).toEqual({ points: 4, correct: true })
  expect(autoGrade(m, [0])).toEqual({ points: 2, correct: false })
  expect(autoGrade(m, [0, 1])).toEqual({ points: 0, correct: false })
  expect(autoGrade(m, [1, 3])).toEqual({ points: 0, correct: false })
})

test('text answers are not auto-graded', () => {
  expect(autoGrade(q({ type: 'text', solution: { modelAnswer: 'x' } }), 'x')).toBeNull()
})

test('grade estimate on the German scale', () => {
  expect(gradeEstimate(100)).toBe(1.0)
  expect(gradeEstimate(95)).toBe(1.0)
  expect(gradeEstimate(90)).toBe(1.3)
  expect(gradeEstimate(72)).toBe(2.7)
  expect(gradeEstimate(50)).toBe(4.0)
  expect(gradeEstimate(49.9)).toBe(5.0)
})

test('question input is validated per type', () => {
  expect(normalizeQuestion({ type: 'single', prompt: 'Which?', options: ['a', 'b'], correct: [1] })).toMatchObject({ options: ['a', 'b'], solution: { correct: [1] }, points: 1 })
  expect(normalizeQuestion({ type: 'truefalse', prompt: 'True?', truth: true })).toMatchObject({ options: [], solution: { truth: true } })
  expect(normalizeQuestion({ type: 'number', prompt: 'H(A)?', value: 0.722, tolerance: 0.001, points: 2 })).toMatchObject({ solution: { value: 0.722, tolerance: 0.001 }, points: 2 })
  expect(normalizeQuestion({ type: 'text', prompt: 'Explain', modelAnswer: 'Because' })).toMatchObject({ solution: { modelAnswer: 'Because' } })
  expect(() => normalizeQuestion({ type: 'single', prompt: 'x', options: ['a', 'b'], correct: [0, 1] })).toThrow(/exactly one/i)
  expect(() => normalizeQuestion({ type: 'single', prompt: 'x', options: ['a'], correct: [0] })).toThrow(/two options/i)
  expect(() => normalizeQuestion({ type: 'multiple', prompt: 'x', options: ['a', 'b'], correct: [5] })).toThrow(/option/i)
  expect(() => normalizeQuestion({ type: 'truefalse', prompt: 'x' })).toThrow(/true or false/i)
  expect(() => normalizeQuestion({ type: 'number', prompt: 'x' })).toThrow(/value/i)
  expect(() => normalizeQuestion({ type: 'text', prompt: 'x' })).toThrow(/model answer/i)
  expect(() => normalizeQuestion({ type: 'text', prompt: ' ', modelAnswer: 'a' })).toThrow()
})

test('tests: create with questions, list with stats, update, remove question, delete', () => {
  const t = tests.create(db, {
    courseId,
    kind: 'quiz',
    title: 'Decision trees',
    questions: [
      { type: 'single', prompt: 'Which impurity is concave?', options: ['entropy', 'none'], correct: [0] },
      { type: 'number', prompt: 'Entropy of a 3:1 node?', value: 0.811, tolerance: 0.001, points: 2 }
    ]
  })
  expect(t).toMatchObject({ kind: 'quiz', title: 'Decision trees', timeLimitMin: null, fileIds: [] })
  const full = tests.get(db, t.id)
  expect(full.questions.map((x) => x.type)).toEqual(['single', 'number'])
  expect(tests.list(db, { courseId })).toEqual([expect.objectContaining({ id: t.id, questionCount: 2, maxPoints: 3, attemptCount: 0, lastPercent: null, bestPercent: null })])
  tests.addQuestions(db, t.id, [{ type: 'truefalse', prompt: 'ID3 prunes?', truth: false }])
  expect(tests.get(db, t.id).questions.at(-1)?.prompt).toBe('ID3 prunes?')
  expect(tests.update(db, t.id, { title: 'DT quiz', timeLimitMin: 15 })).toMatchObject({ title: 'DT quiz', timeLimitMin: 15 })
  tests.removeQuestion(db, full.questions[0].id)
  expect(tests.get(db, t.id).questions).toHaveLength(2)
  expect(() => tests.create(db, { courseId: 'nope', kind: 'quiz', title: 'x' })).toThrow(/course not found/i)
  tests.remove(db, t.id)
  expect(tests.list(db, { courseId })).toHaveLength(0)
})

test('exams link course files; unknown files are rejected, deleted files drop out', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'unios-exam-'))
  writeFileSync(join(dir, 'Klausur WS24.txt'), 'Aufgabe 1: Entropie')
  const [f] = await files.importFiles(db, join(dir, 'files'), courseId, [join(dir, 'Klausur WS24.txt')])
  const e = tests.create(db, { courseId, kind: 'exam', title: 'Exam WS 24/25', fileIds: [f.id], timeLimitMin: 90 })
  expect(e.fileIds).toEqual([f.id])
  expect(() => tests.create(db, { courseId, kind: 'exam', title: 'x', fileIds: ['missing'] })).toThrow(/file/i)
  files.deleteFile(db, join(dir, 'files'), f.id)
  expect(tests.get(db, e.id).fileIds).toEqual([])
})

test('attempts: auto grading on submit, pending text answers, AI grades, overrides, stats', () => {
  const t = tests.create(db, {
    courseId,
    kind: 'exam',
    title: 'Mock exam',
    questions: [
      { type: 'single', prompt: 'A?', options: ['x', 'y'], correct: [0], points: 2 },
      { type: 'multiple', prompt: 'B?', options: ['x', 'y', 'z'], correct: [0, 1], points: 2 },
      { type: 'text', prompt: 'Explain C', modelAnswer: 'C because D', points: 4 }
    ]
  })
  const [a, b, c] = tests.get(db, t.id).questions
  const at = tests.submitAttempt(db, t.id, {
    startedAt: '2026-10-24T10:00:00.000Z',
    answers: [
      { questionId: a.id, response: 0 },
      { questionId: b.id, response: [0] },
      { questionId: c.id, response: 'C because of D' }
    ]
  })
  expect(at).toMatchObject({ mode: 'interactive', maxScore: 8, score: 3 })
  expect(at.answers.map((x) => x.grading)).toEqual(['auto', 'auto', 'pending'])
  expect(tests.pendingAnswers(db, at.id)).toEqual([expect.objectContaining({ questionId: c.id, response: 'C because of D', modelAnswer: 'C because D', points: 4 })])

  const graded = tests.applyGrades(db, at.id, [{ questionId: c.id, points: 9, feedback: 'Good.' }])
  expect(graded.answers[2]).toMatchObject({ grading: 'ai', points: 4, feedback: 'Good.' })
  expect(graded.score).toBe(7)
  const overridden = tests.overridePoints(db, at.id, b.id, 2)
  expect(overridden.answers[1]).toMatchObject({ grading: 'manual', points: 2, correct: true })
  expect(overridden.score).toBe(8)
  expect(() => tests.overridePoints(db, at.id, b.id, 3)).toThrow(/between 0 and 2/)

  tests.recordPaperAttempt(db, t.id, { date: '2026-10-20', score: 4, maxScore: 8, note: 'on paper' })
  const s = tests.list(db, { courseId })[0]
  expect(s).toMatchObject({ attemptCount: 2, bestPercent: 100, lastPercent: 100 })
  expect(tests.listAttempts(db, t.id).map((x) => x.mode)).toEqual(['paper', 'interactive'])
  expect(() => tests.recordPaperAttempt(db, t.id, { date: '2026-10-20', score: 9, maxScore: 8 })).toThrow()
})

test('quiz answers can carry a grade already given by Check; a retry covers only some questions', () => {
  const t = tests.create(db, { courseId, kind: 'quiz', title: 'Q', questions: [{ type: 'text', prompt: 'Why?', modelAnswer: 'Because', points: 2 }, { type: 'truefalse', prompt: 'T?', truth: true }] })
  const [w] = tests.get(db, t.id).questions
  const at = tests.submitAttempt(db, t.id, { startedAt: '2026-10-24T10:00:00.000Z', answers: [{ questionId: w.id, response: 'Because', grade: { points: 1.5, feedback: 'Mostly right' } }] })
  expect(at).toMatchObject({ score: 1.5, maxScore: 2 })
  expect(at.answers[0]).toMatchObject({ grading: 'ai', correct: false, feedback: 'Mostly right' })
  expect(() => tests.submitAttempt(db, t.id, { startedAt: '2026-10-24T10:00:00.000Z', answers: [{ questionId: 'other', response: 1 }] })).toThrow(/question/i)
})

test('tests are searchable and disappear with their course', () => {
  tests.create(db, { courseId, kind: 'quiz', title: 'Backpropagation drill', questions: [{ type: 'text', prompt: 'Derive the delta rule', modelAnswer: 'chain rule' }] })
  expect(search.query(db, 'backpropagation')[0]).toMatchObject({ entityType: 'test', courseId })
  expect(search.query(db, 'delta rule')).toHaveLength(1)
  courses.remove(db, courseId)
  expect(search.query(db, 'backpropagation')).toHaveLength(0)
  expect(tests.list(db, {})).toHaveLength(0)
})

test('assistant tools: create_test, add_test_questions, list_tests, get_test, record_test_result, list_test_attempts', async () => {
  const ctx = { db, filesDir: '/tmp/none', now: () => new Date('2026-10-24T12:00:00Z') }
  const created = await runTool(ctx, 'create_test', {
    course_id: courseId,
    kind: 'exam',
    title: 'Mock exam Part III',
    time_limit_min: 60,
    questions: [
      { type: 'single', prompt: 'σ(0) = ?', options: ['0', '0.5', '1'], correct_options: [1], explanation: 'σ(0) = 1/(1+1)' },
      { type: 'number', prompt: 'One GD step', number_answer: 0.4, tolerance: 0.01, points: 2 },
      { type: 'text', prompt: 'Why regularise?', model_answer: 'To reduce overfitting', points: 3 }
    ]
  })
  expect(created.ok, JSON.stringify(created)).toBe(true)
  const testId = (created as { result: { id: string } }).result.id
  expect((await runTool(ctx, 'add_test_questions', { test_id: testId, questions: [{ type: 'truefalse', prompt: 'L1 gives sparse weights', true_false: true }] })).ok).toBe(true)
  const listed = await runTool(ctx, 'list_tests', { course_id: courseId })
  expect(listed.ok && listed.result).toEqual([expect.objectContaining({ title: 'Mock exam Part III', kind: 'exam', questions: 4, max_points: 7 })])
  const got = await runTool(ctx, 'get_test', { test_id: testId })
  expect(got.ok && (got.result as { questions: { correct_options?: number[] }[] }).questions[0].correct_options).toEqual([1])
  expect((await runTool(ctx, 'record_test_result', { test_id: testId, date: '2026-10-23', score: 5, max_score: 7 })).ok).toBe(true)
  const att = await runTool(ctx, 'list_test_attempts', { test_id: testId })
  expect(att.ok && att.result).toEqual([expect.objectContaining({ mode: 'paper', score: 5, max_score: 7 })])
  const bad = await runTool(ctx, 'create_test', { course_id: courseId, kind: 'quiz', title: 'x', questions: [{ type: 'single', prompt: 'p', options: ['a', 'b'] }] })
  expect(bad.ok).toBe(false)
})

test('generated proposals round-trip into input shape; answers and solutions read as text', () => {
  const n = normalizeQuestion({ type: 'multiple', prompt: 'Pick', options: ['a', 'b', 'c'], correct: [0, 2], points: 2, explanation: 'e' })
  expect(normalizeQuestion(toQuestionInput(n))).toEqual(n)
  const num = normalizeQuestion({ type: 'number', prompt: 'n', value: 0.5, tolerance: 0.01 })
  expect(normalizeQuestion(toQuestionInput(num))).toEqual(num)
  expect(solutionText(n)).toBe('a · c')
  expect(solutionText(num)).toBe('0.5 (± 0.01)')
  expect(responseText(n, [1])).toBe('b')
  expect(responseText(n, [])).toBe('—')
  expect(responseText({ type: 'truefalse', options: [] }, false)).toBe('False')
  expect(responseText({ type: 'number', options: [] }, '3/20')).toBe('3/20 (= 0.15)')
  expect(responseText({ type: 'number', options: [] }, '0,15')).toBe('0,15')
})

test('unknown, foreign or trashed source pages are dropped instead of failing the whole test', async () => {
  const pages = await import('@core/repo/pages')
  const own = pages.create(db, { courseId, title: 'Entropy' })
  const trashed = pages.create(db, { courseId, title: 'Old' })
  pages.trash(db, trashed.id)
  const other = pages.create(db, { courseId: seedCourse(db, 'VR').id, title: 'Scene graphs' })
  const t = tests.create(db, {
    courseId,
    kind: 'quiz',
    title: 'Q',
    questions: [
      { type: 'truefalse', prompt: 'a', truth: true, sourcePageId: own.id },
      { type: 'truefalse', prompt: 'b', truth: true, sourcePageId: 'made-up' },
      { type: 'truefalse', prompt: 'c', truth: true, sourcePageId: other.id },
      { type: 'truefalse', prompt: 'd', truth: true, sourcePageId: trashed.id }
    ]
  })
  expect(tests.get(db, t.id).questions.map((q) => q.sourcePageId)).toEqual([own.id, null, null, null])
  tests.addQuestions(db, t.id, [{ type: 'truefalse', prompt: 'e', truth: false, sourcePageId: 'nope' }])
  expect(tests.get(db, t.id).questions.at(-1)?.sourcePageId).toBeNull()
})

test('deleting a question settles its pending answers so attempts do not wait forever', () => {
  const t = tests.create(db, { courseId, kind: 'exam', title: 'E', questions: [{ type: 'text', prompt: 'Why?', modelAnswer: 'x', points: 2 }, { type: 'truefalse', prompt: 'T?', truth: true }] })
  const [w, tf] = tests.get(db, t.id).questions
  const at = tests.submitAttempt(db, t.id, { startedAt: '2026-10-24T10:00:00.000Z', answers: [{ questionId: w.id, response: 'because' }, { questionId: tf.id, response: true }] })
  expect(at.answers[0].grading).toBe('pending')
  tests.removeQuestion(db, w.id)
  const after = tests.getAttempt(db, at.id)
  expect(after.answers[0]).toMatchObject({ grading: 'auto', points: 0, correct: false })
  expect(tests.pendingAnswers(db, at.id)).toEqual([])
})

test('answers auto-graded by an older version are re-checked with the current rules; manual and AI grades stay', async () => {
  const { testAttempts } = await import('@core/db/schema')
  const { eq } = await import('drizzle-orm')
  const t = tests.create(db, {
    courseId,
    kind: 'exam',
    title: 'Quiz 1 · Mock',
    questions: [
      { type: 'number', prompt: 'Units per frame?', value: 0.15, tolerance: 0.001, points: 1 },
      { type: 'single', prompt: 'A?', options: ['x', 'y'], correct: [0], points: 2 },
      { type: 'truefalse', prompt: 'B?', truth: true, points: 1 }
    ]
  })
  const [n, s, tf] = tests.get(db, t.id).questions
  const at = tests.submitAttempt(db, t.id, {
    startedAt: '2026-10-29T10:00:00.000Z',
    answers: [
      { questionId: n.id, response: '3/20' },
      { questionId: s.id, response: 1 },
      { questionId: tf.id, response: true }
    ]
  })
  // As stored by a version that did not understand fractions:
  const old = at.answers.map((x) => (x.questionId === n.id ? { ...x, points: 0, correct: false } : x))
  db.update(testAttempts).set({ answers: old, score: 1 }).where(eq(testAttempts.id, at.id)).run()
  tests.overridePoints(db, at.id, s.id, 1)

  expect(tests.refreshAutoGrades(db, t.id)).toBe(1)
  const [after] = tests.listAttempts(db, t.id)
  expect(after.answers.map((x) => [x.points, x.correct, x.grading])).toEqual([
    [1, true, 'auto'],
    [1, false, 'manual'],
    [1, true, 'auto']
  ])
  expect(after.score).toBe(3)
  expect(tests.refreshAutoGrades(db, t.id)).toBe(0)
})

test('attempt report: points per topic (weakest first), per question type, and what the next grade needs', async () => {
  const pages = await import('@core/repo/pages')
  const graphs = pages.create(db, { courseId, title: 'Scene graphs' })
  const unity = pages.create(db, { courseId, title: 'Unity basics' })
  const t = tests.create(db, {
    courseId,
    kind: 'exam',
    title: 'Mock',
    questions: [
      { type: 'truefalse', prompt: 'a', truth: true, points: 4, sourcePageId: graphs.id },
      { type: 'truefalse', prompt: 'b', truth: true, points: 4, sourcePageId: graphs.id },
      { type: 'single', prompt: 'c', options: ['x', 'y'], correct: [0], points: 6, sourcePageId: unity.id },
      { type: 'number', prompt: 'd', value: 2, points: 6 }
    ]
  })
  const [a, b, c, d] = tests.get(db, t.id).questions
  const at = tests.submitAttempt(db, t.id, {
    startedAt: '2026-10-29T10:00:00.000Z',
    answers: [
      { questionId: a.id, response: true },
      { questionId: b.id, response: false },
      { questionId: c.id, response: 0 },
      { questionId: d.id, response: '3' }
    ]
  })
  expect(at.score).toBe(10)
  const r = tests.attemptReport(db, at.id)
  expect(r.topics).toEqual([
    { pageId: null, title: 'Other', points: 0, maxPoints: 6, questions: 1, mistakes: 1 },
    { pageId: graphs.id, title: 'Scene graphs', points: 4, maxPoints: 8, questions: 2, mistakes: 1 },
    { pageId: unity.id, title: 'Unity basics', points: 6, maxPoints: 6, questions: 1, mistakes: 0 }
  ])
  expect(r.types).toEqual([
    { type: 'single', points: 6, maxPoints: 6, questions: 1 },
    { type: 'truefalse', points: 4, maxPoints: 8, questions: 2 },
    { type: 'number', points: 0, maxPoints: 6, questions: 1 }
  ])
  // 10/20 = 50 % → 4.0; 55 % (11 pts) gives 3.7
  expect(r.nextGrade).toEqual({ grade: 3.7, pointsNeeded: 1 })
})
