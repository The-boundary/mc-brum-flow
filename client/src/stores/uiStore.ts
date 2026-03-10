import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ViewMode = 'flow' | 'list';

interface UiState {
  // View
  viewMode: ViewMode;
  detailPanelOpen: boolean;
  detailPanelWidth: number;
  setViewMode: (mode: ViewMode) => void;
  toggleDetailPanel: () => void;
  setDetailPanelWidth: (width: number) => void;

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
      sidebarCollapsed: false,
      sidebarMobileOpen: false,

      setViewMode: (mode) => set({ viewMode: mode }),
      toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
      setDetailPanelWidth: (width) => set({ detailPanelWidth: width }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),
    }),
    { name: 'brum-flow-ui' }
  )
);
