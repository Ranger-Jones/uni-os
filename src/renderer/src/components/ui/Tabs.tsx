import { cn } from '../../lib/cn'

export function Tabs<T extends string>({
  value,
  onChange,
  items
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: string; count?: number }[]
}) {
  return (
    <div role="tablist" className="flex gap-1 border-b border-line">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            '-mb-px border-b-2 px-2.5 pt-1 pb-2 text-[13px] font-medium transition-colors',
            value === it.value ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink'
          )}
        >
          {it.label}
          {it.count !== undefined && it.count > 0 && <span className="ml-1.5 text-faint">{it.count}</span>}
        </button>
      ))}
    </div>
  )
}
