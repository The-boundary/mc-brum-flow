import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'flow' | 'list';

interface UiState {
  // View
  viewMode: ViewMode;
  detailPanelOpen: boolean;
  detailPanelWidth: number;
  outputPanelOpen: boolean;
  presetLibraryOpen: boolean;
  setViewMode: (mode: ViewMode) => void;
  toggleDetailPanel: () => void;
  setDetailPanelWidth: (width: number) => void;
  toggleOutputPanel: () => void;
  togglePresetLibrary: () => void;

  // Sidebar
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  toggleSidebar: () => void;
  setSidebarMobileOpen: (open: boolean) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      viewMode: 'flow',
      detailPanelOpen: true,
      detailPanelWidth: 380,
      outputPanelOpen: false,
      presetLibraryOpen: false,
      sidebarCollapsed: false,
      sidebarMobileOpen: false,

      setViewMode: (mode) => set({ viewMode: mode }),
      toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
      setDetailPanelWidth: (width) => set({ detailPanelWidth: width }),
      toggleOutputPanel: () => set((s) => ({ outputPanelOpen: !s.outputPanelOpen })),
      togglePresetLibrary: () => set((s) => ({ presetLibraryOpen: !s.presetLibraryOpen })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),
    }),
    { name: 'brum-flow-ui' }
  )
);
