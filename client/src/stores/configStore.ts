import { create } from 'zustand';
import * as api from '@/lib/api';
import type { NodeConfig, NodeType, StudioDefault } from '@shared/types';
import { useFlowStore } from './flowStore';

interface ConfigState {
  // Data
  nodeConfigs: NodeConfig[];
  studioDefaults: StudioDefault[];

  // Actions
  setNodeConfigs: (configs: NodeConfig[]) => void;
  setStudioDefaults: (defaults: StudioDefault[]) => void;
  createNodeConfig: (nodeType: NodeType, label: string, delta: Record<string, unknown>) => Promise<NodeConfig | null>;
  updateNodeConfig: (id: string, updates: { label?: string; delta?: Record<string, unknown> }) => Promise<NodeConfig | null>;
  deleteNodeConfig: (id: string) => Promise<void>;
}

export const useConfigStore = create<ConfigState>()((set) => ({
  nodeConfigs: [],
  studioDefaults: [],

  setNodeConfigs: (configs) => set({ nodeConfigs: configs }),

  setStudioDefaults: (defaults) => set({ studioDefaults: defaults }),

  createNodeConfig: async (nodeType, label, delta) => {
    try {
      const config = await api.createNodeConfig({ node_type: nodeType, label, delta });
      set((s) => ({ nodeConfigs: [...s.nodeConfigs, config] }));
      await useFlowStore.getState().resolvePaths();
      return config;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to create preset';
      useFlowStore.getState().showToast(message, 'error');
      return null;
    }
  },

  updateNodeConfig: async (id, updates) => {
    try {
      const config = await api.updateNodeConfig(id, updates);
      set((s) => ({ nodeConfigs: s.nodeConfigs.map((c) => (c.id === id ? config : c)) }));
      await useFlowStore.getState().resolvePaths();
      return config;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to update preset';
      useFlowStore.getState().showToast(message, 'error');
      return null;
    }
  },

  deleteNodeConfig: async (id) => {
    try {
      await api.deleteNodeConfig(id);
      set((s) => ({ nodeConfigs: s.nodeConfigs.filter((c) => c.id !== id) }));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete preset';
      useFlowStore.getState().showToast(message, 'error');
    }
  },
}));
