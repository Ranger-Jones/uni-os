import { z } from 'zod'
import { AppError } from '../errors'

export const QUESTION_TYPES = ['single', 'multiple', 'truefalse', 'number', 'text'] as const
export type QuestionType = (typeof QUESTION_TYPES)[number]
export const TEST_KINDS = ['quiz', 'exam'] as const
export type TestKind = (typeof TEST_KINDS)[number]

export type Solution = { correct: number[] } | { truth: boolean } | { value: number; tolerance: number | null } | { modelAnswer: string }

export interface Question {
  id: string
  testId: string
  type: QuestionType
  prompt: string
  options: string[]
  solution: Solution
  points: number
  explanation: string | null
  sourcePageId: string | null
  sortOrder: number
}

/** single/multiple: option index(es); truefalse: boolean; number/text: the typed text. */
export type Response = number | number[] | boolean | string | null

export const QuestionInput = z.object({
  type: z.enum(QUESTION_TYPES),
  prompt: z.string().trim().min(1, 'The question text must not be empty'),
  options: z.array(z.string().trim().min(1)).max(10).optional(),
  correct: z.array(z.number().int().min(0)).optional(),
  truth: z.boolean().optional(),
  value: z.number().finite().optional(),
  tolerance: z.number().min(0).nullish(),
  modelAnswer: z.string().trim().optional(),
  points: z.number().positive().max(100).optional(),
  explanation: z.string().trim().nullish(),
  sourcePageId: z.string().nullish()
})
export type QuestionInput = z.input<typeof QuestionInput>

export type NormalizedQuestion = Pick<Question, 'type' | 'prompt' | 'options' | 'solution' | 'points' | 'explanation' | 'sourcePageId'>

const invalid = (msg: string) => new AppError('VALIDATION', msg)

/** Validate a question for its type and bring it into storage shape. */
export function normalizeQuestion(input: QuestionInput): NormalizedQuestion {
  const r = QuestionInput.safeParse(input)
  if (!r.success) throw invalid(r.error.issues.map((i) => `${i.path.join('.') || 'question'}: ${i.message}`).join('; '))
  const v = r.data
  const base = { type: v.type, prompt: v.prompt, points: v.points ?? 1, explanation: v.explanation || null, sourcePageId: v.sourcePageId ?? null }
  switch (v.type) {
    case 'single':
    case 'multiple': {
      const options = v.options ?? []
      if (options.length < 2) throw invalid(`"${v.prompt.slice(0, 40)}": a choice question needs at least two options`)
      const correct = [...new Set(v.correct ?? [])].sort((a, b) => a - b)
      if (correct.some((i) => i >= options.length)) throw invalid(`"${v.prompt.slice(0, 40)}": correct option index out of range`)
      if (v.type === 'single' && correct.length !== 1) throw invalid(`"${v.prompt.slice(0, 40)}": a single-choice question needs exactly one correct option`)
      if (v.type === 'multiple' && correct.length === 0) throw invalid(`"${v.prompt.slice(0, 40)}": mark at least one correct option`)
      return { ...base, options, solution: { correct } }
    }
    case 'truefalse':
      if (v.truth === undefined) throw invalid(`"${v.prompt.slice(0, 40)}": say whether the statement is true or false`)
      return { ...base, options: [], solution: { truth: v.truth } }
    case 'number':
      if (v.value === undefined) throw invalid(`"${v.prompt.slice(0, 40)}": a number question needs the correct value`)
      return { ...base, options: [], solution: { value: v.value, tolerance: v.tolerance ?? null } }
    case 'text':
      if (!v.modelAnswer) throw invalid(`"${v.prompt.slice(0, 40)}": an open question needs a model answer`)
      return { ...base, options: [], solution: { modelAnswer: v.modelAnswer } }
  }
}

