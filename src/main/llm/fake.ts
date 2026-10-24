import type { LlmAdapter, TurnResult } from '@core/llm/loop'

type M = { role: 'user' | 'assistant' | 'tool'; content: unknown }

/**
 * Scripted offline model for development and UI tests (UNIOS_FAKE_LLM=1).
 * Uses the Anthropic message shape so the transcript renders like a real one.
 */
export function fakeAdapter(): LlmAdapter<M> {
  return {
    user: (text) => ({ role: 'user', content: text }),
    danglingToolCalls: () => [],
    toolResults: (results) => [{ role: 'user', content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, is_error: r.isError })) }],
    async turn(history, { onText }): Promise<TurnResult<M>> {
      const last = history.at(-1)
      const lastUser = [...history].reverse().find((m) => m.role === 'user' && typeof m.content === 'string')
      const ask = String(lastUser?.content ?? '').toLowerCase()
      const afterTool = Array.isArray(last?.content)
      if (ask.startsWith('create flashcards')) {
        const call = { type: 'tool_use', id: `t${Date.now()}`, name: 'propose_flashcards', input: { cards: [{ front: 'Wann heißt eine Folge konvergent?', back: 'Wenn es ein $a$ gibt mit $\\forall \\varepsilon>0\\ \\exists N: |a_n-a|<\\varepsilon$ für alle $n \\ge N$.' }, { front: 'Was ist eine Cauchy-Folge?', back: 'Eine Folge, deren Glieder beliebig nah beieinander liegen: $|a_n - a_m| < \\varepsilon$ für $n,m \\ge N$.' }, { front: 'Jede konvergente Folge ist …?', back: 'beschränkt.' }] } }
        return { messages: [{ role: 'assistant', content: [call] }], toolCalls: [{ id: call.id, name: call.name, input: call.input }], stop: 'tool_use' }
      }
      if (ask.startsWith('write ') && ask.includes('propose_questions')) {
        const input = {
          title: 'Konvergenz-Quiz',
          questions: [
            { type: 'single', prompt: 'Welche Folge ist konvergent?', options: ['$a_n = n$', '$a_n = 1/n$', '$a_n = (-1)^n$'], correct_options: [1], explanation: '$1/n \\to 0$.' },
            { type: 'multiple', prompt: 'Welche Aussagen gelten für jede konvergente Folge?', options: ['Sie ist beschränkt', 'Sie ist monoton', 'Sie ist eine Cauchy-Folge'], correct_options: [0, 2], points: 2 },
            { type: 'truefalse', prompt: 'Jede beschränkte Folge ist konvergent.', true_false: false, explanation: 'Gegenbeispiel: $(-1)^n$.' },
            { type: 'number', prompt: 'Berechne $\\lim_{n\\to\\infty} \\frac{2n+1}{n}$.', number_answer: 2, tolerance: 0.001 },
            { type: 'text', prompt: 'Erkläre, was eine Cauchy-Folge ist.', model_answer: 'Für jedes $\\varepsilon > 0$ gibt es ein $N$, sodass $|a_n - a_m| < \\varepsilon$ für alle $n, m \\ge N$.', points: 3 }
          ]
        }
        const call = { type: 'tool_use', id: `t${Date.now()}`, name: 'propose_questions', input }
        await new Promise((r) => setTimeout(r, 400))
        return { messages: [{ role: 'assistant', content: [call] }], toolCalls: [{ id: call.id, name: call.name, input }], stop: 'tool_use' }
      }
      if (ask.startsWith('grade these student answers')) {
        const n = (ask.match(/## answer \d+/g) ?? []).length
        const input = { grades: Array.from({ length: n }, (_, index) => ({ index, points: 1.5, feedback: 'Die Idee stimmt, aber die Quantoren fehlen.' })) }
        const call = { type: 'tool_use', id: `t${Date.now()}`, name: 'grade_answers', input }
        await new Promise((r) => setTimeout(r, 400))
        return { messages: [{ role: 'assistant', content: [call] }], toolCalls: [{ id: call.id, name: call.name, input }], stop: 'tool_use' }
      }
      await new Promise((r) => setTimeout(r, 150))
      if (!afterTool) {
        const call = ask.includes('create')
          ? { type: 'tool_use', id: `t${Date.now()}`, name: 'create_assignment', input: { course_id: ask.match(/course ([\w-]+)/)?.[1] ?? '', title: 'Übungsblatt 5', due_at: '2026-11-02T12:00' } }
          : { type: 'tool_use', id: `t${Date.now()}`, name: 'list_assignments', input: { status: ['todo', 'in_progress'] } }
        onText('Let me check. ')
        return { messages: [{ role: 'assistant', content: [{ type: 'text', text: 'Let me check. ' }, call] }], toolCalls: [{ id: call.id, name: call.name, input: call.input }], stop: 'tool_use' }
      }
      const text = '## This week\n\n- **Übungsblatt 3** for Analysis I, due Monday 12:00\n- **Essay draft**, due Thursday\n\nRemember the definition of convergence: $\\forall \\varepsilon > 0\\ \\exists N: |a_n - a| < \\varepsilon$.'
      for (const chunk of text.match(/.{1,12}/gs) ?? []) {
        onText(chunk)
        await new Promise((r) => setTimeout(r, 15))
      }
      return { messages: [{ role: 'assistant', content: [{ type: 'text', text }] }], toolCalls: [], stop: 'end' }
    }
  }
}
