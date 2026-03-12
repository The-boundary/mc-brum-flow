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
  autoLayoutNonce: number;
  fitViewNonce: number;
  zoomInNonce: number;
  zoomOutNonce: number;
  setViewMode: (mode: ViewMode) => void;
  toggleDetailPanel: () => void;
  setDetailPanelWidth: (width: number) => void;
  toggleOutputPanel: () => void;
  togglePresetLibrary: () => void;
  requestAutoLayout: () => void;
  requestFitView: () => void;
  requestZoomIn: () => void;
  requestZoomOut: () => void;

  // Drag mode toggles
  linkSameType: boolean;
  moveParents: boolean;
  toggleLinkSameType: () => void;
  toggleMoveParents: () => void;

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
      autoLayoutNonce: 0,
      fitViewNonce: 0,
      zoomInNonce: 0,
      zoomOutNonce: 0,
      linkSameType: false,
      moveParents: false,
      sidebarCollapsed: false,
      sidebarMobileOpen: false,

      setViewMode: (mode) => set({ viewMode: mode }),
      toggleDetailPanel: () => set((s) => ({ detailPanelOpen: !s.detailPanelOpen })),
      setDetailPanelWidth: (width) => set({ detailPanelWidth: width }),
      toggleOutputPanel: () => set((s) => ({ outputPanelOpen: !s.outputPanelOpen })),
      togglePresetLibrary: () => set((s) => ({ presetLibraryOpen: !s.presetLibraryOpen })),
      requestAutoLayout: () => set((s) => ({ autoLayoutNonce: s.autoLayoutNonce + 1 })),
      requestFitView: () => set((s) => ({ fitViewNonce: s.fitViewNonce + 1 })),
      requestZoomIn: () => set((s) => ({ zoomInNonce: s.zoomInNonce + 1 })),
      requestZoomOut: () => set((s) => ({ zoomOutNonce: s.zoomOutNonce + 1 })),
      toggleLinkSameType: () => set((s) => ({ linkSameType: !s.linkSameType })),
      toggleMoveParents: () => set((s) => ({ moveParents: !s.moveParents })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),
    }),
    {
      name: 'brum-flow-ui',
      version: 2,
      partialize: (state) => ({
        viewMode: state.viewMode,
        detailPanelOpen: state.detailPanelOpen,
        detailPanelWidth: state.detailPanelWidth,
        outputPanelOpen: state.outputPanelOpen,
        presetLibraryOpen: state.presetLibraryOpen,
        linkSameType: state.linkSameType,
        moveParents: state.moveParents,
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarMobileOpen: state.sidebarMobileOpen,
      }),
      migrate: (persistedState) => {
        const state = (persistedState as Partial<UiState> | undefined) ?? {};

        return {
          viewMode: state.viewMode ?? 'flow',
          detailPanelOpen: state.detailPanelOpen ?? true,
          detailPanelWidth: state.detailPanelWidth ?? 380,
          outputPanelOpen: state.outputPanelOpen ?? false,
          presetLibraryOpen: state.presetLibraryOpen ?? false,
          linkSameType: state.linkSameType ?? false,
          moveParents: state.moveParents ?? false,
          sidebarCollapsed: state.sidebarCollapsed ?? false,
          sidebarMobileOpen: state.sidebarMobileOpen ?? false,
        };
      },
    }
  )
);
