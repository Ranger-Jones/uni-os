import { Check, X } from 'lucide-react'
import type { Question, Response } from '@core/domain/tests'
import { Input, Textarea } from '../../components/ui/Input'
import { cn } from '../../lib/cn'
import { Markdown } from '../chat/Markdown'

export const md = 'text-[14px] [&_p]:my-0'

/** Answer controls for one question. With `reveal`, correct and wrong choices are marked and editing stops. */
export function AnswerInput({ q, value, onChange, reveal }: { q: Question; value: Response; onChange: (r: Response) => void; reveal?: boolean }) {
  const s = q.solution
  if (q.type === 'single' || q.type === 'multiple') {
    const picked = q.type === 'single' ? (typeof value === 'number' ? [value] : []) : Array.isArray(value) ? value : []
    const correct = 'correct' in s ? s.correct : []
    return (
      <div className="flex flex-col gap-1.5">
        {q.type === 'multiple' && !reveal && <p className="text-[12px] text-muted">Select all that apply.</p>}
        {q.options.map((opt, i) => {
          const on = picked.includes(i)
          const isRight = correct.includes(i)
          return (
            <button
              key={i}
              disabled={reveal}
              onClick={() => onChange(q.type === 'single' ? i : on ? picked.filter((x) => x !== i) : [...picked, i].sort((a, b) => a - b))}
              className={cn(
                'flex items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                !reveal && (on ? 'border-accent bg-accent-soft' : 'border-line hover:bg-hover'),
                reveal && isRight && 'border-ok bg-ok/10',
                reveal && on && !isRight && 'border-danger bg-danger/10',
                reveal && !on && !isRight && 'border-line opacity-70'
              )}
            >
              <span
                className={cn(
                  'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center border text-[10px]',
                  q.type === 'single' ? 'rounded-full' : 'rounded',
                  on ? 'border-accent bg-accent text-white' : 'border-faint'
                )}
              >
                {on && <Check size={11} strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1">
                <Markdown text={opt} className={md} />
              </span>
              {reveal && isRight && <Check size={15} className="mt-0.5 shrink-0 text-ok" />}
              {reveal && on && !isRight && <X size={15} className="mt-0.5 shrink-0 text-danger" />}
            </button>
          )
        })}
      </div>
    )
  }
  if (q.type === 'truefalse') {
    const truth = 'truth' in s ? s.truth : null
    return (
      <div className="flex gap-2">
        {[true, false].map((v) => {
          const on = value === v
          return (
            <button
              key={String(v)}
              disabled={reveal}
              onClick={() => onChange(v)}
              className={cn(
                'h-9 min-w-24 rounded-lg border px-4 text-[14px] font-medium',
                !reveal && (on ? 'border-accent bg-accent-soft text-accent' : 'border-line hover:bg-hover'),
                reveal && truth === v && 'border-ok bg-ok/10 text-ok',
                reveal && on && truth !== v && 'border-danger bg-danger/10 text-danger',
                reveal && !on && truth !== v && 'border-line opacity-60'
              )}
            >
              {v ? 'True' : 'False'}
            </button>
          )
        })}
      </div>
    )
  }
  if (q.type === 'number')
    return (
      <Input
        className="max-w-56 font-mono"
        inputMode="decimal"
        placeholder="Your result, e.g. 0.72 or 3/20"
        disabled={reveal}
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
      />
    )
  return (
    <Textarea
      className="min-h-32"
      placeholder="Your answer. Markdown and $LaTeX$ work."
      disabled={reveal}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

export function isAnswered(r: Response | undefined): boolean {
  if (r === null || r === undefined) return false
  if (typeof r === 'string') return !!r.trim()
  if (Array.isArray(r)) return r.length > 0
  return true
}
