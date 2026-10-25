import { useEffect, useRef, useState } from 'react'
import { cn } from '../../lib/cn'

const GAP = 16
const HIDE_AFTER = 1500

/** How far the note has been scrolled, as a slim bar in the bottom-right corner of the content area, shown only while scrolling. */
export function ReadingProgress() {
  const anchor = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<{ progress: number; right: number; scrollable: boolean }>({ progress: 0, right: GAP, scrollable: false })
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const scroller = findScroller(anchor.current)
    if (!scroller) return
    let frame = 0
    let hide: ReturnType<typeof setTimeout> | undefined
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const max = scroller.scrollHeight - scroller.clientHeight
        const rect = scroller.getBoundingClientRect()
        setState({
          progress: max > 0 ? Math.min(1, Math.max(0, scroller.scrollTop / max)) : 0,
          // Stay inside the content area so the assistant panel never covers it.
          right: window.innerWidth - rect.right + GAP,
          scrollable: max > 0
        })
      })
    }
    const onScroll = () => {
      update()
      setVisible(true)
      clearTimeout(hide)
      hide = setTimeout(() => setVisible(false), HIDE_AFTER)
    }
    update()
    // The note grows while typing and the area shrinks when the sidebar or assistant opens.
    const observer = new ResizeObserver(update)
    observer.observe(scroller)
    for (const child of scroller.children) observer.observe(child)
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', update)
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(hide)
      observer.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', update)
    }
  }, [])

  const percent = Math.round(state.progress * 100)
  return (
    <div ref={anchor}>
      <div
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-hidden={!visible}
        style={{ right: state.right, bottom: GAP }}
        className={cn(
          'no-drag pointer-events-none fixed z-40 flex items-center gap-2 rounded-full border border-line bg-raised/80 px-2.5 py-1.5 shadow-[0_2px_10px_rgba(0,0,0,0.06)] backdrop-blur-md transition-opacity duration-300',
          visible && state.scrollable ? 'opacity-80' : 'opacity-0'
        )}
      >
        <div className="h-1 w-16 overflow-hidden rounded-full bg-active">
          <div className="h-full rounded-full bg-accent transition-[width] duration-150 ease-out" style={{ width: `${percent}%` }} />
        </div>
        <span className="w-10 text-right text-[11px] whitespace-nowrap text-muted tabular-nums">{percent} %</span>
      </div>
    </div>
  )
}

function findScroller(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement; node; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node)
    if (overflowY === 'auto' || overflowY === 'scroll') return node
  }
  return null
}
