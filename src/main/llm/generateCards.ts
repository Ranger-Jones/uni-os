import { blocksToMarkdown } from '@core/domain/markdown'
import type { LlmAdapter } from '@core/llm/loop'
import * as pages from '@core/repo/pages'
import type { Db } from '@core/db/open'
import type { ToolSpec } from '@core/tools'

const PROPOSE: ToolSpec = {
  name: 'propose_flashcards',
  description: 'Return the proposed flashcards.',
  mutates: false,
  inputSchema: {
    type: 'object',
    properties: {
      cards: {
        type: 'array',
        items: { type: 'object', properties: { front: { type: 'string' }, back: { type: 'string' } }, required: ['front', 'back'], additionalProperties: false }
      }
    },
    required: ['cards'],
    additionalProperties: false
  }
}

/** One model turn that turns a note page into flashcard proposals (not saved yet). */
export async function generateCards(db: Db, adapter: LlmAdapter<unknown>, pageId: string): Promise<{ front: string; back: string }[]> {
  const page = pages.get(db, pageId)
  const md = await blocksToMarkdown(JSON.parse(page.content) as unknown[])
  if (!md.trim()) throw new Error('This page is empty. Write some notes first.')
  const prompt = `Create flashcards for exam preparation from my lecture notes below. One concept, definition, theorem or fact per card. Front: a precise question. Back: a short, complete answer. Use the language of the notes. Markdown and $LaTeX$ are allowed. Aim for 5–25 cards depending on how much material there is. Call propose_flashcards with all cards.\n\n# ${page.title || 'Notes'}\n\n${md.slice(0, 60_000)}`
  const turn = await adapter.turn([adapter.user(prompt)], { system: 'You write high-quality flashcards for university students.', tools: [PROPOSE], onText: () => {} })
  const call = turn.toolCalls.find((c) => c.name === PROPOSE.name)
  const list = (call?.input as { cards?: unknown } | undefined)?.cards
  if (!Array.isArray(list)) throw new Error(turn.stop === 'refusal' ? (turn.note ?? 'The model declined.') : 'The model did not return any flashcards. Try again.')
  return list.filter((c): c is { front: string; back: string } => typeof c?.front === 'string' && typeof c?.back === 'string' && !!c.front.trim() && !!c.back.trim())
}
