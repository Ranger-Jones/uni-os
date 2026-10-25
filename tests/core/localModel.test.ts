import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, expect, test } from 'vitest'
import { listLocalModels, normalizeLocalUrl } from '@core/llm/local'
import { defaultSettings, modelFor } from '@core/settings'
import { openaiAdapter } from '../../src/main/llm/openai'

let server: Server | null = null
afterEach(() => new Promise<void>((r) => (server ? server.close(() => r()) : r())))

/** Minimal OpenAI-compatible server (like Ollama / LM Studio). */
async function fakeServer(handler: (path: string, body: Record<string, unknown>) => { status?: number; json?: unknown; sse?: unknown[] }): Promise<string> {
  server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => (raw += c))
    req.on('end', () => {
      const out = handler(req.url ?? '', raw ? (JSON.parse(raw) as Record<string, unknown>) : {})
      if (out.sse) {
        res.writeHead(200, { 'content-type': 'text/event-stream' })
        for (const chunk of out.sse) res.write(`data: ${JSON.stringify(chunk)}\n\n`)
        res.end('data: [DONE]\n\n')
      } else {
        res.writeHead(out.status ?? 200, { 'content-type': 'application/json' })
        res.end(JSON.stringify(out.json ?? {}))
      }
    })
  })
  await new Promise<void>((r) => server!.listen(0, '127.0.0.1', () => r()))
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}/v1`
}

test('local server URLs are normalised and must be http(s)', () => {
  expect(normalizeLocalUrl(' http://localhost:11434/v1/ ')).toBe('http://localhost:11434/v1')
  expect(normalizeLocalUrl('http://localhost:11434')).toBe('http://localhost:11434/v1')
  expect(normalizeLocalUrl('http://192.168.1.20:1234/v1')).toBe('http://192.168.1.20:1234/v1')
  for (const bad of ['', 'localhost:11434', 'file:///etc', 'javascript:alert(1)']) expect(() => normalizeLocalUrl(bad), bad).toThrow(/http/i)
})

test('settings: local provider defaults and model lookup', () => {
  const s = defaultSettings()
  expect(s.localBaseUrl).toBe('http://localhost:11434/v1')
  expect(s.localModel).toBe('')
  expect(modelFor({ ...s, localModel: 'qwen3:14b' }, 'local')).toBe('qwen3:14b')
  expect(modelFor(s, 'anthropic')).toBe(s.anthropicModel)
  expect(modelFor(s, 'openai')).toBe(s.openaiModel)
})

test('installed models are listed from the server', async () => {
  const url = await fakeServer((path) => (path === '/v1/models' ? { json: { data: [{ id: 'qwen3:14b' }, { id: 'gpt-oss:20b' }] } } : { status: 404 }))
  expect(await listLocalModels(url)).toEqual(['gpt-oss:20b', 'qwen3:14b'])
})

test('an unreachable server gives a clear message', async () => {
  await expect(listLocalModels('http://127.0.0.1:9/v1', 1500)).rejects.toThrow(/could not reach.*127\.0\.0\.1:9.*ollama/i)
})

test('adapter talks to a local server: streamed text and tool calls without ids', async () => {
  let seen: Record<string, unknown> = {}
  const url = await fakeServer((_path, body) => {
    seen = body
    return {
      sse: [
        { choices: [{ index: 0, delta: { role: 'assistant', content: 'Let me look. ' } }] },
        { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { name: 'list_courses', arguments: '{"all":' } }] } }] },
        { choices: [{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 'true}' } }] } }] },
        { choices: [{ index: 0, delta: {}, finish_reason: 'tool_calls' }] }
      ]
    }
  })
  const a = openaiAdapter('local', 'qwen3:14b', { baseURL: url, local: true })
  let streamed = ''
  const turn = await a.turn([a.user('Which courses do I have?')], { system: 'sys', tools: [{ name: 'list_courses', description: 'd', inputSchema: { type: 'object' }, mutates: false }], onText: (d) => (streamed += d) })
  expect(seen.model).toBe('qwen3:14b')
  expect(streamed).toBe('Let me look. ')
  expect(turn.stop).toBe('tool_use')
  expect(turn.toolCalls).toEqual([{ id: expect.stringMatching(/\S/), name: 'list_courses', input: { all: true } }])
  // The id we made up is used for the tool result too, so the next turn is consistent.
  const msg = turn.messages[0] as { tool_calls: { id: string }[] }
  expect(msg.tool_calls[0].id).toBe(turn.toolCalls[0].id)
})

test('adapter: missing local model and unreachable server read like local problems', async () => {
  const url = await fakeServer(() => ({ status: 404, json: { error: { message: 'model "qwen9" not found, try pulling it first' } } }))
  const a = openaiAdapter('local', 'qwen9', { baseURL: url, local: true })
  await expect(a.turn([a.user('hi')], { system: 's', tools: [], onText: () => {} })).rejects.toThrow(/qwen9.*not installed|ollama pull qwen9/i)
  const down = openaiAdapter('local', 'qwen3:14b', { baseURL: 'http://127.0.0.1:9/v1', local: true })
  await expect(down.turn([down.user('hi')], { system: 's', tools: [], onText: () => {} })).rejects.toThrow(/could not reach the local model server/i)
})

test('thinking off sends reasoning_effort none; a server that rejects it gets the request again without', async () => {
  const bodies: Record<string, unknown>[] = []
  const url = await fakeServer((_path, body) => {
    bodies.push(body)
    if ('reasoning_effort' in body) return { status: 400, json: { error: { message: 'unknown parameter reasoning_effort' } } }
    return { sse: [{ choices: [{ index: 0, delta: { content: 'Hi' }, finish_reason: 'stop' }] }] }
  })
  const a = openaiAdapter('local', 'm', { baseURL: url, local: true, thinking: false })
  const turn = await a.turn([a.user('hi')], { system: 's', tools: [], onText: () => {} })
  expect(turn.stop).toBe('end')
  expect(bodies.map((b) => b.reasoning_effort)).toEqual(['none', undefined])
  // With thinking on, nothing extra is sent.
  bodies.length = 0
  const b = openaiAdapter('local', 'm', { baseURL: url, local: true, thinking: true })
  await b.turn([b.user('hi')], { system: 's', tools: [], onText: () => {} })
  expect(bodies.map((x) => 'reasoning_effort' in x)).toEqual([false])
})

test('settings: thinking of local models is off by default', () => {
  expect(defaultSettings().localThinking).toBe(false)
})
