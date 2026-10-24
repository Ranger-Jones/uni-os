import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

/** Standard content column for top-level views. */
export function Page({ title, actions, children, wide }: { title: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('mx-auto px-10 pt-14 pb-24', wide ? 'max-w-6xl' : 'max-w-4xl')}>
      <header className="mb-6 flex items-end justify-between gap-4">
        <h1 className="font-serif text-[32px] leading-tight font-semibold tracking-tight">{title}</h1>
        {actions && <div className="no-drag flex items-center gap-2">{actions}</div>}
      </header>
      {children}
    </div>
  )
}
