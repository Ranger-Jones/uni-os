import type { Course } from '@core/repo/courses'

type Color = Course['color']

/** Course accent colors, tuned to read on both paper and dark backgrounds. */
export const COURSE_COLORS: Record<Color, { solid: string; soft: string; label: string }> = {
  gray: { solid: '#8c8c88', soft: 'rgba(140,140,136,0.16)', label: 'Gray' },
  red: { solid: '#d4584f', soft: 'rgba(212,88,79,0.15)', label: 'Red' },
  orange: { solid: '#d9822b', soft: 'rgba(217,130,43,0.15)', label: 'Orange' },
  yellow: { solid: '#c9a227', soft: 'rgba(201,162,39,0.17)', label: 'Yellow' },
  green: { solid: '#4b9a6a', soft: 'rgba(75,154,106,0.15)', label: 'Green' },
  teal: { solid: '#3a9a9c', soft: 'rgba(58,154,156,0.15)', label: 'Teal' },
  blue: { solid: '#3f72c9', soft: 'rgba(63,114,201,0.15)', label: 'Blue' },
  purple: { solid: '#8a63c9', soft: 'rgba(138,99,201,0.15)', label: 'Purple' },
  pink: { solid: '#c95f97', soft: 'rgba(201,95,151,0.15)', label: 'Pink' }
}

export const courseColor = (c: Color | undefined | null) => COURSE_COLORS[c ?? 'gray'] ?? COURSE_COLORS.gray
