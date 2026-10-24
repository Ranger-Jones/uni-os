import type { LlmAdapter, TurnResult } from '@core/llm/loop'

type M = { role: 'user' | 'assistant' | 'tool'; content: unknown }

/**
 * Scripted offline model for development and UI tests (UNIOS_FAKE_LLM=1).
 * Uses the Anthropic message shape so the transcript renders like a real one.
 */
export function fakeAdapter(): LlmAdapter<M> {
  return {
    user: (text) => ({ role: 'user', content: text }),
    toolResults: (results) => [{ role: 'user', content: results.map((r) => ({ type: 'tool_result', tool_use_id: r.id, content: r.content, is_error: r.isError })) }],
    async turn(history, { onText }): Promise<TurnResult<M>> {
      const last = history.at(-1)
      const lastUser = [...history].reverse().find((m) => m.role === 'user' && typeof m.content === 'string')
      const ask = String(lastUser?.content ?? '').toLowerCase()
      const afterTool = Array.isArray(last?.content)
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
