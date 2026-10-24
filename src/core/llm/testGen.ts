import { z } from 'zod'
import type { Db } from '../db/open'
import { clampPoints, normalizeQuestion, TYPE_LABEL, type NormalizedQuestion, type QuestionType, type TestKind } from '../domain/tests'
import { blocksToMarkdown } from '../domain/markdown'
import { AppError } from '../errors'
import * as files from '../repo/files'
import * as pages from '../repo/pages'
import { fromWire, WireQuestion } from '../tools/tests'
import type { ToolSpec } from '../tools'
import type { LlmAdapter } from './loop'

const MAX_MATERIAL = 80_000

const schemaOf = (s: z.ZodType): Record<string, unknown> => {
  const { $schema: _s, ...rest } = z.toJSONSchema(s, { io: 'input' }) as Record<string, unknown>
  return rest
}

/** Course pages and file texts the questions should be based on, as one Markdown document. */
export async function buildMaterial(db: Db, input: { courseId: string; pageIds: string[]; fileIds: string[] }): Promise<{ text: string; pages: { id: string; title: string }[] }> {
  const parts: string[] = []
  const used: { id: string; title: string }[] = []
  for (const id of input.pageIds) {
    const p = pages.get(db, id)
    if (p.courseId !== input.courseId) continue
    const md = (await blocksToMarkdown(JSON.parse(p.content) as unknown[])).trim()
    if (!md) continue
    parts.push(`# ${p.title || 'Untitled'}\n(page id: ${p.id})\n\n${md}`)
    used.push({ id: p.id, title: p.title })
  }
  for (const id of input.fileIds) {
    const f = files.get(db, id)
    if (f.courseId !== input.courseId || !f.text?.trim()) continue
    parts.push(`# File: ${f.name}\n\n${f.text.trim()}`)
  }
  const text = parts.join('\n\n---\n\n')
  if (!text.trim()) throw new AppError('VALIDATION', 'The selected pages and files are empty. Choose material with text.')
  return { text: text.length > MAX_MATERIAL ? `${text.slice(0, MAX_MATERIAL)}\n\n[… material truncated]` : text, pages: used }
}

const PROPOSE: ToolSpec = {
  name: 'propose_questions',
  description: 'Return the proposed test questions.',
  mutates: false,
  inputSchema: schemaOf(z.object({ title: z.string().describe('Short title for the quiz or exam'), questions: z.array(WireQuestion) }))
}

export interface GenerateOptions {
  material: string
  pages: { id: string; title: string }[]
  kind: TestKind
  count: number
  types: QuestionType[]
  focus?: string
}

/** One model turn that turns course material into question proposals (validated, not saved). */
export async function generateQuestions(
  adapter: LlmAdapter<unknown>,
  o: GenerateOptions
): Promise<{ title: string; questions: NormalizedQuestion[]; dropped: number }> {
  const kindText =
    o.kind === 'quiz'
      ? 'a short practice quiz: each question tests one concept, the student sees the solution right after answering'
      : 'a realistic mock exam: exam-style tasks of varying difficulty, including calculations and explanations where the material allows; give harder tasks more points'
  const prompt = `Write ${o.count} questions for ${kindText}, based only on the course material below.
Allowed question types: ${o.types.map((t) => `${t} (${TYPE_LABEL[t]})`).join(', ')}. Mix them sensibly.
Rules:
- Every question must be answerable from the material; never invent facts.
- Choice questions: 3–5 plausible options, distractors that reflect typical misconceptions.
- Number questions: a concrete calculation with a single numeric result; set a tolerance that fits the rounding you expect.
- Open (text) questions: a complete model answer the grader can compare against.
- Add a short explanation to every question and the page id it is based on (source_page_id) when it comes from a page.
- Use the language of the material. Markdown and $LaTeX$ are allowed.${o.focus?.trim() ? `\n- Focus: ${o.focus.trim()}` : ''}
Call propose_questions with a title and all ${o.count} questions.

${o.material}`
  const turn = await adapter.turn([adapter.user(prompt)], { system: 'You write precise, fair university exam questions.', tools: [PROPOSE], onText: () => {} })
  const call = turn.toolCalls.find((c) => c.name === PROPOSE.name)
  const raw = call?.input as { title?: unknown; questions?: unknown } | undefined
  if (!call) throw new AppError('INTERNAL', turn.stop === 'refusal' ? (turn.note ?? 'The model declined.') : 'The model did not return any questions. Try again.')
  const known = new Set(o.pages.map((p) => p.id))
  const questions: NormalizedQuestion[] = []
  let dropped = 0
  for (const item of Array.isArray(raw?.questions) ? raw.questions : []) {
    const w = WireQuestion.safeParse(item)
    if (!w.success) {
      dropped++
      continue
    }
    try {
      const q = normalizeQuestion(fromWire(w.data))
      questions.push({ ...q, sourcePageId: q.sourcePageId && known.has(q.sourcePageId) ? q.sourcePageId : null })
    } catch {
      dropped++
    }
  }
  if (!questions.length) throw new AppError('INTERNAL', 'The model returned no usable questions. Try again or choose other material.')
  const title = typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : o.kind === 'quiz' ? 'Quiz' : 'Mock exam'
  return { title, questions, dropped }
}

const GRADE: ToolSpec = {
  name: 'grade_answers',
  description: 'Return a grade for every answer.',
  mutates: false,
  inputSchema: schemaOf(
    z.object({
      grades: z.array(z.object({ index: z.number().int().min(0), points: z.number().min(0), feedback: z.string().describe('1–3 sentences: what is right, what is missing or wrong') }))
    })
  )
}

export interface OpenAnswer {
  questionId: string
  prompt: string
  modelAnswer: string
  response: string
  points: number
}

/** Grade open answers against their model answers in one model turn. */
export async function gradeOpenAnswers(adapter: LlmAdapter<unknown>, items: OpenAnswer[]): Promise<{ questionId: string; points: number; feedback: string }[]> {
  if (!items.length) return []
  const blocks = items
    .map((a, i) => `## Answer ${i}\nQuestion (${a.points} points): ${a.prompt}\n\nModel answer: ${a.modelAnswer}\n\nStudent answer: ${a.response.trim() || '(empty)'}`)
    .join('\n\n')
  const prompt = `Grade these student answers like a fair university examiner. Compare each with its model answer: give full points for a correct and complete answer (other wording or an equivalent approach is fine), partial points in steps of 0.5 for partly correct answers, 0 for wrong or empty ones. Write short feedback in the language of the student's answer. Call grade_answers with one grade per answer (index = answer number).\n\n${blocks}`
  const turn = await adapter.turn([adapter.user(prompt)], { system: 'You grade exam answers accurately and kindly.', tools: [GRADE], onText: () => {} })
  const raw = turn.toolCalls.find((c) => c.name === GRADE.name)?.input as { grades?: { index?: unknown; points?: unknown; feedback?: unknown }[] } | undefined
  if (!Array.isArray(raw?.grades)) throw new AppError('INTERNAL', turn.stop === 'refusal' ? (turn.note ?? 'The model declined.') : 'The model did not return grades. Try again.')
  return items.flatMap((a, i) => {
    const g = raw.grades!.find((x) => x.index === i)
    if (!g || typeof g.points !== 'number') return []
    return [{ questionId: a.questionId, points: clampPoints(g.points, a.points), feedback: typeof g.feedback === 'string' ? g.feedback : '' }]
  })
}
