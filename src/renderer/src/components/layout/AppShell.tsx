import { Outlet } from '@tanstack/react-router'
import { useUi } from '../../lib/store'
import { CommandPalette } from './CommandPalette'
import { Sidebar } from './Sidebar'

export function AppShell() {
  const width = useUi((s) => s.sidebarWidth)
  const setWidth = useUi((s) => s.setSidebarWidth)

  const startResize = (e: React.PointerEvent) => {
    const startX = e.clientX
    const startW = width
    const move = (ev: PointerEvent) => setWidth(Math.min(400, Math.max(200, startW + ev.clientX - startX)))
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className="flex h-full">
      <aside style={{ width }} className="relative flex shrink-0 flex-col border-r border-line bg-side">
        <Sidebar />
        <div onPointerDown={startResize} className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize" />
      </aside>
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="drag absolute inset-x-0 top-0 z-0 h-10" />
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
      <CommandPalette />
    </div>
  )
}
