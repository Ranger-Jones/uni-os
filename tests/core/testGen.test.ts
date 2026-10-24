import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import type { LlmAdapter, TurnResult } from '@core/llm/loop'
import { buildMaterial, generateQuestions, gradeOpenAnswers } from '@core/llm/testGen'
import * as pages from '@core/repo/pages'
import type { ToolSpec } from '@core/tools'
import { memDb } from '../helpers/db'
import { para, seedCourse } from '../helpers/fixtures'

type M = { role: string; content: unknown }
/** Adapter that answers every turn with one tool call and records what it was asked. */
function scripted(name: string, input: unknown) {
  const seen: { prompt: string; tools: ToolSpec[] }[] = []
  const adapter: LlmAdapter<M> = {
    user: (text) => ({ role: 'user', content: text }),
    toolResults: () => [],
    async turn(history, opts): Promise<TurnResult<M>> {
      seen.push({ prompt: String(history.at(-1)?.content), tools: opts.tools })
      return { messages: [], toolCalls: [{ id: 'c1', name, input }], stop: 'tool_use' }
    }
  }
  return { adapter, seen }
}

let db: Db
let courseId: string
beforeEach(() => {
  db = memDb().db
  courseId = seedCourse(db, 'ML').id
})

test('material combines the chosen pages of the course', async () => {
  const p = pages.create(db, { courseId, title: 'Entropy' })
  pages.updateContent(db, p.id, [para('Entropy measures impurity.')])
  const other = pages.create(db, { courseId, title: 'Gini' })
  const m = await buildMaterial(db, { courseId, pageIds: [p.id], fileIds: [] })
  expect(m.text).toContain('# Entropy')
  expect(m.text).toContain('Entropy measures impurity.')
  expect(m.text).not.toContain('Gini')
  expect(m.pages).toEqual([{ id: p.id, title: 'Entropy' }])
  await expect(buildMaterial(db, { courseId, pageIds: [other.id], fileIds: [] })).rejects.toThrow(/empty/i)
})

test('generation keeps valid questions, drops invalid ones and keeps source page ids it knows', async () => {
  const { adapter, seen } = scripted('propose_questions', {
    title: 'Entropy quiz',
    questions: [
      { type: 'single', prompt: 'Max entropy of 2 classes?', options: ['0.5', '1', '2'], correct_options: [1], source_page_id: 'p1' },
      { type: 'single', prompt: 'Broken', options: ['a', 'b'] },
      { type: 'text', prompt: 'Why log base 2?', model_answer: 'Bits.', points: 2, source_page_id: 'invented' }
    ]
  })
  const r = await generateQuestions(adapter, { material: '# Entropy\n...', pages: [{ id: 'p1', title: 'Entropy' }], kind: 'quiz', count: 3, types: ['single', 'text'], focus: 'formulas' })
  expect(r.title).toBe('Entropy quiz')
  expect(r.questions.map((q) => q.prompt)).toEqual(['Max entropy of 2 classes?', 'Why log base 2?'])
  expect(r.questions[0].sourcePageId).toBe('p1')
  expect(r.questions[1].sourcePageId).toBeNull()
  expect(r.dropped).toBe(1)
  expect(seen[0].prompt).toMatch(/3 questions/)
  expect(seen[0].prompt).toMatch(/formulas/)
  expect(seen[0].tools[0].name).toBe('propose_questions')
})

test('generation fails clearly when the model returns nothing usable', async () => {
  const { adapter } = scripted('propose_questions', { questions: [] })
  await expect(generateQuestions(adapter, { material: 'x', pages: [], kind: 'exam', count: 5, types: ['text'] })).rejects.toThrow(/no usable questions/i)
})

test('open answers are graded with points clamped to the maximum and half steps', async () => {
  const { adapter, seen } = scripted('grade_answers', {
    grades: [
      { index: 0, points: 1.3, feedback: 'Partly right.' },
      { index: 1, points: 7, feedback: 'Excellent.' }
    ]
  })
  const r = await gradeOpenAnswers(adapter, [
    { questionId: 'a', prompt: 'Explain overfitting', modelAnswer: 'Fits noise', response: 'Too complex', points: 2 },
    { questionId: 'b', prompt: 'Derive', modelAnswer: 'Chain rule', response: 'Chain rule applied', points: 4 }
  ])
  expect(r).toEqual([
    { questionId: 'a', points: 1.5, feedback: 'Partly right.' },
    { questionId: 'b', points: 4, feedback: 'Excellent.' }
  ])
  expect(seen[0].prompt).toContain('Too complex')
  expect(await gradeOpenAnswers(adapter, [])).toEqual([])
})
