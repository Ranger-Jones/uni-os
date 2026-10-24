import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DisplayMessage, DisplayPart } from '@core/llm/display'
import { api } from '../../lib/api'

interface Approval {
  id: string
  name: string
  input: unknown
}

interface Live {
  runId: string
  userText: string
  parts: DisplayPart[]
  approval: Approval | null
}

type ChatEvent = {
  runId: string
  threadId: string
  type: string
  delta?: string
  id?: string
  name?: string
  input?: unknown
  ok?: boolean
  declined?: boolean
  message?: string
  stop?: string
  note?: string
}

export function useChat(threadId: string | null, onThreadCreated?: (id: string) => void) {
  const qc = useQueryClient()
  const history = useQuery({ queryKey: ['chat', threadId], queryFn: () => api.ai.history({ threadId: threadId! }), enabled: !!threadId })
  const [live, setLive] = useState<Live | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const liveRef = useRef(live)
  liveRef.current = live

  useEffect(() => {
    return window.bridge.on('chat:event', (raw) => {
      const e = raw as ChatEvent
      if (!liveRef.current || e.runId !== liveRef.current.runId) return
      setLive((l) => {
        if (!l) return l
        const parts = [...l.parts]
        switch (e.type) {
          case 'text': {
            const last = parts.at(-1)
            if (last?.type === 'text') parts[parts.length - 1] = { ...last, text: last.text + e.delta }
            else parts.push({ type: 'text', text: e.delta ?? '' })
            return { ...l, parts }
          }
          case 'tool_call':
            parts.push({ type: 'tool', id: e.id!, name: e.name!, input: e.input, status: 'pending' })
            return { ...l, parts }
          case 'approval':
            return { ...l, approval: { id: e.id!, name: e.name!, input: e.input } }
          case 'tool_result':
            return {
              ...l,
              approval: l.approval?.id === e.id ? null : l.approval,
              parts: parts.map((p) => (p.type === 'tool' && p.id === e.id ? { ...p, status: e.declined ? 'declined' : e.ok ? 'ok' : 'error' } : p))
            }
          default:
            return l
        }
      })
      if (e.type === 'done' || e.type === 'error') {
        if (e.type === 'error') setError(e.message ?? 'Something went wrong.')
        if (e.type === 'done' && e.stop === 'refusal') setNotice(e.note ?? 'The model declined this request.')
        if (e.type === 'done' && e.stop === 'max_tokens') setNotice('The answer was cut off because it got too long.')
        if (e.type === 'done' && e.stop === 'max_steps') setNotice('Stopped after many tool calls. Ask again to continue.')
        void qc.invalidateQueries().then(() => setLive(null))
      }
    })
  }, [qc])

  const send = useCallback(
    async (text: string, opts: { courseId?: string | null; provider?: 'anthropic' | 'openai'; model?: string } = {}) => {
      setError(null)
      setNotice(null)
      try {
        const { runId, threadId: tid } = await api.ai.send({ threadId: threadId ?? undefined, text, ...opts })
        setLive({ runId, userText: text, parts: [], approval: null })
        if (!threadId) onThreadCreated?.(tid)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [threadId, onThreadCreated]
  )

  const decide = (approved: boolean) => {
    if (!live?.approval) return
    void api.ai.approve({ runId: live.runId, callId: live.approval.id, approved })
    setLive({ ...live, approval: null })
  }

  const stop = () => live && void api.ai.stop({ runId: live.runId })

  const messages: DisplayMessage[] = [...(history.data?.messages ?? [])]
  if (live) {
    messages.push({ role: 'user', parts: [{ type: 'text', text: live.userText }] })
    if (live.parts.length) messages.push({ role: 'assistant', parts: live.parts })
  }

  return { thread: history.data?.thread, messages, running: !!live, approval: live?.approval ?? null, error, notice, send, decide, stop }
}
