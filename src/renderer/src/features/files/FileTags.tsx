import * as P from '@radix-ui/react-popover'
import { Check, Plus } from 'lucide-react'
import { useState } from 'react'
import { FILE_TAG_PRESETS } from '@core/domain/fileTags'
import { cn } from '../../lib/cn'

const TAG_STYLE: Record<string, string> = {
  lecture: 'bg-[rgba(63,114,201,0.13)] text-[#3f72c9] dark:text-[#8fb0ea]',
  exercise: 'bg-[rgba(75,154,106,0.14)] text-[#3f8a5c] dark:text-[#86c9a0]',
  solution: 'bg-[rgba(58,154,156,0.14)] text-[#2f8587] dark:text-[#7fc9cb]',
  notes: 'bg-[rgba(201,162,39,0.16)] text-[#9a7a12] dark:text-[#e0c063]',
  exam: 'bg-[rgba(212,88,79,0.13)] text-[#c4413a] dark:text-[#ec8f88]',
  literature: 'bg-[rgba(138,99,201,0.13)] text-[#7a52bd] dark:text-[#b89ae6]'
}

export const tagLabel = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

export function TagChip({ tag, active, onClick, count }: { tag: string; active?: boolean; onClick?: () => void; count?: number }) {
  return (
    <span
      onClick={onClick}
      className={cn(
        'inline-flex h-5 items-center gap-1 rounded-full px-2 text-[11.5px] font-medium whitespace-nowrap',
        TAG_STYLE[tag] ?? 'bg-hover text-muted',
        onClick && 'cursor-pointer',
        active === false && 'opacity-45 hover:opacity-80',
        active && 'ring-1 ring-current'
      )}
    >
      {tagLabel(tag)}
      {count !== undefined && <span className="opacity-70">{count}</span>}
    </span>
  )
}

/** Tag chips of one file plus a popover to change them. */
export function TagEditor({ tags, known, onChange }: { tags: string[]; known: string[]; onChange: (tags: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const [custom, setCustom] = useState('')
  const options = [...new Set([...FILE_TAG_PRESETS, ...known])]
  const toggle = (t: string) => onChange(tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t])
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger asChild>
        <button className="flex min-w-0 items-center gap-1 rounded px-0.5 hover:bg-active" aria-label="Edit tags" onClick={(e) => e.stopPropagation()}>
          {tags.length ? tags.map((t) => <TagChip key={t} tag={t} />) : <span className="flex h-5 items-center gap-0.5 px-1 text-[11.5px] text-faint"><Plus size={11} /> Tag</span>}
        </button>
      </P.Trigger>
      <P.Portal>
        <P.Content sideOffset={4} align="end" onClick={(e) => e.stopPropagation()} className="z-50 w-56 rounded-lg border border-line bg-raised p-1 shadow-[0_8px_28px_rgba(0,0,0,0.14)]">
          {options.map((t) => (
            <button key={t} onClick={() => toggle(t)} className="flex h-8 w-full items-center justify-between rounded-md px-2 hover:bg-hover">
              <TagChip tag={t} />
              {tags.includes(t) && <Check size={14} className="text-muted" />}
            </button>
          ))}
          <form
            className="mt-1 border-t border-line p-1 pt-2"
            onSubmit={(e) => {
              e.preventDefault()
              const t = custom.trim().toLowerCase()
              if (t && !tags.includes(t)) onChange([...tags, t])
              setCustom('')
            }}
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="New tag…" maxLength={30} className="h-7 w-full rounded border border-line bg-paper px-2 text-[13px] outline-none focus:border-accent" />
          </form>
        </P.Content>
      </P.Portal>
    </P.Root>
  )
}
