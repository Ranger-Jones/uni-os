import type { WebContents } from 'electron'
import { toDisplay } from '@core/llm/display'
import { runChatLoop, type LlmAdapter, type LoopEvent } from '@core/llm/loop'
import { buildSystemPrompt } from '@core/llm/systemPrompt'
import * as chats from '@core/repo/chats'
import { runTool, toolSpecs } from '@core/tools'
import type { AppContext } from '../context'
import { getKey } from '../secrets'
import { anthropicAdapter } from './anthropic'
import { fakeAdapter } from './fake'
import { openaiAdapter } from './openai'

export type ChatStreamEvent = { runId: string; threadId: string } & (LoopEvent | { type: 'error'; message: string } | { type: 'approval'; id: string; name: string; input: unknown })

interface Run {
  threadId: string
  abort: AbortController
  approvals: Map<string, (ok: boolean) => void>
}

export class ChatService {
  private runs = new Map<string, Run>()

  constructor(
    private ctx: AppContext,
    private target: () => WebContents | null
  ) {}

  private emit(e: ChatStreamEvent): void {
    this.target()?.send('chat:event', e)
  }

  history(threadId: string) {
    const t = chats.getThread(this.ctx.db, threadId)
    return { thread: t, messages: toDisplay(t.provider, chats.nativeHistory(this.ctx.db, threadId)), running: [...this.runs.values()].some((r) => r.threadId === threadId) }
  }

  private adapter(provider: 'anthropic' | 'openai', model: string): LlmAdapter<unknown> {
    if (process.env.UNIOS_FAKE_LLM === '1') return fakeAdapter() as LlmAdapter<unknown>
    const key = getKey(provider)
    if (!key) throw new Error(`Add your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key in Settings to use the assistant.`)
    return (provider === 'anthropic' ? anthropicAdapter(key, model) : openaiAdapter(key, model)) as LlmAdapter<unknown>
  }

  /** Starts a run in the background and returns its id; progress arrives as chat:event messages. */
  send(input: { threadId?: string; text: string; courseId?: string | null; provider?: 'anthropic' | 'openai'; model?: string }): { runId: string; threadId: string } {
    const db = this.ctx.db
    const s = this.ctx.settings
    const thread = input.threadId
      ? chats.getThread(db, input.threadId)
      : chats.createThread(db, {
          title: input.text.replace(/\s+/g, ' ').slice(0, 60),
          courseId: input.courseId ?? null,
          provider: input.provider ?? s.defaultProvider,
          model: input.model ?? ((input.provider ?? s.defaultProvider) === 'anthropic' ? s.anthropicModel : s.openaiModel)
        })
    if ([...this.runs.values()].some((r) => r.threadId === thread.id)) throw new Error('The assistant is still answering in this chat.')
    const adapter = this.adapter(thread.provider, thread.model)
    const runId = crypto.randomUUID()
    const run: Run = { threadId: thread.id, abort: new AbortController(), approvals: new Map() }
    this.runs.set(runId, run)
    const base = { runId, threadId: thread.id }
    const toolCtx = { db, filesDir: this.ctx.filesDir, now: () => new Date() }

    void runChatLoop({
      adapter,
      history: chats.nativeHistory(db, thread.id),
      userText: input.text,
      system: buildSystemPrompt(db, { now: new Date(), courseId: thread.courseId }),
      tools: toolSpecs(),
      signal: run.abort.signal,
      exec: (call) => runTool(toolCtx, call.name, call.input),
      approve: (call) =>
        new Promise<boolean>((resolve) => {
          run.approvals.set(call.id, resolve)
          this.emit({ ...base, type: 'approval', id: call.id, name: call.name, input: call.input })
          run.abort.signal.addEventListener('abort', () => resolve(false), { once: true })
        }),
      onEvent: (e) => this.emit({ ...base, ...e }),
      onMessages: (msgs) => chats.appendMessages(db, thread.id, msgs as { role: string }[])
    })
      .catch((err: unknown) => this.emit({ ...base, type: 'error', message: err instanceof Error ? err.message : String(err) }))
      .finally(() => this.runs.delete(runId))

    return base
  }

  approve(runId: string, callId: string, approved: boolean): void {
    const run = this.runs.get(runId)
    run?.approvals.get(callId)?.(approved)
    run?.approvals.delete(callId)
  }

  stop(runId: string): void {
    this.runs.get(runId)?.abort.abort()
  }
}
