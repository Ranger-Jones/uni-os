// Provider-agnostic agent loop: model turn → tools (with approval for mutating ones) → repeat.
import type { ToolResult, ToolSpec } from '../tools'

export interface ToolCall {
  id: string
  name: string
  input: unknown
}

export interface TurnResult<M> {
  /** Native messages produced by this turn, appended to history unchanged. */
  messages: M[]
  toolCalls: ToolCall[]
  stop: 'end' | 'tool_use' | 'max_tokens' | 'refusal'
  /** Human-readable reason for refusals etc. */
  note?: string
}

export interface LlmAdapter<M> {
  user(text: string): M
  toolResults(results: { id: string; name: string; content: string; isError: boolean }[]): M[]
  turn(history: M[], opts: { system: string; tools: ToolSpec[]; signal?: AbortSignal; onText(delta: string): void }): Promise<TurnResult<M>>
  /** Tool calls at the end of the history that never got results (e.g. an interrupted run). */
  danglingToolCalls?(history: M[]): ToolCall[]
}

export type LoopEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; input: unknown; mutates: boolean }
  | { type: 'tool_result'; id: string; ok: boolean; error?: string; declined?: boolean }
  | { type: 'done'; stop: TurnResult<unknown>['stop'] | 'max_steps' | 'aborted'; note?: string }

type DoneStop = Extract<LoopEvent, { type: 'done' }>['stop']

const MAX_RESULT_CHARS = 60_000

export async function runChatLoop<M>(opts: {
  adapter: LlmAdapter<M>
  history: M[]
  userText: string
  system: string
  tools: ToolSpec[]
  exec(call: ToolCall): Promise<ToolResult>
  approve(call: ToolCall): Promise<boolean>
  onEvent(e: LoopEvent): void
  /** Called with every batch of new native messages, so callers can persist incrementally. */
  onMessages?(msgs: M[]): void
  maxSteps?: number
  signal?: AbortSignal
  /** Approvals not answered within this time count as declined (default 10 minutes). */
  approvalTimeoutMs?: number
}): Promise<M[]> {
  const { adapter, tools, signal } = opts
  const added: M[] = []
  const push = (msgs: M[]) => {
    added.push(...msgs)
    opts.onMessages?.(msgs)
  }
  const errorResults = (calls: ToolCall[], content: string) => adapter.toolResults(calls.map((c) => ({ id: c.id, name: c.name, content, isError: true })))
  // History is append-only: close tool calls an earlier run left open, or every provider rejects the request.
  const dangling = adapter.danglingToolCalls?.(opts.history) ?? []
  if (dangling.length) push(errorResults(dangling, 'This tool call was interrupted and did not run.'))
  push([adapter.user(opts.userText)])
  const maxSteps = opts.maxSteps ?? 10
  const timeoutMs = opts.approvalTimeoutMs ?? 10 * 60_000
  const approveWithTimeout = (call: ToolCall) =>
    new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), timeoutMs)
      opts.approve(call).then(
        (v) => (clearTimeout(t), resolve(v)),
        () => (clearTimeout(t), resolve(false))
      )
    })

  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) return finish('aborted')
    const turn = await adapter.turn([...opts.history, ...added], { system: opts.system, tools, signal, onText: (delta) => opts.onEvent({ type: 'text', delta }) })
    push(turn.messages)
    if (turn.stop !== 'tool_use' && turn.toolCalls.length > 0) {
      push(errorResults(turn.toolCalls, 'The response was cut off before this tool call could run.'))
      return finish(turn.stop, turn.note)
    }
    if (turn.stop !== 'tool_use' || turn.toolCalls.length === 0) return finish(turn.stop, turn.note)

    const results: { id: string; name: string; content: string; isError: boolean }[] = []
    for (const call of turn.toolCalls) {
      if (signal?.aborted) {
        results.push({ id: call.id, name: call.name, content: 'Cancelled by the user.', isError: true })
        continue
      }
      const mutates = tools.find((t) => t.name === call.name)?.mutates ?? true
      opts.onEvent({ type: 'tool_call', id: call.id, name: call.name, input: call.input, mutates })
      if (mutates && !(await approveWithTimeout(call))) {
        results.push({ id: call.id, name: call.name, content: 'The user declined this action. Do not retry it unless asked.', isError: true })
        opts.onEvent({ type: 'tool_result', id: call.id, ok: false, declined: true })
        continue
      }
      const r = await opts.exec(call)
      const content = r.ok ? JSON.stringify(r.result ?? null) : `Error: ${r.error}`
      results.push({ id: call.id, name: call.name, content: content.length > MAX_RESULT_CHARS ? `${content.slice(0, MAX_RESULT_CHARS)}… [truncated]` : content, isError: !r.ok })
      opts.onEvent({ type: 'tool_result', id: call.id, ok: r.ok, error: r.ok ? undefined : r.error })
    }
    push(adapter.toolResults(results))
  }
  return finish('max_steps')

  function finish(stop: DoneStop, note?: string): M[] {
    opts.onEvent({ type: 'done', stop, note })
    return added
  }
}
