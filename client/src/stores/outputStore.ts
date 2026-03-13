import { create } from 'zustand';
import * as api from '@/lib/api';
import { useFlowStore } from './flowStore';
import type { ResolvedPath } from './types';

interface OutputState {
  // Data
  resolvedPaths: ResolvedPath[];
  pathCount: number;
  pathResolutionError: boolean;

  // Actions
  resolvePaths: (sceneId?: string) => Promise<void>;
  setResolvedPaths: (paths: ResolvedPath[], count: number) => void;
  setResolvedPathEnabled: (pathKey: string, outputNodeId: string, enabled: boolean) => Promise<void>;
  setOutputPathsEnabled: (outputNodeId: string, pathKeys: string[], enabled: boolean) => Promise<void>;
  setAllResolvedPathsEnabled: (enabled: boolean) => Promise<void>;
}

export const useOutputStore = create<OutputState>()((set, get) => ({
  resolvedPaths: [],
  pathCount: 0,
  pathResolutionError: false,

  resolvePaths: async (sceneId?: string) => {
    const activeSceneId = sceneId ?? useFlowStore.getState().activeSceneId;
    if (!activeSceneId) return;
    try {
      const result = await api.resolvePaths(activeSceneId);
      set({ resolvedPaths: result.paths, pathCount: result.count, pathResolutionError: false });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Path resolution failed';
      console.warn('Path resolution failed:', message);
      useFlowStore.getState().showToast(`Path resolution failed: ${message}`, 'error');
      set({ pathResolutionError: true });
    }
  },

  setResolvedPaths: (paths, count) => set({ resolvedPaths: paths, pathCount: count }),

  setResolvedPathEnabled: async (pathKey, outputNodeId, enabled) => {
    if (get().pathResolutionError) {
      useFlowStore.getState().showToast('Cannot toggle paths — path resolution is stale', 'error');
      return;
    }
    let updated = false;

    // Update flowNodes path_states via flowStore (cross-store mutation)
    const flowState = useFlowStore.getState();
    const nextNodes = flowState.flowNodes.map((node) => {
      if (node.id !== outputNodeId || node.type !== 'output') return node;
      updated = true;
      return {
        ...node,
        path_states: {
          ...(node.path_states ?? {}),
          [pathKey]: enabled,
        },
      };
    });

    if (updated) {
      useFlowStore.setState({ flowNodes: nextNodes });
    }

    // Update local resolvedPaths
    set((s) => ({
      resolvedPaths: s.resolvedPaths.map((path) =>
        path.pathKey === pathKey ? { ...path, enabled } : path
      ),
    }));

    if (updated) {
      await useFlowStore.getState().saveGraph();
    }
  },

  setOutputPathsEnabled: async (outputNodeId, pathKeys, enabled) => {
    if (pathKeys.length === 0) return;
    if (get().pathResolutionError) {
      useFlowStore.getState().showToast('Cannot toggle paths — path resolution is stale', 'error');
      return;
    }

    const keySet = new Set(pathKeys);
    let updated = false;

    // Update flowNodes path_states via flowStore (cross-store mutation)
    const flowState = useFlowStore.getState();
    const nextNodes = flowState.flowNodes.map((node) => {
      if (node.id !== outputNodeId || node.type !== 'output') return node;
      updated = true;
      const nextStates = { ...(node.path_states ?? {}) };
      for (const pathKey of keySet) {
        nextStates[pathKey] = enabled;
      }
      return {
        ...node,
        path_states: nextStates,
      };
    });

    if (updated) {
      useFlowStore.setState({ flowNodes: nextNodes });
    }

    // Update local resolvedPaths
    set((s) => ({
      resolvedPaths: s.resolvedPaths.map((path) =>
        path.outputNodeId === outputNodeId && keySet.has(path.pathKey)
          ? { ...path, enabled }
          : path
      ),
    }));

    if (updated) {
      await useFlowStore.getState().saveGraph();
    }
  },

  setAllResolvedPathsEnabled: async (enabled) => {
    if (get().pathResolutionError) {
      useFlowStore.getState().showToast('Cannot toggle paths — path resolution is stale', 'error');
      return;
    }
    let updated = false;

    // Build path_states updates grouped by output node
    const statesByOutput = new Map<string, Record<string, boolean>>();
    for (const path of get().resolvedPaths) {
      const outputStates = statesByOutput.get(path.outputNodeId) ?? {};
      outputStates[path.pathKey] = enabled;
      statesByOutput.set(path.outputNodeId, outputStates);
    }

    // Update flowNodes path_states via flowStore (cross-store mutation)
    const flowState = useFlowStore.getState();
    const nextNodes = flowState.flowNodes.map((node) => {
      if (node.type !== 'output') return node;
      const nextPathStates = statesByOutput.get(node.id);
      if (!nextPathStates) return node;
      updated = true;
      return {
        ...node,
        path_states: {
          ...(node.path_states ?? {}),
          ...nextPathStates,
        },
      };
    });

    if (updated) {
      useFlowStore.setState({ flowNodes: nextNodes });
    }

    // Update local resolvedPaths
    set((s) => ({
      resolvedPaths: s.resolvedPaths.map((path) => ({ ...path, enabled })),
    }));

    if (updated) {
      await useFlowStore.getState().saveGraph();
    }
  },
}));
