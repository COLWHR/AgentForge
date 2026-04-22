import { create } from 'zustand'

type UiShellState = {
  sidebarCollapsed: boolean
  rightPanelCollapsed: boolean
  commandPaletteOpen: boolean
  leftPanelWidth: number
  rightPanelWidth: number
  toggleSidebar: () => void
  toggleRightPanel: () => void
  setCommandPaletteOpen: (open: boolean) => void
  setLeftPanelWidth: (width: number) => void
  setRightPanelWidth: (width: number) => void
}

export const useUiShellStore = create<UiShellState>((set) => ({
  sidebarCollapsed: false,
  rightPanelCollapsed: false,
  commandPaletteOpen: false,
  leftPanelWidth: 260,
  rightPanelWidth: 320,
  toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
  toggleRightPanel: () => set((state) => ({ rightPanelCollapsed: !state.rightPanelCollapsed })),
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  setLeftPanelWidth: (width) => set({ leftPanelWidth: width }),
  setRightPanelWidth: (width) => set({ rightPanelWidth: width }),
}))
