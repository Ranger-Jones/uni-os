// Text of multi-page documents (PDF slides, scripts) keeps its page boundaries as "[Page N]" lines,
// so tools can say on which slide something is.

const MARK = /^\[Page (\d+)\]$/m
const MARK_ALL = /^\[Page (\d+)\]\n?/gm

export const joinPages = (pages: string[]): string => pages.map((t, i) => `[Page ${i + 1}]\n${t.trim()}`.trim()).join('\n\n')

export const hasPageMarks = (text: string): boolean => MARK.test(text)

export function splitPages(text: string): { page: number | null; text: string }[] {
  if (!hasPageMarks(text)) return [{ page: null, text }]
  const out: { page: number | null; text: string }[] = []
  const marks = [...text.matchAll(MARK_ALL)]
  marks.forEach((m, i) => {
    const start = m.index! + m[0].length
    const end = i + 1 < marks.length ? marks[i + 1].index! : text.length
    out.push({ page: Number(m[1]), text: text.slice(start, end).trim() })
  })
  return out
}

/** Lower case without accents, so "Kreuzprodukt" matches "KREUZPRODUKT" and "kruger" matches "Krüger". */
const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()

/** Words that only glue a query together (German and English). */
const FILLER = new Set(
  'a an the of at in on to and or is are be for with by from as this that it der die das den dem des ein eine einer eines einem im am an auf und oder ist sind mit von zu zum zur für bei wie was wo welche welcher'.split(' ')
)

export interface TextHit {
  page: number | null
  snippet: string
  hits: number
  /** With partial: the query words found on this page. */
  matched?: string[]
}

/**
 * Pages that contain every word of the query, with a snippet around the first match.
 * With partial, pages containing some of the words are returned instead, those with the most words first.
 */
export function findInText(text: string, query: string, opts: { partial?: boolean } = {}): TextHit[] {
  const terms = fold(query)
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^["'(]+|["').?!:]+$/g, ''))
    .filter((t) => t.length >= 2 && !FILLER.has(t))
  if (!terms.length) return []
  const out: TextHit[] = []
  for (const p of splitPages(text)) {
    // fold() keeps the length of most text, but not of every character — search in the folded copy, cut from it too.
    const flat = p.text.replace(/\s+/g, ' ')
    const folded = fold(flat)
    const found = terms.filter((t) => folded.includes(t))
    if (opts.partial ? !found.length : found.length < terms.length) continue
    const at = folded.indexOf(found[0])
    const hits = found.reduce((n, t) => n + folded.split(t).length - 1, 0)
    const sameLength = folded.length === flat.length
    const source = sameLength ? flat : folded
    const from = Math.max(0, at - 80)
    const snippet = `${from > 0 ? '…' : ''}${source.slice(from, at + 160).trim()}${at + 160 < source.length ? '…' : ''}`
    out.push({ page: p.page, snippet, hits, ...(opts.partial ? { matched: found } : {}) })
  }
  return opts.partial ? out.sort((a, b) => b.matched!.length - a.matched!.length || b.hits - a.hits) : out
}
