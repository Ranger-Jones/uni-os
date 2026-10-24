// State of an in-flight assistant run, rebuilt from loop events. Main keeps one per run (so any window can
// resume it); the renderer uses the same reducer for its optimistic view.
import type { DisplayPart } from './display'
import type { LoopEvent } from './loop'

export interface LiveRun {
  runId: string
  userText: string
  parts: DisplayPart[]
  approval: { id: string; name: string; input: unknown } | null
}

export type LiveEvent = LoopEvent | { type: 'approval'; id: string; name: string; input: unknown } | { type: 'error'; message: string }

export const emptyLive = (runId: string, userText: string): LiveRun => ({ runId, userText, parts: [], approval: null })

export function applyLiveEvent(s: LiveRun, e: LiveEvent): LiveRun {
  switch (e.type) {
    case 'text': {
      const parts = [...s.parts]
      const last = parts.at(-1)
      if (last?.type === 'text') parts[parts.length - 1] = { ...last, text: last.text + e.delta }
      else parts.push({ type: 'text', text: e.delta })
      return { ...s, parts }
    }
    case 'tool_call':
      return { ...s, parts: [...s.parts, { type: 'tool', id: e.id, name: e.name, input: e.input, status: 'pending' }] }
    case 'approval':
      return { ...s, approval: { id: e.id, name: e.name, input: e.input } }
    case 'tool_result':
      return {
        ...s,
        approval: s.approval?.id === e.id ? null : s.approval,
        parts: s.parts.map((p) => (p.type === 'tool' && p.id === e.id ? { ...p, status: e.declined ? 'declined' : e.ok ? 'ok' : 'error' } : p))
      }
    default:
      return s
  }
}
