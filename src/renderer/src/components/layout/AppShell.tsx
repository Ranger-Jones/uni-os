import { PanelLeftOpen } from 'lucide-react'
import { isMac, isModKey, shortcut } from '../../lib/platform'
import { Outlet } from '@tanstack/react-router'
import { useEffect } from 'react'
import { useUi } from '../../lib/store'
import { ChatPanel } from '../../features/chat/ChatPanel'
import { Mascot } from '../../features/mascot/Mascot'
import { CommandPalette } from './CommandPalette'
import { Sidebar } from './Sidebar'
import { SwipeNavigation } from './SwipeNavigation'

export function AppShell() {
  const width = useUi((s) => s.sidebarWidth)
  const setWidth = useUi((s) => s.setSidebarWidth)
  const chatOpen = useUi((s) => s.chatOpen)
  const setChatOpen = useUi((s) => s.setChatOpen)
  const collapsed = useUi((s) => s.sidebarCollapsed)
  const setCollapsed = useUi((s) => s.setSidebarCollapsed)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isModKey(e) && e.key.toLowerCase() === 'j') {
        e.preventDefault()
        setChatOpen(!useUi.getState().chatOpen)
      }
      if (isModKey(e) && e.key === '\\') {
        e.preventDefault()
        setCollapsed(!useUi.getState().sidebarCollapsed)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setChatOpen, setCollapsed])

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
      <SwipeNavigation />
      {!collapsed && (
        <aside style={{ width }} className="relative flex shrink-0 flex-col border-r border-line bg-side">
          <Sidebar />
          <div onPointerDown={startResize} className="absolute top-0 -right-1 z-10 h-full w-2 cursor-col-resize" />
        </aside>
      )}
      <main className="relative flex min-w-0 flex-1 flex-col">
        <div className="drag absolute inset-x-0 top-0 z-0 h-10" />
        {collapsed && (
          <button
            onClick={() => setCollapsed(false)}
            title={`Show sidebar (${shortcut('\\')})`}
            aria-label="Show sidebar"
            className="no-drag absolute top-2 z-20 rounded-md p-1.5 text-muted hover:bg-hover hover:text-ink"
            style={{ left: isMac ? 80 : 8 }}
          >
            <PanelLeftOpen size={17} />
          </button>
        )}
        <div className="relative min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>
      </main>
      {chatOpen && <ChatPanel />}
      <Mascot />
      <CommandPalette />
    </div>
  )
}
