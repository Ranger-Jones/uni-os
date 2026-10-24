import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface UiState {
  semesterId: string | null
  setSemesterId: (id: string | null) => void
  expanded: Record<string, boolean>
  toggleExpanded: (id: string, open?: boolean) => void
  chatOpen: boolean
  setChatOpen: (open: boolean) => void
  paletteOpen: boolean
  setPaletteOpen: (open: boolean) => void
  sidebarWidth: number
  setSidebarWidth: (w: number) => void
}

export const useUi = create<UiState>()(
  persist(
    (set) => ({
      semesterId: null,
      setSemesterId: (semesterId) => set({ semesterId }),
      expanded: {},
      toggleExpanded: (id, open) => set((s) => ({ expanded: { ...s.expanded, [id]: open ?? !s.expanded[id] } })),
      chatOpen: false,
      setChatOpen: (chatOpen) => set({ chatOpen }),
      paletteOpen: false,
      setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
      sidebarWidth: 248,
      setSidebarWidth: (sidebarWidth) => set({ sidebarWidth })
    }),
    {
      name: 'unios-ui',
      partialize: (s) => ({ semesterId: s.semesterId, expanded: s.expanded, sidebarWidth: s.sidebarWidth, chatOpen: s.chatOpen })
    }
  )
)
