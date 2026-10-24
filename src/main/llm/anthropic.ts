import Anthropic from '@anthropic-ai/sdk'
import type { LlmAdapter, TurnResult } from '@core/llm/loop'

type M = Anthropic.Beta.BetaMessageParam

export const ANTHROPIC_MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5' },
  { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5' }
]

export function friendlyAnthropicError(err: unknown): Error {
  if (err instanceof Anthropic.AuthenticationError) return new Error('The Anthropic API key was rejected. Check it in Settings.')
  if (err instanceof Anthropic.RateLimitError) return new Error('Anthropic rate limit reached. Wait a moment and try again.')
  if (err instanceof Anthropic.APIConnectionError) return new Error('Could not reach the Anthropic API. Check your internet connection.')
  if (err instanceof Anthropic.APIError) return new Error(`Anthropic API error ${err.status ?? ''}: ${err.message}`)
  return err instanceof Error ? err : new Error(String(err))
}

export function anthropicAdapter(apiKey: string, model: string): LlmAdapter<M> {
  const client = new Anthropic({ apiKey })
  const isHaiku = model.startsWith('claude-haiku')

  return {
    user: (text) => ({ role: 'user', content: text }),
    danglingToolCalls: (history) => {
      const last = history.at(-1)
      if (last?.role !== 'assistant' || !Array.isArray(last.content)) return []
      return last.content.flatMap((b) => (b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: b.input }] : []))
    },
    toolResults: (results) => [
      { role: 'user', content: results.map((r) => ({ type: 'tool_result' as const, tool_use_id: r.id, content: r.content, is_error: r.isError })) }
    ],
    async turn(history, { system, tools, signal, onText }): Promise<TurnResult<M>> {
      const params: Anthropic.Beta.MessageCreateParamsStreaming = {
        model,
        max_tokens: isHaiku ? 32000 : 64000,
        system,
        messages: history,
        cache_control: { type: 'ephemeral' },
        // Inputs are validated with zod in runTool before any tool runs.
        tools: tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema as Anthropic.Beta.BetaTool.InputSchema, eager_input_streaming: true })),
        // Current models think adaptively by default; refusals are re-routed server-side.
        ...(isHaiku ? {} : { output_config: { effort: 'medium' as const }, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' as const })
      } as Anthropic.Beta.MessageCreateParamsStreaming
      let final: Anthropic.Beta.BetaMessage | undefined
      for (let attempt = 0; !final; attempt++) {
        try {
          const stream = client.beta.messages.stream(params, { signal })
          stream.on('text', (delta) => onText(delta))
          final = await stream.finalMessage()
        } catch (err) {
          // A tool input that is not parseable JSON surfaces as a non-API error: re-issue once.
          if (err instanceof Anthropic.APIError || signal?.aborted || attempt >= 1) throw friendlyAnthropicError(err)
        }
      }
      const toolCalls = final.content.flatMap((b) => (b.type === 'tool_use' ? [{ id: b.id, name: b.name, input: b.input }] : []))
      const stop: TurnResult<M>['stop'] =
        final.stop_reason === 'tool_use' ? 'tool_use' : final.stop_reason === 'max_tokens' ? 'max_tokens' : final.stop_reason === 'refusal' ? 'refusal' : 'end'
      return {
        messages: [{ role: 'assistant', content: final.content as unknown as Anthropic.Beta.BetaContentBlockParam[] }],
        toolCalls,
        stop,
        note: stop === 'refusal' ? (final.stop_details?.explanation ?? 'The model declined this request.') : undefined
      }
    }
  }
}
