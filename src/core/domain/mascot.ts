// The study buddy in the bottom-right corner: which animal, how it behaves, how it talks.

export const ANIMALS = [
  { id: 'monkey', label: 'Monkey', defaultName: 'Bobo' },
  { id: 'cat', label: 'Cat', defaultName: 'Mochi' },
  { id: 'dog', label: 'Dog', defaultName: 'Bruno' },
  { id: 'panda', label: 'Panda', defaultName: 'Pan' },
  { id: 'fox', label: 'Fox', defaultName: 'Fenna' },
  { id: 'penguin', label: 'Penguin', defaultName: 'Pingu' },
  { id: 'frog', label: 'Frog', defaultName: 'Quentin' },
  { id: 'owl', label: 'Owl', defaultName: 'Ulla' }
] as const
export type AnimalId = (typeof ANIMALS)[number]['id']

export const PERSONALITIES = [
  { id: 'friendly', label: 'Friendly and encouraging' },
  { id: 'factual', label: 'Factual and brief' },
  { id: 'cheeky', label: 'Cheeky and funny' }
] as const
export type Personality = (typeof PERSONALITIES)[number]['id']

export interface MascotSettings {
  enabled: boolean
  animal: AnimalId
  name: string
  personality: Personality
  /** always: dances all the time; sometimes: a short dance now and then; off: only breathes and blinks. */
  dance: 'always' | 'sometimes' | 'off'
  size: 'small' | 'medium' | 'large'
  /** Model for the mascot's answers; "default" follows the assistant's default. */
  provider: 'default' | 'anthropic' | 'openai' | 'local'
}

export const defaultMascot = (): MascotSettings => ({
  enabled: true,
  animal: 'monkey',
  name: 'Bobo',
  personality: 'friendly',
  dance: 'always',
  size: 'medium',
  provider: 'default'
})

const TONE: Record<Personality, string> = {
  friendly: 'Be warm and encouraging, like a friendly study buddy; cheer the user on when it fits.',
  factual: 'Be factual and matter-of-fact: no small talk, no exclamation marks, just the answer.',
  cheeky: 'Be cheeky and playful: a light joke or an animal pun now and then is welcome, but the facts must be right.'
}

/** Extra instructions when the user talks to the mascot instead of the full assistant. */
export function mascotPersona(m: MascotSettings): string {
  const animal = ANIMALS.find((a) => a.id === m.animal)?.label.toLowerCase() ?? 'animal'
  return [
    `You appear as ${m.name || 'the mascot'}, a small ${animal} that sits in the corner of the app. Introduce yourself by that name if asked.`,
    TONE[m.personality] ?? TONE.friendly,
    'The chat is a small speech bubble: keep answers short (a few sentences or a short list) unless the user asks for more detail.',
    'Questions usually refer to what the user is looking at right now (described below). Use the tools to look at other pages, files or courses when the question needs them.'
  ].join('\n')
}
