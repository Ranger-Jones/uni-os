// German grading: 1.0 (best) … 4.0 (pass) … 5.0 (fail). Averages are ECTS- or weight-weighted.
import { AppError } from '../errors'

export const PASS_LIMIT = 4.0

export interface ComponentLike {
  weight: number
  grade: number | null
  passed?: boolean | null
}

/** Cut (not round) to one decimal, as German examination regulations usually do. */
export const truncate1 = (x: number): number => Math.floor(x * 10 + 1e-6) / 10

export function validateGrade(g: number): number {
  if (!Number.isFinite(g) || g < 1 || g > 5) throw new AppError('VALIDATION', 'Grade must be between 1.0 and 5.0')
  return g
}

const isOpen = (c: ComponentLike) => c.weight > 0 && c.grade === null && (c.passed === null || c.passed === undefined)

export function courseGrade(components: ComponentLike[]): { grade: number | null; provisional: boolean; gradedWeight: number } {
  const graded = components.filter((c) => c.grade !== null && c.weight > 0)
  const gradedWeight = graded.reduce((s, c) => s + c.weight, 0)
  const grade = gradedWeight > 0 ? graded.reduce((s, c) => s + c.weight * (c.grade as number), 0) / gradedWeight : null
  return { grade, provisional: components.some(isOpen), gradedWeight }
}

export function gpa(courses: { ects: number; gradingMode: 'graded' | 'pass_fail'; grade: number | null }[]): { gpa: number | null; ectsGraded: number; ectsTotal: number } {
  const counted = courses.filter((c) => c.gradingMode === 'graded' && c.grade !== null && c.grade <= PASS_LIMIT && c.ects > 0)
  const ectsGraded = counted.reduce((s, c) => s + c.ects, 0)
  const ectsTotal = courses.reduce((s, c) => s + c.ects, 0)
  return { gpa: ectsGraded > 0 ? counted.reduce((s, c) => s + c.ects * (c.grade as number), 0) / ectsGraded : null, ectsGraded, ectsTotal }
}

export interface Requirement {
  /** Average needed on what is left; null when nothing is left. */
  required: number | null
  status: 'reachable' | 'unreachable' | 'safe'
}

function classify(required: number): Requirement {
  if (required < 1) return { required, status: 'unreachable' }
  if (required > PASS_LIMIT) return { required, status: 'safe' }
  return { required, status: 'reachable' }
}

/** Average grade needed on `remainingEcts` to end up at `target`. */
export function requiredAverage(target: number, done: { ects: number; grade: number }[], remainingEcts: number): Requirement {
  const doneEcts = done.reduce((s, d) => s + d.ects, 0)
  const doneSum = done.reduce((s, d) => s + d.ects * d.grade, 0)
  if (remainingEcts <= 0) {
    const avg = doneEcts ? doneSum / doneEcts : Infinity
    return { required: null, status: avg <= target ? 'safe' : 'unreachable' }
  }
  return classify((target * (doneEcts + remainingEcts) - doneSum) / remainingEcts)
}

/** Grade needed on the not-yet-graded components of a course to reach `target`. */
export function requiredForCourse(target: number, components: ComponentLike[]): Requirement {
  const open = components.filter(isOpen)
  const openWeight = open.reduce((s, c) => s + c.weight, 0)
  const graded = components.filter((c) => c.grade !== null && c.weight > 0)
  const gradedWeight = graded.reduce((s, c) => s + c.weight, 0)
  const gradedSum = graded.reduce((s, c) => s + c.weight * (c.grade as number), 0)
  if (openWeight <= 0) {
    const avg = gradedWeight ? gradedSum / gradedWeight : Infinity
    return { required: null, status: avg <= target ? 'safe' : 'unreachable' }
  }
  return classify((target * (gradedWeight + openWeight) - gradedSum) / openWeight)
}
