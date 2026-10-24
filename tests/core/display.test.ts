import { expect, test } from 'vitest'
import { toDisplay } from '@core/llm/display'

test('anthropic transcript → display messages with tool status, thinking hidden', () => {
  const native = [
    { role: 'user', content: 'Was steht an?' },
    { role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: 'Ich schaue nach.' }, { type: 'tool_use', id: 't1', name: 'list_assignments', input: {} }] },
    { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: '[]', is_error: false }] },
    { role: 'assistant', content: [{ type: 'text', text: 'Nichts offen.' }] }
  ]
  expect(toDisplay('anthropic', native)).toEqual([
    { role: 'user', parts: [{ type: 'text', text: 'Was steht an?' }] },
    { role: 'assistant', parts: [{ type: 'text', text: 'Ich schaue nach.' }, { type: 'tool', id: 't1', name: 'list_assignments', input: {}, status: 'ok' }, { type: 'text', text: 'Nichts offen.' }] }
  ])
})

test('openai transcript → display messages; declined tool shows status', () => {
  const native = [
    { role: 'user', content: 'Leg Blatt 5 an' },
    { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'create_assignment', arguments: '{"title":"Blatt 5"}' } }] },
    { role: 'tool', tool_call_id: 'c1', content: 'The user declined this action. Do not retry it unless asked.' },
    { role: 'assistant', content: 'Okay.' }
  ]
  expect(toDisplay('openai', native)).toEqual([
    { role: 'user', parts: [{ type: 'text', text: 'Leg Blatt 5 an' }] },
    { role: 'assistant', parts: [{ type: 'tool', id: 'c1', name: 'create_assignment', input: { title: 'Blatt 5' }, status: 'declined' }, { type: 'text', text: 'Okay.' }] }
  ])
})
