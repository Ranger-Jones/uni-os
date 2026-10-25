// Normalizes provider-native transcripts into what the chat UI renders.
import type { LlmProvider } from '../settings'

export type DisplayPart =
  | { type: 'text'; text: string }
  | { type: 'tool'; id: string; name: string; input: unknown; status: 'pending' | 'ok' | 'error' | 'declined' }

export interface DisplayMessage {
  role: 'user' | 'assistant'
  parts: DisplayPart[]
}

type Json = Record<string, any> // eslint-disable-line @typescript-eslint/no-explicit-any

const statusOf = (content: string, isError: boolean): 'ok' | 'error' | 'declined' =>
  /^The user declined/.test(content) ? 'declined' : isError || content.startsWith('Error:') ? 'error' : 'ok'

const textOf = (c: unknown): string => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b: Json) => (b.type === 'text' ? b.text : '')).join('') : '')

export function toDisplay(provider: LlmProvider, native: unknown[]): DisplayMessage[] {
  const out: DisplayMessage[] = []
  const tools = new Map<string, Extract<DisplayPart, { type: 'tool' }>>()
  const assistant = (): DisplayMessage => {
    const last = out.at(-1)
    if (last?.role === 'assistant') return last
    const m: DisplayMessage = { role: 'assistant', parts: [] }
    out.push(m)
    return m
  }
  const addTool = (id: string, name: string, input: unknown) => {
    const part = { type: 'tool' as const, id, name, input, status: 'pending' as const }
    tools.set(id, part)
    assistant().parts.push(part)
  }
  const setStatus = (id: string, content: string, isError: boolean) => {
    const t = tools.get(id)
    if (t) t.status = statusOf(content, isError)
  }

  for (const raw of native as Json[]) {
    if (provider === 'anthropic') {
      if (raw.role === 'user') {
        const results = Array.isArray(raw.content) ? raw.content.filter((b: Json) => b.type === 'tool_result') : []
        if (results.length) for (const r of results) setStatus(r.tool_use_id, textOf(r.content), !!r.is_error)
        else out.push({ role: 'user', parts: [{ type: 'text', text: textOf(raw.content) }] })
      } else if (raw.role === 'assistant') {
        const m = assistant()
        for (const b of Array.isArray(raw.content) ? raw.content : [{ type: 'text', text: raw.content }]) {
          if (b.type === 'text' && b.text) m.parts.push({ type: 'text', text: b.text })
          if (b.type === 'tool_use') addTool(b.id, b.name, b.input)
        }
      }
    } else {
      if (raw.role === 'user') out.push({ role: 'user', parts: [{ type: 'text', text: textOf(raw.content) }] })
      else if (raw.role === 'tool') setStatus(raw.tool_call_id, textOf(raw.content), false)
      else if (raw.role === 'assistant') {
        const m = assistant()
        const text = textOf(raw.content)
        if (text) m.parts.push({ type: 'text', text })
        for (const c of raw.tool_calls ?? []) {
          let input: unknown = c.function?.arguments
          try {
            input = JSON.parse(c.function?.arguments ?? '{}')
          } catch {
            // keep raw string
          }
          addTool(c.id, c.function?.name, input)
        }
      }
    }
  }
  return out
}
