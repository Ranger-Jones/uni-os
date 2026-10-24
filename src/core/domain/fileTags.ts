// Tags for course files (lecture slides, exercise sheets, …). Free-form, with presets the UI offers first.

export const FILE_TAG_PRESETS = ['lecture', 'exercise', 'solution', 'notes', 'exam', 'literature'] as const
export const MAX_TAGS = 10
const MAX_TAG_LENGTH = 30

export function normalizeTags(tags: string[]): string[] {
  const out: string[] = []
  for (const raw of tags) {
    const t = raw.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!t || t.length > MAX_TAG_LENGTH || out.includes(t)) continue
    out.push(t)
    if (out.length === MAX_TAGS) break
  }
  return out
}

// Order matters only for the result order; a name can match several rules.
const RULES: [tag: string, pattern: RegExp][] = [
  ['lecture', /(^|[^a-z])(vl|vorlesung|lecture|slides?|folien|skript|script|chapter|kapitel)([^a-z]|$)/i],
  ['exercise', /(übung|uebung|ubung|exercise|blatt|sheet|assignment|aufgabe|homework|tutorial)/i],
  ['solution', /(lösung|loesung|losung|solution|musterlösung)/i],
  ['exam', /(klausur|exam|prüfung|pruefung|altklausur|midterm|final)/i],
  ['notes', /(mitschrift|notes|notizen|zusammenfassung|summary|cheat ?sheet)/i]
]

/** Tag suggestions from a file name, e.g. "Übungsblatt 3.pdf" → ["exercise"]. */
export function suggestTags(fileName: string): string[] {
  const base = fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_\-.]+/g, ' ')
  const tags = RULES.filter(([, re]) => re.test(base)).map(([t]) => t)
  // "cheat sheet" is notes, not an exercise sheet
  return /cheat ?sheet/i.test(base) ? tags.filter((t) => t !== 'exercise') : tags
}
