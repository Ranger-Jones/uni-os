import type { WebContents } from 'electron'
import { toDisplay } from '@core/llm/display'
import { applyLiveEvent, emptyLive, type LiveRun } from '@core/llm/live'
import { runChatLoop, type LlmAdapter, type LoopEvent } from '@core/llm/loop'
import { buildSystemPrompt } from '@core/llm/systemPrompt'
import * as chats from '@core/repo/chats'
import { runTool, toolSpecs } from '@core/tools'
import type { AppContext } from '../context'
import { getKey } from '../secrets'
import { anthropicAdapter } from './anthropic'
import { fakeAdapter } from './fake'
import { generateCards } from './generateCards'
import { buildMaterial, generateQuestions, gradeOpenAnswers } from '@core/llm/testGen'
import { autoGrade, type QuestionType, type Response, type TestKind } from '@core/domain/tests'
import * as tests from '@core/repo/tests'
import { openaiAdapter } from './openai'
import { normalizeLocalUrl } from '@core/llm/local'
import { modelFor, type LlmProvider } from '@core/settings'

export type ChatStreamEvent = { runId: string; threadId: string } & (LoopEvent | { type: 'error'; message: string } | { type: 'approval'; id: string; name: string; input: unknown })

interface Run {
  threadId: string
  live: LiveRun
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
    const run = this.runs.get(e.runId)
    if (run) run.live = applyLiveEvent(run.live, e)
    this.target()?.send('chat:event', e)
  }

  /** Persisted transcript plus the in-flight run (if any), so a reopened view can resume it. */
  history(threadId: string) {
    const t = chats.getThread(this.ctx.db, threadId)
    const run = [...this.runs.values()].find((r) => r.threadId === threadId)
    let messages = toDisplay(t.provider, chats.nativeHistory(this.ctx.db, threadId))
    // While a run is active, its user message and output are shown from the live state instead.
    if (run) {
      const lastUser = messages.map((m) => m.role).lastIndexOf('user')
      if (lastUser >= 0) messages = messages.slice(0, lastUser)
    }
    return { thread: t, messages, live: run?.live ?? null }
  }

  adapter(provider: LlmProvider, model: string): LlmAdapter<unknown> {
    if (process.env.UNIOS_FAKE_LLM === '1') return fakeAdapter() as LlmAdapter<unknown>
    if (provider === 'local') {
      if (!model) throw new Error('Choose a local model in Settings → Assistant to use it.')
      return openaiAdapter('local', model, { baseURL: normalizeLocalUrl(this.ctx.settings.localBaseUrl), local: true, thinking: this.ctx.settings.localThinking }) as LlmAdapter<unknown>
    }
    const key = getKey(provider)
    if (!key) throw new Error(`Add your ${provider === 'anthropic' ? 'Anthropic' : 'OpenAI'} API key in Settings to use the assistant.`)
    return (provider === 'anthropic' ? anthropicAdapter(key, model) : openaiAdapter(key, model)) as LlmAdapter<unknown>
  }

  /** Starts a run in the background and returns its id; progress arrives as chat:event messages. */
  send(input: { threadId?: string; text: string; courseId?: string | null; provider?: LlmProvider; model?: string }): { runId: string; threadId: string } {
    const db = this.ctx.db
    const s = this.ctx.settings
    const thread = input.threadId
      ? chats.getThread(db, input.threadId)
      : chats.createThread(db, {
          title: input.text.replace(/\s+/g, ' ').slice(0, 60),
          courseId: input.courseId ?? null,
          provider: input.provider ?? s.defaultProvider,
          model: input.model ?? modelFor(s, input.provider ?? s.defaultProvider)
        })
    if ([...this.runs.values()].some((r) => r.threadId === thread.id)) throw new Error('The assistant is still answering in this chat.')
    const adapter = this.adapter(thread.provider, thread.model)
    const runId = crypto.randomUUID()
    const run: Run = { threadId: thread.id, live: emptyLive(runId, input.text), abort: new AbortController(), approvals: new Map() }
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

  private defaultAdapter() {
    const s = this.ctx.settings
    return this.adapter(s.defaultProvider, modelFor(s, s.defaultProvider))
  }

  generateCards(pageId: string) {
    return generateCards(this.ctx.db, this.defaultAdapter(), pageId)
  }

  /** Question proposals for a new quiz or exam (not saved). */
  async generateTest(input: { courseId: string; pageIds: string[]; fileIds: string[]; kind: TestKind; count: number; types: QuestionType[]; focus?: string }) {
    const material = await buildMaterial(this.ctx.db, input)
    return generateQuestions(this.defaultAdapter(), { material: material.text, pages: material.pages, kind: input.kind, count: input.count, types: input.types, focus: input.focus })
  }

  /** Grade one answer right away (quiz mode); open answers go to the model. */
  async checkAnswer(questionId: string, response: Response) {
    const q = tests.getQuestion(this.ctx.db, questionId)
    const auto = autoGrade(q, response)
    if (auto) return { ...auto, feedback: null }
    const text = typeof response === 'string' ? response : ''
    if (!text.trim()) return { points: 0, correct: false, feedback: null }
    const [g] = await gradeOpenAnswers(this.defaultAdapter(), [{ questionId: q.id, prompt: q.prompt, modelAnswer: 'modelAnswer' in q.solution ? q.solution.modelAnswer : '', response: text, points: q.points }])
    if (!g) throw new Error('The model did not return a grade. Try again.')
    return { points: g.points, correct: g.points === q.points, feedback: g.feedback }
  }

  /** Grade all open answers of an attempt that are still pending. */
  async gradeAttempt(attemptId: string) {
    const pending = tests.pendingAnswers(this.ctx.db, attemptId)
    if (!pending.length) return tests.getAttempt(this.ctx.db, attemptId)
    const grades = await gradeOpenAnswers(this.defaultAdapter(), pending)
    return tests.applyGrades(this.ctx.db, attemptId, grades)
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
