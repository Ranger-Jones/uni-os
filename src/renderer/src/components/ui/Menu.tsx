import * as M from '@radix-ui/react-dropdown-menu'
import type { ReactNode } from 'react'
import { cn } from '../../lib/cn'

export const Menu = M.Root
export const MenuTrigger = M.Trigger

export function MenuContent({ children, align = 'start' }: { children: ReactNode; align?: 'start' | 'end' }) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={4}
        className="z-50 min-w-48 rounded-lg border border-line bg-raised p-1 shadow-[0_8px_28px_rgba(0,0,0,0.14)]"
      >
        {children}
      </M.Content>
    </M.Portal>
  )
}

export function MenuItem({
  children,
  onSelect,
  danger,
  icon
}: {
  children: ReactNode
  onSelect: () => void
  danger?: boolean
  icon?: ReactNode
}) {
  return (
    <M.Item
      onSelect={onSelect}
      className={cn(
        'flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-[13px] outline-none data-[highlighted]:bg-hover',
        danger && 'text-danger'
      )}
    >
      {icon && <span className="flex w-4 justify-center text-muted">{icon}</span>}
      {children}
    </M.Item>
  )
}

export const MenuSeparator = () => <M.Separator className="my-1 h-px bg-line" />
export const MenuLabel = ({ children }: { children: ReactNode }) => (
  <M.Label className="px-2 py-1 text-xs text-faint">{children}</M.Label>
)
