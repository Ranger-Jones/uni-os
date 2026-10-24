// Spaced repetition with FSRS. Card state is stored flat in the cards table.
import { createEmptyCard, fsrs, type Card, type Grade } from 'ts-fsrs'

export interface SrsState {
  due: string
  stability: number
  difficulty: number
  elapsedDays: number
  scheduledDays: number
  learningSteps: number
  reps: number
  lapses: number
  state: number
  lastReview: string | null
}

export type Rating = 1 | 2 | 3 | 4 // Again, Hard, Good, Easy

const scheduler = fsrs({ enable_fuzz: false })

const toState = (c: Card): SrsState => ({
  due: c.due.toISOString(),
  stability: c.stability,
  difficulty: c.difficulty,
  elapsedDays: c.elapsed_days,
  scheduledDays: c.scheduled_days,
  learningSteps: c.learning_steps,
  reps: c.reps,
  lapses: c.lapses,
  state: c.state,
  lastReview: c.last_review ? c.last_review.toISOString() : null
})

const toCard = (s: SrsState): Card => ({
  due: new Date(s.due),
  stability: s.stability,
  difficulty: s.difficulty,
  elapsed_days: s.elapsedDays,
  scheduled_days: s.scheduledDays,
  learning_steps: s.learningSteps,
  reps: s.reps,
  lapses: s.lapses,
  state: s.state,
  last_review: s.lastReview ? new Date(s.lastReview) : undefined
})

export const newCardState = (now: Date): SrsState => toState(createEmptyCard(now))

export function review(s: SrsState, rating: Rating, now: Date): SrsState {
  return toState(scheduler.next(toCard(s), now, rating as Grade).card)
}
