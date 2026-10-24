export const fmtGrade = (g: number | null | undefined): string => (g == null ? '–' : g.toFixed(1).replace('.', ','))
export const fmtNum = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1).replace('.', ','))
export const parseNum = (s: string): number | null => {
  const t = s.trim().replace(',', '.')
  if (!t) return null
  const n = Number(t)
  return Number.isFinite(n) ? n : NaN
}
