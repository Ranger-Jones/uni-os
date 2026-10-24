import { afterEach, expect, test, vi } from 'vitest'
import { applyLiveEvent, emptyLive } from '@core/llm/live'
import { runChatLoop, type LlmAdapter, type TurnResult } from '@core/llm/loop'
import type { ToolSpec } from '@core/tools'

type M = { role: string; calls?: string[]; results?: { id: string; content: string; isError: boolean }[] }

const specs: ToolSpec[] = [{ name: 'create_assignment', description: '', inputSchema: { type: 'object' }, mutates: true }]

function adapter(turns: TurnResult<M>[], dangling: string[] = []): LlmAdapter<M> & { seen: M[][] } {
  const seen: M[][] = []
  return {
    seen,
    user: (text) => ({ role: 'user', calls: [text] }),
    toolResults: (results) => [{ role: 'tool', results }],
    danglingToolCalls: (history) => (history.length && dangling.length ? dangling.map((id) => ({ id, name: 'create_assignment', input: {} })) : []),
    turn: async (history) => {
      seen.push([...history])
      return turns.shift()!
    }
  }
}

afterEach(() => vi.useRealTimers())

test('tool calls in a turn that stopped for max_tokens still get (error) results', async () => {
  const a = adapter([{ messages: [{ role: 'assistant', calls: ['t1'] }], toolCalls: [{ id: 't1', name: 'create_assignment', input: {} }], stop: 'max_tokens' }])
  const out = await runChatLoop({ adapter: a, history: [], userText: 'x', system: '', tools: specs, exec: async () => ({ ok: true, result: 1 }), approve: async () => true, onEvent: () => {} })
  expect(out.at(-1)).toMatchObject({ role: 'tool', results: [{ id: 't1', isError: true }] })
})

test('dangling tool calls from an earlier broken turn are closed before the next request', async () => {
  const a = adapter([{ messages: [{ role: 'assistant' }], toolCalls: [], stop: 'end' }], ['old1'])
  await runChatLoop({ adapter: a, history: [{ role: 'assistant', calls: ['old1'] }], userText: 'next', system: '', tools: specs, exec: async () => ({ ok: true, result: 1 }), approve: async () => true, onEvent: () => {} })
  const sent = a.seen[0]
  expect(sent[1]).toMatchObject({ role: 'tool', results: [{ id: 'old1', isError: true }] })
  expect(sent[2]).toMatchObject({ role: 'user' })
})

test('an approval that never arrives is declined after the timeout', async () => {
  vi.useFakeTimers()
  const a = adapter([
    { messages: [{ role: 'assistant' }], toolCalls: [{ id: 't1', name: 'create_assignment', input: {} }], stop: 'tool_use' },
    { messages: [{ role: 'assistant' }], toolCalls: [], stop: 'end' }
  ])
  const executed: string[] = []
  const p = runChatLoop({ adapter: a, history: [], userText: 'x', system: '', tools: specs, exec: async (c) => (executed.push(c.id), { ok: true, result: 1 }), approve: () => new Promise(() => {}), onEvent: () => {}, approvalTimeoutMs: 1000 })
  await vi.advanceTimersByTimeAsync(1500)
  await p
  expect(executed).toEqual([])
  expect(a.seen[1].at(-1)).toMatchObject({ results: [{ id: 't1', isError: true }] })
})

test('live run state is rebuilt from events (shared by main and renderer)', () => {
  let s = emptyLive('run1', 'hi')
  s = applyLiveEvent(s, { type: 'text', delta: 'Hel' })
  s = applyLiveEvent(s, { type: 'text', delta: 'lo' })
  s = applyLiveEvent(s, { type: 'tool_call', id: 't', name: 'create_assignment', input: { title: 'A' }, mutates: true })
  s = applyLiveEvent(s, { type: 'approval', id: 't', name: 'create_assignment', input: { title: 'A' } })
  expect(s.approval).toMatchObject({ id: 't' })
  s = applyLiveEvent(s, { type: 'tool_result', id: 't', ok: true })
  expect(s.approval).toBeNull()
  expect(s.parts).toEqual([
    { type: 'text', text: 'Hello' },
    { type: 'tool', id: 't', name: 'create_assignment', input: { title: 'A' }, status: 'ok' }
  ])
})
