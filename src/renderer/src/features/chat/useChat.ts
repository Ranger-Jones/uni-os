import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DisplayMessage } from '@core/llm/display'
import { applyLiveEvent, type LiveEvent, type LiveRun } from '@core/llm/live'
import { api } from '../../lib/api'

type ChatEvent = LiveEvent & { runId: string; threadId: string }

export function useChat(threadId: string | null, onThreadCreated?: (id: string) => void) {
  const qc = useQueryClient()
  const history = useQuery({
    queryKey: ['chat', threadId],
    queryFn: () => api.ai.history({ threadId: threadId! }),
    enabled: !!threadId,
    staleTime: 0,
    refetchOnMount: 'always'
  })
  const [live, setLive] = useState<LiveRun | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const liveRef = useRef(live)
  liveRef.current = live

  // Resume a run that is still going in main (e.g. after the panel was closed or the view changed).
  // Only a snapshot fetched after mounting is current enough (a cached one may predate e.g. an approval request).
  const serverLive = history.isFetchedAfterMount && !history.isFetching ? (history.data?.live ?? null) : null
  useEffect(() => {
    if (serverLive && !liveRef.current) setLive(serverLive)
  }, [serverLive])
  // Switching to another existing chat clears the view; a brand-new chat getting its id keeps its run.
  const prevThread = useRef(threadId)
  useEffect(() => {
    if (prevThread.current && prevThread.current !== threadId) {
      setLive(null)
      setError(null)
      setNotice(null)
    }
    prevThread.current = threadId
  }, [threadId])

  useEffect(() => {
    return window.bridge.on('chat:event', (raw) => {
      const e = raw as ChatEvent
      if (!liveRef.current || e.runId !== liveRef.current.runId) return
      setLive((l) => (l ? applyLiveEvent(l, e) : l))
      if (e.type === 'done' || e.type === 'error') {
        if (e.type === 'error') setError(e.message || 'Something went wrong.')
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
        setLive((l) => l ?? { runId, userText: text, parts: [], approval: null })
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
