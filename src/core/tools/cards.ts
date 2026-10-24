import { z } from 'zod'
import * as cards from '../repo/cards'
import * as courses from '../repo/courses'
import * as decks from '../repo/decks'
import { defineTool, id } from './define'

export const cardTools = [
  defineTool({
    name: 'list_decks',
    description: 'List flashcard decks with how many cards are due for review.',
    input: z.object({ course_id: z.string().optional() }),
    mutates: false,
    run: ({ db, now }, i) => decks.list(db, { courseId: i.course_id }, now()).map((d) => ({ id: d.id, name: d.name, course_id: d.courseId, due: d.dueCount, total: d.totalCount }))
  }),
  defineTool({
    name: 'list_cards',
    description: 'List the cards (front and back) of a flashcard deck.',
    input: z.object({ deck_id: id('Deck') }),
    mutates: false,
    run: ({ db }, i) => {
      decks.get(db, i.deck_id)
      return cards.list(db, i.deck_id).map((c) => ({ id: c.id, front: c.front, back: c.back, reps: c.reps, due: c.due }))
    }
  }),
  defineTool({
    name: 'create_flashcards',
    description:
      'Create flashcards in a deck of a course (the deck is created if it does not exist). Write one fact or concept per card: a precise question on the front, a short complete answer on the back. Markdown and $LaTeX$ are allowed.',
    input: z.object({
      course_id: z.string().nullable().optional(),
      deck_name: z.string().min(1),
      cards: z.array(z.object({ front: z.string().min(1), back: z.string().min(1) })).min(1).max(100),
      source_page_id: z.string().optional()
    }),
    mutates: true,
    run: ({ db, now }, i) => {
      if (i.course_id) courses.get(db, i.course_id)
      const deck = decks.findOrCreate(db, i.course_id ?? null, i.deck_name)
      const created = cards.createMany(db, deck.id, i.cards.map((c) => ({ ...c, sourcePageId: i.source_page_id ?? null })), now())
      return { deck_id: deck.id, deck: deck.name, created: created.length }
    }
  })
]
