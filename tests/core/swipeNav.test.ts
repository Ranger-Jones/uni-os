import { expect, test } from 'vitest'
import { SWIPE, swipeStart, swipeStep, type SwipeState } from '@core/domain/swipeNav'

/** Feeds a gesture of wheel events 16 ms apart and collects the navigations it triggers. */
function run(events: [number, number][], state: SwipeState = swipeStart(), t0 = 1000) {
  const go: string[] = []
  let s = state
  events.forEach(([dx, dy], i) => {
    const r = swipeStep(s, { deltaX: dx, deltaY: dy, ctrlKey: false, time: t0 + i * 16 })
    s = r.state
    if (r.go) go.push(r.go)
  })
  return { go, state: s }
}
const repeat = (n: number, e: [number, number]): [number, number][] => Array.from({ length: n }, () => e)

test('a two-finger swipe to the right goes back, to the left goes forward', () => {
  expect(run(repeat(20, [-12, 0])).go).toEqual(['back'])
  expect(run(repeat(20, [12, 0])).go).toEqual(['forward'])
})

test('one gesture navigates once, even with momentum events after it', () => {
  expect(run([...repeat(20, [-12, 0]), ...repeat(40, [-4, 0])]).go).toEqual(['back'])
})

test('a short nudge or a vertical scroll does not navigate', () => {
  expect(run(repeat(5, [-12, 0])).go).toEqual([])
  expect(run(repeat(30, [-6, 20])).go).toEqual([])
})

test('a gesture that starts vertical stays a scroll', () => {
  expect(run([...repeat(5, [0, 20]), ...repeat(30, [-15, 0])]).go).toEqual([])
})

test('pinch-zoom (ctrl + wheel) is ignored', () => {
  let s = swipeStart()
  for (let i = 0; i < 30; i++) {
    const r = swipeStep(s, { deltaX: -15, deltaY: 0, ctrlKey: true, time: 1000 + i * 16 })
    expect(r.go).toBeNull()
    s = r.state
  }
})

test('a pause ends the gesture, so the next swipe navigates again', () => {
  const first = run(repeat(20, [-12, 0]))
  const second = run(repeat(20, [-12, 0]), first.state, 1000 + 20 * 16 + SWIPE.idleMs + 50)
  expect(second.go).toEqual(['back'])
})

test('progress grows towards the threshold for the edge indicator', () => {
  const r = run(repeat(4, [-12, 0]))
  const p = swipeStep(r.state, { deltaX: -12, deltaY: 0, ctrlKey: false, time: 1000 + 4 * 16 })
  expect(p.progress).toBeGreaterThan(0)
  expect(p.progress).toBeLessThan(1)
  expect(p.direction).toBe('back')
})
