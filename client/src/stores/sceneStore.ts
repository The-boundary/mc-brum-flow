import { create } from 'zustand';
import type { Scene, Camera } from '@shared/types';

function isValidCamera(value: unknown): value is Camera {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).id === 'string' &&
    typeof (value as Record<string, unknown>).name === 'string' &&
    typeof (value as Record<string, unknown>).max_handle === 'number' &&
    typeof (value as Record<string, unknown>).max_class === 'string'
  );
}

interface SceneState {
  // Data
  scenes: Scene[];
  activeSceneId: string | null;
  cameras: Camera[];
  loading: boolean;

  // Actions
  setScenes: (scenes: Scene[]) => void;
  setActiveSceneId: (id: string | null) => void;
  setCameras: (cameras: Camera[]) => void;
  mergeCameras: (incoming: Camera[]) => void;
  setLoading: (loading: boolean) => void;
}

export { isValidCamera };

export const useSceneStore = create<SceneState>()((set) => ({
  scenes: [],
  activeSceneId: null,
  cameras: [],
  loading: true,

  setScenes: (scenes) => set({ scenes }),

  setActiveSceneId: (id) => set({ activeSceneId: id }),

  setCameras: (cameras) => set({ cameras }),

  mergeCameras: (incoming) => {
    const validated = incoming.filter(isValidCamera);
    set((s) => {
      const merged = [...s.cameras];
      for (const camera of validated) {
        const existingIndex = merged.findIndex((c) => c.id === camera.id);
        if (existingIndex >= 0) {
          merged[existingIndex] = camera;
        } else {
          merged.push(camera);
        }
      }
      return { cameras: merged };
    });
  },

  setLoading: (loading) => set({ loading }),
}));
