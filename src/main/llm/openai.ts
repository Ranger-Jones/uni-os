import OpenAI from 'openai'
import type { LlmAdapter, TurnResult } from '@core/llm/loop'

type M = OpenAI.Chat.ChatCompletionMessageParam

export const OPENAI_MODEL_SUGGESTIONS = ['gpt-5', 'gpt-5-mini', 'gpt-4.1']

export function friendlyOpenAIError(err: unknown): Error {
  if (err instanceof OpenAI.AuthenticationError) return new Error('The OpenAI API key was rejected. Check it in Settings.')
  if (err instanceof OpenAI.RateLimitError) return new Error('OpenAI rate limit or quota reached. Try again later.')
  if (err instanceof OpenAI.NotFoundError) return new Error(`OpenAI model not found. Check the model name in Settings.`)
  if (err instanceof OpenAI.APIConnectionError) return new Error('Could not reach the OpenAI API. Check your internet connection.')
  if (err instanceof OpenAI.APIError) return new Error(`OpenAI API error ${err.status ?? ''}: ${err.message}`)
  return err instanceof Error ? err : new Error(String(err))
}

/** Errors of a local OpenAI-compatible server (Ollama, LM Studio) in words that point at the local setup. */
function friendlyLocalError(err: unknown, baseURL: string, model: string): Error {
  if (err instanceof OpenAI.APIConnectionError) return new Error(`Could not reach the local model server at ${baseURL}. Is Ollama (or LM Studio) running?`)
  if (err instanceof OpenAI.NotFoundError) return new Error(`The model "${model}" is not installed on the local server. With Ollama: ollama pull ${model}`)
  if (err instanceof OpenAI.APIError) return new Error(`Local model server error ${err.status ?? ''}: ${err.message}`)
  return err instanceof Error ? err : new Error(String(err))
}

export function openaiAdapter(apiKey: string, model: string, opts: { baseURL?: string; local?: boolean; thinking?: boolean } = {}): LlmAdapter<M> {
  // Local servers can take a while to load a model into memory on the first request.
  const client = new OpenAI({ apiKey, ...(opts.baseURL ? { baseURL: opts.baseURL } : {}), ...(opts.local ? { timeout: 10 * 60_000, maxRetries: 0 } : {}) })
  const friendly = (err: unknown) => (opts.local ? friendlyLocalError(err, opts.baseURL ?? '', model) : friendlyOpenAIError(err))
  // Ollama turns hidden "thinking" of reasoning models off with reasoning_effort none; servers that do not know it get it dropped.
  let noThinking = opts.local === true && opts.thinking === false
  return {
    user: (text) => ({ role: 'user', content: text }),
    danglingToolCalls: (history) => {
      const last = history.at(-1)
      if (last?.role !== 'assistant' || !('tool_calls' in last) || !last.tool_calls?.length) return []
      return last.tool_calls.flatMap((c) => (c.type === 'function' ? [{ id: c.id, name: c.function.name, input: c.function.arguments }] : []))
    },
    toolResults: (results) => results.map((r) => ({ role: 'tool' as const, tool_call_id: r.id, content: r.content })),
    async turn(history, { system, tools, signal, onText }): Promise<TurnResult<M>> {
      let text = ''
      let finish: string | null = null
      const calls: { id: string; name: string; args: string }[] = []
      try {
        const request = () =>
          client.chat.completions.create(
            {
              model,
              stream: true,
              messages: [{ role: 'system', content: system }, ...history],
              tools: tools.map((t) => ({ type: 'function' as const, function: { name: t.name, description: t.description, parameters: t.inputSchema } })),
              ...(noThinking ? { reasoning_effort: 'none' as never } : {})
            },
            { signal }
          )
        let stream: Awaited<ReturnType<typeof request>>
        try {
          stream = await request()
        } catch (err) {
          if (!(noThinking && err instanceof OpenAI.BadRequestError)) throw err
          noThinking = false
          stream = await request()
        }
        for await (const chunk of stream) {
          const choice = chunk.choices[0]
          if (!choice) continue
          const d = choice.delta
          if (d?.content) {
            text += d.content
            onText(d.content)
          }
          for (const tc of d?.tool_calls ?? []) {
            // Some local servers omit the index (one complete call per chunk) or the id.
            const slot = (calls[tc.index ?? calls.length] ??= { id: '', name: '', args: '' })
            if (tc.id) slot.id = tc.id
            if (tc.function?.name) slot.name += tc.function.name
            if (tc.function?.arguments) slot.args += tc.function.arguments
          }
          if (choice.finish_reason) finish = choice.finish_reason
        }
      } catch (err) {
        throw friendly(err)
      }
      calls.forEach((c, i) => {
        if (c && !c.id) c.id = `call_${Date.now().toString(36)}_${i}`
      })
      const toolCalls = calls.filter(Boolean).map((c) => {
        let input: unknown = c.args
        try {
          input = c.args ? JSON.parse(c.args) : {}
        } catch {
          // invalid JSON — validation in runTool reports it back to the model
        }
        return { id: c.id, name: c.name, input }
      })
      const assistant: M = {
        role: 'assistant',
        content: text || null,
        ...(calls.length ? { tool_calls: calls.filter(Boolean).map((c) => ({ id: c.id, type: 'function' as const, function: { name: c.name, arguments: c.args || '{}' } })) } : {})
      }
      const stop: TurnResult<M>['stop'] =
        finish === 'length' ? 'max_tokens' : finish === 'content_filter' ? 'refusal' : finish === 'tool_calls' || toolCalls.length ? 'tool_use' : 'end'
      return { messages: [assistant], toolCalls, stop, note: stop === 'refusal' ? 'The response was blocked by the content filter.' : undefined }
    }
  }
}
