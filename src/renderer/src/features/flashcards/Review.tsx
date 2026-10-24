import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import type { CardRow } from '@core/repo/cards'
import { Button } from '../../components/ui/Button'
import { api } from '../../lib/api'
import { cn } from '../../lib/cn'
import { Markdown } from '../chat/Markdown'

const RATINGS = [
  { r: 1 as const, label: 'Again', key: '1', cls: 'text-danger' },
  { r: 2 as const, label: 'Hard', key: '2', cls: 'text-warn' },
  { r: 3 as const, label: 'Good', key: '3', cls: 'text-ok' },
  { r: 4 as const, label: 'Easy', key: '4', cls: 'text-accent' }
]

/** Review session: front → reveal (space) → rate 1–4. Cards rated "Again" come back at the end. */
export function Review({ cards: initial, onDone }: { cards: CardRow[]; onDone: () => void }) {
  const qc = useQueryClient()
  const [queue, setQueue] = useState(initial)
  const [shown, setShown] = useState(false)
  const [done, setDone] = useState(0)
  const card = queue[0]

  const rate = async (rating: 1 | 2 | 3 | 4) => {
    if (!card || !shown) return
    await api.cards.review({ id: card.id, rating })
    setShown(false)
    setQueue((q) => (rating === 1 ? [...q.slice(1), q[0]] : q.slice(1)))
    if (rating !== 1) setDone((d) => d + 1)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault()
        setShown(true)
      }
      const r = RATINGS.find((x) => x.key === e.key)
      if (r) void rate(r.r)
      if (e.key === 'Escape') finish()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const finish = () => {
    void qc.invalidateQueries()
    onDone()
  }

  if (!card)
    return (
      <div className="flex flex-col items-center py-20 text-center">
        <p className="font-serif text-3xl font-semibold">All done</p>
        <p className="mt-2 text-[13px] text-muted">You reviewed {done} card{done === 1 ? '' : 's'}. The next ones are scheduled automatically.</p>
        <Button className="mt-6" variant="primary" onClick={finish}>
          Back to decks
        </Button>
      </div>
    )

  return (
    <div className="mx-auto flex max-w-2xl flex-col">
      <div className="mb-3 flex items-center justify-between text-[13px] text-muted">
        <span className="tabular-nums">
          {done} done · {queue.length} left
        </span>
        <button onClick={finish} className="rounded px-2 py-0.5 hover:bg-hover hover:text-ink">
          End session
        </button>
      </div>
      <div className="h-1 overflow-hidden rounded-full bg-hover">
        <div className="h-full bg-accent transition-[width]" style={{ width: `${(done / (done + queue.length)) * 100}%` }} />
      </div>
      <div onClick={() => setShown(true)} className="mt-6 min-h-72 rounded-2xl border border-line bg-raised px-10 py-10 shadow-[0_2px_16px_rgba(0,0,0,0.05)]">
        <div className="text-center font-serif leading-snug">
          <Markdown text={card.front} className="text-[22px]" />
        </div>
        {shown ? (
          <div className="mt-8 border-t border-line pt-8 text-center">
            <Markdown text={card.back} className="text-[16px]" />
          </div>
        ) : (
          <p className="mt-10 text-center text-[13px] text-faint">Press space or click to show the answer</p>
        )}
      </div>
      <div className={cn('mt-5 grid grid-cols-4 gap-2 transition-opacity', !shown && 'pointer-events-none opacity-30')}>
        {RATINGS.map((x) => (
          <button key={x.r} onClick={() => void rate(x.r)} className="flex flex-col items-center rounded-lg border border-line bg-raised py-2 hover:bg-hover">
            <span className={cn('text-sm font-medium', x.cls)}>{x.label}</span>
            <span className="text-[11px] text-faint">{x.key}</span>
          </button>
        ))}
      </div>
    </div>
  )
}
