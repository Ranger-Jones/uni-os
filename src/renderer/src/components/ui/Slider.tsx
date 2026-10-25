import { useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'

import { cn } from '../../lib/cn'

const KNOB = 32

/** A macOS Control Center–style slider: thin track, white pill knob, icons at both ends. */
export function Slider({
  value,
  min,
  max,
  step,
  onChange,
  label,
  valueText,
  start,
  end,
  onReset
}: {
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  label: string
  valueText?: string
  start?: ReactNode
  end?: ReactNode
  /** Double-clicking the knob resets the value. */
  onReset?: () => void
}) {
  const track = useRef<HTMLDivElement>(null)
  // The knob glides to new values, except while it follows the pointer.
  const [dragging, setDragging] = useState(false)
  const glide = dragging ? '' : 'transition-all duration-200 ease-out'
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step))
  const fraction = (value - min) / (max - min)

  const fromPointer = (e: PointerEvent) => {
    const r = track.current!.getBoundingClientRect()
    // The knob's centre travels between KNOB/2 and width − KNOB/2.
    onChange(clamp(min + ((e.clientX - r.left - KNOB / 2) / (r.width - KNOB)) * (max - min)))
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const delta = { ArrowRight: step, ArrowUp: step, ArrowLeft: -step, ArrowDown: -step }[e.key]
    if (e.key === 'Home') onChange(min)
    else if (e.key === 'End') onChange(max)
    else if (delta) onChange(clamp(value + delta))
    else return
    // Keep the arrow keys away from the surrounding menu's navigation.
    e.preventDefault()
    e.stopPropagation()
  }

  return (
    <div className="flex items-center gap-2.5">
      {start && <span className="flex shrink-0 text-muted">{start}</span>}
      <div
        ref={track}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        aria-valuetext={valueText}
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setDragging(true)
          fromPointer(e)
        }}
        onPointerUp={() => setDragging(false)}
        onPointerCancel={() => setDragging(false)}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) fromPointer(e)
        }}
        onDoubleClick={onReset}
        className="group relative flex h-6 flex-1 cursor-default touch-none items-center rounded-full outline-none"
      >
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/15">
          <div className={cn('h-full rounded-full bg-ink/45', glide)} style={{ width: `${fraction * 100}%` }} />
        </div>
        <div
          className={cn(
            'pointer-events-none absolute top-1/2 h-[22px] w-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_1px_4px_rgba(0,0,0,0.35)] ring-accent/60 group-focus-visible:ring-2 group-active:scale-95',
            glide
          )}
          style={{ left: `calc(${KNOB / 2}px + ${fraction} * (100% - ${KNOB}px))` }}
        />
      </div>
      {end && <span className="flex shrink-0 text-muted">{end}</span>}
    </div>
  )
}
