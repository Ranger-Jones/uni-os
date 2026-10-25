import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** Zoom range of note pages (1 = 100 %). */
export const NOTE_ZOOM = { min: 0.5, max: 1.5, step: 0.1 }

interface UiState {
  semesterId: string | null
  setSemesterId: (id: string | null) => void
  expanded: Record<string, boolean>
  toggleExpanded: (id: string, open?: boolean) => void
  chatOpen: boolean
  chatThreadId: string | null
  setChatThreadId: (id: string | null) => void
  chatDraft: { text: string; courseId: string | null; nonce: number } | null
  askAssistant: (text: string, courseId: string | null) => void
  setChatOpen: (open: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  sidebarWidth: number
  setSidebarWidth: (w: number) => void
  sidebarCollapsed: boolean
  setSidebarCollapsed: (collapsed: boolean) => void
  noteZoom: number
  setNoteZoom: (zoom: number) => void
  mascotOpen: boolean
  setMascotOpen: (open: boolean) => void
  mascotThreadId: string | null
  setMascotThreadId: (id: string | null) => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      semesterId: null,
      setSemesterId: (semesterId) => set({ semesterId }),
      expanded: {},
      toggleExpanded: (id, open) => set((s) => ({ expanded: { ...s.expanded, [id]: open ?? !s.expanded[id] } })),
      chatOpen: false,
      chatThreadId: null,
      setChatThreadId: (chatThreadId) => set({ chatThreadId }),
      chatDraft: null,
      askAssistant: (text, courseId) => set({ chatOpen: true, chatThreadId: null, chatDraft: { text, courseId, nonce: Date.now() } }),
      setChatOpen: (chatOpen) => set({ chatOpen }),
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      sidebarWidth: 248,
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      noteZoom: 1,
      setNoteZoom: (noteZoom) => set({ noteZoom: Math.round(Math.min(NOTE_ZOOM.max, Math.max(NOTE_ZOOM.min, noteZoom)) * 100) / 100 }),
      mascotOpen: false,
      setMascotOpen: (mascotOpen) => set({ mascotOpen }),
      mascotThreadId: null,
      setMascotThreadId: (mascotThreadId) => set({ mascotThreadId })
    }),
    {
      name: 'unios-ui',
      partialize: (s) => ({ semesterId: s.semesterId, expanded: s.expanded, sidebarWidth: s.sidebarWidth, sidebarCollapsed: s.sidebarCollapsed, chatOpen: s.chatOpen, noteZoom: s.noteZoom, mascotThreadId: s.mascotThreadId })
    }
  )
)

/** Content may use more width while the sidebar is collapsed. */
export const useWideContent = (): boolean => useUi((s) => s.sidebarCollapsed)
