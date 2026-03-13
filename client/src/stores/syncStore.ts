import { create } from 'zustand';
import * as api from '@/lib/api';
import type { MaxHealthResult } from '@/lib/api';
import type { MaxSyncState } from '@shared/types';
import type { SyncLogEntry, CameraMatchPrompt, MaxTcpInstance } from './types';

let syncLogCounter = 0;

interface SyncState {
  // Data
  maxHealth: MaxHealthResult | null;
  maxTcpInstances: MaxTcpInstance[];
  cameraMatchPrompt: CameraMatchPrompt | null;
  maxSyncState: MaxSyncState | null;
  syncLog: SyncLogEntry[];

  // Actions
  checkMaxHealth: () => Promise<void>;
  addSyncLog: (entry: Omit<SyncLogEntry, 'id' | 'timestamp'>) => void;
  dismissCameraMatchPrompt: () => void;
  setMaxSyncState: (state: MaxSyncState | null) => void;
  setMaxHealth: (health: MaxHealthResult | null) => void;
  setMaxTcpInstances: (instances: MaxTcpInstance[]) => void;
  setCameraMatchPrompt: (prompt: CameraMatchPrompt | null) => void;
}

export const useSyncStore = create<SyncState>()((set) => ({
  maxHealth: null,
  maxTcpInstances: [],
  cameraMatchPrompt: null,
  maxSyncState: null,
  syncLog: [],

  checkMaxHealth: async () => {
    try {
      const health = await api.checkMaxHealth();
      set({ maxHealth: health });
    } catch (err) {
      set({ maxHealth: { connected: false, error: err instanceof Error ? err.message : 'Check failed', host: '', port: 0 } });
    }
  },

  addSyncLog: (entry) => {
    const log: SyncLogEntry = {
      ...entry,
      id: `log_${Date.now()}_${syncLogCounter++}`,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({ syncLog: [log, ...s.syncLog].slice(0, 50) }));
  },

  dismissCameraMatchPrompt: () => set({ cameraMatchPrompt: null }),

  setMaxSyncState: (state) => set({ maxSyncState: state }),

  setMaxHealth: (health) => set({ maxHealth: health }),

  setMaxTcpInstances: (instances) => set({ maxTcpInstances: instances }),

  setCameraMatchPrompt: (prompt) => set({ cameraMatchPrompt: prompt }),
}));
