import { beforeEach, expect, test } from 'vitest'
import type { Db } from '@core/db/open'
import { runChatLoop, type LlmAdapter, type TurnResult } from '@core/llm/loop'
import * as chats from '@core/repo/chats'
import type { ToolSpec } from '@core/tools'
import { memDb } from '../helpers/db'

type M = { role: string; text?: string; calls?: { id: string; name: string }[]; results?: { id: string; content: string; isError: boolean }[] }

function fakeAdapter(turns: TurnResult<M>[]): LlmAdapter<M> & { seen: M[][] } {
  const seen: M[][] = []
  return {
    seen,
    user: (text) => ({ role: 'user', text }),
    toolResults: (results) => [{ role: 'tool', results }],
    turn: async (history, opts) => {
      seen.push([...history])
      const t = turns.shift()!
      for (const m of t.messages) if (m.text) opts.onText(m.text)
      return t
    }
  }
}

const specs: ToolSpec[] = [
  { name: 'search', description: '', inputSchema: { type: 'object' }, mutates: false },
  { name: 'create_assignment', description: '', inputSchema: { type: 'object' }, mutates: true }
]

test('tool call is executed and fed back before the final answer', async () => {
  const adapter = fakeAdapter([
    { messages: [{ role: 'assistant', calls: [{ id: 't1', name: 'search' }] }], toolCalls: [{ id: 't1', name: 'search', input: { query: 'x' } }], stop: 'tool_use' },
    { messages: [{ role: 'assistant', text: 'Found it.' }], toolCalls: [], stop: 'end' }
  ])
  const events: string[] = []
  const executed: string[] = []
  const out = await runChatLoop({
    adapter,
    history: [],
    userText: 'find x',
    system: 'sys',
    tools: specs,
    exec: async (c) => (executed.push(c.name), { ok: true, result: { hits: 1 } }),
    approve: async () => true,
    onEvent: (e) => events.push(e.type)
  })
  expect(executed).toEqual(['search'])
  expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'tool', 'assistant'])
  expect(adapter.seen[1].at(-1)).toMatchObject({ role: 'tool', results: [{ id: 't1', isError: false }] })
  expect(events).toEqual(['text_start', 'tool_call', 'tool_result', 'text', 'done'].filter((e) => e !== 'text_start'))
})

test('rejected mutating tool is not executed and the model is told', async () => {
  const adapter = fakeAdapter([
    { messages: [{ role: 'assistant' }], toolCalls: [{ id: 't1', name: 'create_assignment', input: {} }], stop: 'tool_use' },
    { messages: [{ role: 'assistant', text: 'Okay, not created.' }], toolCalls: [], stop: 'end' }
  ])
  const executed: string[] = []
  await runChatLoop({ adapter, history: [], userText: 'add', system: '', tools: specs, exec: async (c) => (executed.push(c.name), { ok: true, result: 1 }), approve: async () => false, onEvent: () => {} })
  expect(executed).toEqual([])
  expect(adapter.seen[1].at(-1)).toMatchObject({ results: [{ id: 't1', isError: true, content: expect.stringMatching(/declined/i) }] })
})

test('read tools run without asking for approval', async () => {
  const adapter = fakeAdapter([
    { messages: [{ role: 'assistant' }], toolCalls: [{ id: 't1', name: 'search', input: {} }], stop: 'tool_use' },
    { messages: [{ role: 'assistant', text: 'ok' }], toolCalls: [], stop: 'end' }
  ])
  let asked = 0
  await runChatLoop({ adapter, history: [], userText: 'q', system: '', tools: specs, exec: async () => ({ ok: true, result: 1 }), approve: async () => (asked++, true), onEvent: () => {} })
  expect(asked).toBe(0)
})

test('maxSteps stops endless tool loops', async () => {
  const loop: TurnResult<M> = { messages: [{ role: 'assistant' }], toolCalls: [{ id: 't', name: 'search', input: {} }], stop: 'tool_use' }
  const adapter = fakeAdapter(Array.from({ length: 10 }, () => ({ ...loop })))
  let done: unknown
  await runChatLoop({ adapter, history: [], userText: 'q', system: '', tools: specs, exec: async () => ({ ok: true, result: 1 }), approve: async () => true, onEvent: (e) => e.type === 'done' && (done = e), maxSteps: 3 })
  expect(adapter.seen).toHaveLength(3)
  expect(done).toMatchObject({ stop: 'max_steps' })
})

test('abort after a tool call still closes the turn with tool results', async () => {
  const ac = new AbortController()
  const adapter = fakeAdapter([{ messages: [{ role: 'assistant' }], toolCalls: [{ id: 't1', name: 'search', input: {} }], stop: 'tool_use' }])
  const out = await runChatLoop({
    adapter,
    history: [],
    userText: 'q',
    system: '',
    tools: specs,
    exec: async () => (ac.abort(), { ok: true, result: 1 }),
    approve: async () => true,
    onEvent: () => {},
    signal: ac.signal
  })
  expect(out.at(-1)).toMatchObject({ role: 'tool' })
})

let db: Db
beforeEach(() => {
  db = memDb().db
})

test('chats repo: threads and append-only native messages', () => {
  const t = chats.createThread(db, { title: 'Klausurvorbereitung', provider: 'anthropic', model: 'claude-opus-5-5' })
  chats.appendMessages(db, t.id, [{ role: 'user', content: 'hi' }, { role: 'assistant', content: [{ type: 'text', text: 'hello' }] }])
  expect(chats.messages(db, t.id).map((m) => m.role)).toEqual(['user', 'assistant'])
  expect(chats.nativeHistory(db, t.id)).toEqual([{ role: 'user', content: 'hi' }, { role: 'assistant', content: [{ type: 'text', text: 'hello' }] }])
  chats.renameThread(db, t.id, 'Analysis')
  expect(chats.listThreads(db)[0]).toMatchObject({ id: t.id, title: 'Analysis' })
  chats.removeThread(db, t.id)
  expect(chats.listThreads(db)).toEqual([])
})
