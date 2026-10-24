import { z } from 'zod'
import { QUESTION_TYPES, TEST_KINDS, type Question, type QuestionInput } from '../domain/tests'
import * as tests from '../repo/tests'
import { defineTool, id } from './define'

/** Question format for models (snake_case, one flat object for every type). */
export const WireQuestion = z.object({
  type: z.enum(QUESTION_TYPES).describe('single = one correct option, multiple = one or more correct options, truefalse, number = numeric result, text = open answer graded against model_answer'),
  prompt: z.string().min(1).describe('The question. Markdown and $LaTeX$ are allowed.'),
  options: z.array(z.string()).max(10).optional().describe('Answer options (single/multiple only), 2–6 plausible options'),
  correct_options: z.array(z.number().int().min(0)).optional().describe('0-based indices of the correct options (single: exactly one)'),
  true_false: z.boolean().optional().describe('truefalse only: whether the statement is true'),
  number_answer: z.number().optional().describe('number only: the correct value'),
  tolerance: z.number().min(0).optional().describe('number only: accepted absolute deviation, e.g. 0.005 for answers rounded to 2 decimals'),
  model_answer: z.string().optional().describe('text only: a complete model answer the grader compares against'),
  points: z.number().positive().max(100).optional().describe('Points, default 1; give harder questions more'),
  explanation: z.string().optional().describe('Why the answer is right, shown after answering'),
  source_page_id: z.string().optional().describe('Wiki page the question is based on')
})
export type WireQuestion = z.infer<typeof WireQuestion>

export const fromWire = (q: WireQuestion): QuestionInput => ({
  type: q.type,
  prompt: q.prompt,
  options: q.options,
  correct: q.correct_options,
  truth: q.true_false,
  value: q.number_answer,
  tolerance: q.tolerance,
  modelAnswer: q.model_answer,
  points: q.points,
  explanation: q.explanation,
  sourcePageId: q.source_page_id
})

export function toWire(q: Question): WireQuestion & { id: string } {
  const s = q.solution
  return {
    id: q.id,
    type: q.type,
    prompt: q.prompt,
    ...(q.options.length ? { options: q.options } : {}),
    ...('correct' in s ? { correct_options: s.correct } : {}),
    ...('truth' in s ? { true_false: s.truth } : {}),
    ...('value' in s ? { number_answer: s.value, ...(s.tolerance !== null ? { tolerance: s.tolerance } : {}) } : {}),
    ...('modelAnswer' in s ? { model_answer: s.modelAnswer } : {}),
    points: q.points,
    ...(q.explanation ? { explanation: q.explanation } : {}),
    ...(q.sourcePageId ? { source_page_id: q.sourcePageId } : {})
  }
}

const summary = (t: tests.TestSummary) => ({
  id: t.id,
  kind: t.kind,
  title: t.title,
  questions: t.questionCount,
  max_points: t.maxPoints,
  time_limit_min: t.timeLimitMin,
  attempts: t.attemptCount,
  last_percent: t.lastPercent,
  best_percent: t.bestPercent
})

export const testTools = [
  defineTool({
    name: 'list_tests',
    description: 'List the quizzes and test exams (mock exams, old exams) of a course with question count, points and results so far.',
    input: z.object({ course_id: id('Course') }),
    mutates: false,
    run: ({ db }, i) => tests.list(db, { courseId: i.course_id }).map(summary)
  }),
  defineTool({
    name: 'get_test',
    description: 'Get a quiz or test exam with all questions and their solutions.',
    input: z.object({ test_id: id('Test') }),
    mutates: false,
    run: ({ db }, i) => {
      const t = tests.get(db, i.test_id)
      return { id: t.id, kind: t.kind, title: t.title, description: t.description, time_limit_min: t.timeLimitMin, file_ids: t.fileIds, questions: t.questions.map(toWire) }
    }
  }),
  defineTool({
    name: 'create_test',
    description:
      'Create a quiz (short, feedback after each question) or a test exam (mock exam with points and an optional time limit) in a course, usually with questions. Mix question types; prefer choice/number questions for facts and calculations and text questions for explanations and derivations. Base questions on the course material and link the source page.',
    input: z.object({
      course_id: id('Course'),
      kind: z.enum(TEST_KINDS),
      title: z.string().min(1),
      description: z.string().optional(),
      time_limit_min: z.number().int().positive().max(600).optional().describe('Exams only'),
      file_ids: z.array(z.string()).optional().describe('Course files to attach, e.g. an old exam PDF and its solution'),
      questions: z.array(WireQuestion).max(100).optional()
    }),
    mutates: true,
    run: ({ db }, i) => {
      const t = tests.create(db, {
        courseId: i.course_id,
        kind: i.kind,
        title: i.title,
        description: i.description,
        timeLimitMin: i.time_limit_min,
        fileIds: i.file_ids,
        questions: (i.questions ?? []).map(fromWire)
      })
      return summary(tests.list(db, { courseId: t.courseId }).find((x) => x.id === t.id)!)
    }
  }),
  defineTool({
    name: 'add_test_questions',
    description: 'Add questions to an existing quiz or test exam.',
    input: z.object({ test_id: id('Test'), questions: z.array(WireQuestion).min(1).max(100) }),
    mutates: true,
    run: ({ db }, i) => ({ added: tests.addQuestions(db, i.test_id, i.questions.map(fromWire)).length })
  }),
  defineTool({
    name: 'update_test',
    description: 'Change the title, description, time limit or attached files of a quiz or test exam.',
    input: z.object({
      test_id: id('Test'),
      title: z.string().optional(),
      description: z.string().optional(),
      time_limit_min: z.number().int().positive().max(600).nullable().optional(),
      file_ids: z.array(z.string()).optional()
    }),
    mutates: true,
    run: ({ db }, i) => {
      const t = tests.update(db, i.test_id, { title: i.title, description: i.description, timeLimitMin: i.time_limit_min, fileIds: i.file_ids })
      return { id: t.id, title: t.title }
    }
  }),
  defineTool({
    name: 'list_test_attempts',
    description: 'Results of a quiz or test exam: every attempt with score, maximum, date and the questions answered wrongly.',
    input: z.object({ test_id: id('Test') }),
    mutates: false,
    run: ({ db }, i) =>
      tests.listAttempts(db, i.test_id).map((a) => ({
        id: a.id,
        mode: a.mode,
        date: a.finishedAt ?? a.startedAt,
        score: a.score,
        max_score: a.maxScore,
        note: a.note,
        wrong_question_ids: a.answers.filter((x) => !x.correct).map((x) => x.questionId)
      }))
  }),
  defineTool({
    name: 'record_test_result',
    description: 'Record a result written on paper for a test exam (e.g. an old exam done by hand): date, points reached and maximum points.',
    input: z.object({ test_id: id('Test'), date: z.string().describe('YYYY-MM-DD'), score: z.number().min(0), max_score: z.number().positive(), note: z.string().optional() }),
    mutates: true,
    run: ({ db }, i) => {
      const a = tests.recordPaperAttempt(db, i.test_id, { date: i.date, score: i.score, maxScore: i.max_score, note: i.note })
      return { id: a.id, score: a.score, max_score: a.maxScore }
    }
  })
]