/** Parse "0,5", "0.5", "-1.2e-3"; null for anything else. */
export function parseNumber(text: string): number | null {
  const t = text.trim().replace(/\s/g, '').replace(',', '.')
  if (!t || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(t)) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** Grade a response automatically; null for open (text) questions, which need a human or the AI. */
export function autoGrade(q: Question, response: Response): { points: number; correct: boolean } | null {
  const full = { points: q.points, correct: true }
  const none = { points: 0, correct: false }
  const s = q.solution
  switch (q.type) {
    case 'single':
      return typeof response === 'number' && 'correct' in s && s.correct[0] === response ? full : none
    case 'multiple': {
      if (!Array.isArray(response) || !('correct' in s)) return none
      const picked = new Set(response)
      const hits = s.correct.filter((i) => picked.has(i)).length
      const wrong = [...picked].filter((i) => !s.correct.includes(i)).length
      if (hits === s.correct.length && wrong === 0) return full
      return { points: round2((Math.max(0, hits - wrong) / s.correct.length) * q.points), correct: false }
    }
    case 'truefalse':
      return typeof response === 'boolean' && 'truth' in s && s.truth === response ? full : none
    case 'number': {
      if (typeof response !== 'string' || !('value' in s)) return none
      const n = parseNumber(response)
      if (n === null) return none
      const tol = s.tolerance ?? 1e-6 * Math.max(1, Math.abs(s.value))
      return Math.abs(n - s.value) <= tol + 1e-12 ? full : none
    }
    case 'text':
      return null
  }
}

/** Grade estimate on the German 1.0–5.0 scale: 50 % → 4.0, every further 5 % one step, ≥ 95 % → 1.0. */
export function gradeEstimate(percent: number): number {
  const steps = [1.0, 1.3, 1.7, 2.0, 2.3, 2.7, 3.0, 3.3, 3.7, 4.0]
  if (percent < 50) return 5.0
  if (percent >= 95) return 1.0
  return steps[Math.min(9, Math.ceil((95 - percent) / 5 - 1e-9))]
}

export const percentOf = (score: number, max: number): number | null => (max > 0 ? round2((score / max) * 100) : null)

/** Snap an AI-given score to 0.5 steps within [0, max]. */
export const clampPoints = (points: number, max: number): number => Math.min(max, Math.max(0, Math.round(points * 2) / 2))

export const TYPE_LABEL: Record<QuestionType, string> = {
  single: 'Single choice',
  multiple: 'Multiple choice',
  truefalse: 'True / false',
  number: 'Number',
  text: 'Open answer'
}

/** Back from storage shape to input shape (e.g. to save generated proposals). */
export function toQuestionInput(q: NormalizedQuestion): QuestionInput {
  const s = q.solution
  return {
    type: q.type,
    prompt: q.prompt,
    options: q.options.length ? q.options : undefined,
    ...('correct' in s ? { correct: s.correct } : {}),
    ...('truth' in s ? { truth: s.truth } : {}),
    ...('value' in s ? { value: s.value, tolerance: s.tolerance } : {}),
    ...('modelAnswer' in s ? { modelAnswer: s.modelAnswer } : {}),
    points: q.points,
    explanation: q.explanation,
    sourcePageId: q.sourcePageId
  }
}

/** The correct answer in words, for result views. */
export function solutionText(q: Pick<Question, 'type' | 'options' | 'solution'>): string {
  const s = q.solution
  if ('correct' in s) return s.correct.map((i) => q.options[i] ?? `#${i + 1}`).join(' · ')
  if ('truth' in s) return s.truth ? 'True' : 'False'
  if ('value' in s) return s.tolerance ? `${s.value} (± ${s.tolerance})` : String(s.value)
  return s.modelAnswer
}

/** A response in words, for result views. */
export function responseText(q: Pick<Question, 'type' | 'options'>, r: Response): string {
  if (r === null || r === undefined || (typeof r === 'string' && !r.trim()) || (Array.isArray(r) && !r.length)) return '—'
  if (q.type === 'single' && typeof r === 'number') return q.options[r] ?? '—'
  if (q.type === 'multiple' && Array.isArray(r)) return r.map((i) => q.options[i] ?? `#${i + 1}`).join(' · ')
  if (typeof r === 'boolean') return r ? 'True' : 'False'
  return String(r)
}
