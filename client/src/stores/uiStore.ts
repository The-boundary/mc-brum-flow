import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { MaxDebugLogEntry } from './types';

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

  // Output display
  splitOutputs: boolean;
  toggleSplitOutputs: () => void;

  // Sidebar
  sidebarCollapsed: boolean;
  sidebarMobileOpen: boolean;
  toggleSidebar: () => void;
  setSidebarMobileOpen: (open: boolean) => void;

  // Toast notification (not persisted)
  toast: { message: string; level: 'info' | 'success' | 'error' } | null;
  showToast: (message: string, level?: 'info' | 'success' | 'error') => void;
  dismissToast: () => void;

  // Max debug log (not persisted)
  maxDebugLog: MaxDebugLogEntry[];
  clearMaxDebugLog: () => void;

  // Error (not persisted)
  error: string | null;
  setError: (error: string | null) => void;
}

export const useUiStore = create<UiState>()(
  persist(
    (set, get) => ({
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
      splitOutputs: false,
      sidebarCollapsed: false,
      sidebarMobileOpen: false,
      toast: null,
      maxDebugLog: [],
      error: null,

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
      toggleSplitOutputs: () => set((s) => ({ splitOutputs: !s.splitOutputs })),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarMobileOpen: (open) => set({ sidebarMobileOpen: open }),

      showToast: (message, level = 'info') => {
        set({ toast: { message, level } });
        setTimeout(() => {
          const current = get().toast;
          if (current?.message === message) set({ toast: null });
        }, 4000);
      },
      dismissToast: () => set({ toast: null }),
      clearMaxDebugLog: () => set({ maxDebugLog: [] }),
      setError: (error) => set({ error }),
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
        splitOutputs: state.splitOutputs,
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
          splitOutputs: state.splitOutputs ?? false,
          sidebarCollapsed: state.sidebarCollapsed ?? false,
          sidebarMobileOpen: state.sidebarMobileOpen ?? false,
        };
      },
    }
  )
);
