import { useRouter } from '@tanstack/react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { SWIPE, swipeStart, swipeStep, type SwipeDirection } from '@core/domain/swipeNav'
import { isMac } from '../../lib/platform'

/** Whether an element under the pointer would scroll horizontally itself (tables, code blocks, …). */
function scrollsX(target: EventTarget | null, deltaX: number): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollWidth <= el.clientWidth) continue
    const overflow = getComputedStyle(el).overflowX
    if (overflow !== 'auto' && overflow !== 'scroll') continue
    if (deltaX < 0 ? el.scrollLeft > 0 : el.scrollLeft + el.clientWidth < el.scrollWidth - 1) return true
  }
  return false
}

/**
 * Back/forward like a browser: two-finger swipe on the trackpad, the mouse's back/forward buttons,
 * ⌘[ / ⌘] on macOS and Alt+←/→ elsewhere. Shows an arrow at the edge while swiping.
 */
export function SwipeNavigation() {
  const router = useRouter()
  const state = useRef(swipeStart())
  const hide = useRef<ReturnType<typeof setTimeout>>(undefined)
  const [hint, setHint] = useState<{ direction: SwipeDirection; progress: number } | null>(null)

  useEffect(() => {
    const go = (d: SwipeDirection) => (d === 'back' ? router.history.back() : router.history.forward())
    const onWheel = (e: WheelEvent) => {
      if (e.deltaX !== 0 && scrollsX(e.target, e.deltaX)) {
        // the content scrolls sideways itself; the rest of this gesture is not a swipe
        state.current = { ...state.current, axis: 'y', last: e.timeStamp }
        return
      }
      const r = swipeStep(state.current, { deltaX: e.deltaX, deltaY: e.deltaY, ctrlKey: e.ctrlKey, time: e.timeStamp })
      state.current = r.state
      if (r.go) go(r.go)
      const show = r.direction === 'forward' || router.history.canGoBack()
      setHint(r.direction && show && !r.go ? { direction: r.direction, progress: r.progress } : null)
      clearTimeout(hide.current)
      hide.current = setTimeout(() => setHint(null), SWIPE.idleMs)
    }
    const onMouse = (e: MouseEvent) => {
      if (e.button !== 3 && e.button !== 4) return
      e.preventDefault()
      go(e.button === 3 ? 'back' : 'forward')
    }
    const onKey = (e: KeyboardEvent) => {
      const mac = isMac && e.metaKey && !e.shiftKey && !e.altKey && (e.key === '[' || e.key === ']')
      const other = !isMac && e.altKey && !e.ctrlKey && !e.metaKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')
      if (!mac && !other) return
      e.preventDefault()
      go(e.key === '[' || e.key === 'ArrowLeft' ? 'back' : 'forward')
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    window.addEventListener('mouseup', onMouse)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('wheel', onWheel)
      window.removeEventListener('mouseup', onMouse)
      window.removeEventListener('keydown', onKey)
      clearTimeout(hide.current)
    }
  }, [router])

  if (!hint) return null
  const back = hint.direction === 'back'
  const Icon = back ? ChevronLeft : ChevronRight
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed top-1/2 z-50 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-line bg-raised text-ink shadow-md"
      style={{ [back ? 'left' : 'right']: -36 + hint.progress * 52, opacity: 0.3 + hint.progress * 0.7 }}
    >
      <Icon size={18} />
    </div>
  )
}
