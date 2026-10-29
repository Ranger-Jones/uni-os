/**
 * Two-finger trackpad swipe → back/forward, from the wheel events Chromium reports for it
 * (Electron has no built-in swipe navigation for two fingers). Pure, so it can be tested.
 */
export const SWIPE = {
  /** Horizontal distance (CSS px) a swipe has to travel before it navigates. */
  threshold: 140,
  /** A gap this long between wheel events ends the gesture (momentum events keep it alive). */
  idleMs: 180,
  /** Movement needed before the gesture decides whether it is horizontal or vertical. */
  lockAfter: 12
}

export interface SwipeState {
  dx: number
  dy: number
  axis: 'x' | 'y' | null
  fired: boolean
  last: number
}

export interface SwipeInput {
  deltaX: number
  deltaY: number
  ctrlKey: boolean
  time: number
}

export type SwipeDirection = 'back' | 'forward'

export const swipeStart = (): SwipeState => ({ dx: 0, dy: 0, axis: null, fired: false, last: -Infinity })

export function swipeStep(prev: SwipeState, e: SwipeInput): { state: SwipeState; go: SwipeDirection | null; progress: number; direction: SwipeDirection | null } {
  const s = e.time - prev.last > SWIPE.idleMs ? swipeStart() : { ...prev }
  s.last = e.time
  // ctrl + wheel is a pinch (zoom), never a swipe
  if (e.ctrlKey) return { state: { ...s, axis: 'y' }, go: null, progress: 0, direction: null }
  s.dx += e.deltaX
  s.dy += e.deltaY
  if (!s.axis && Math.hypot(s.dx, s.dy) >= SWIPE.lockAfter) s.axis = Math.abs(s.dx) > Math.abs(s.dy) * 1.5 ? 'x' : 'y'
  if (s.axis !== 'x' || s.fired) return { state: s, go: null, progress: 0, direction: null }
  // fingers moving right scroll content left (negative deltaX) → back, like a browser
  const direction: SwipeDirection = s.dx < 0 ? 'back' : 'forward'
  const progress = Math.min(1, Math.abs(s.dx) / SWIPE.threshold)
  if (progress < 1) return { state: s, go: null, progress, direction }
  s.fired = true
  return { state: s, go: direction, progress: 1, direction }
}
