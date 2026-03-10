import { create } from 'zustand';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';

// DB row types (snake_case from Postgres)
interface DbSceneState {
  id: string;
  name: string;
  environment: string;
  lighting: string;
  render_passes: number;
  noise_threshold: number;
  denoiser: string;
  layers: string[];
  render_elements: string[];
  color: string;
}

interface DbCamera {
  id: string;
  name: string;
  fov?: number;
}

interface DbContainer {
  id: string;
  name: string;
  parent_id: string | null;
  scene_state_id: string;
  output_path_template: string;
  sort_order: number;
}

interface DbShot {
  id: string;
  name: string;
  container_id: string;
  camera_id: string;
  resolution_width: number;
  resolution_height: number;
  scene_state_id: string | null;
  overrides: Record<string, unknown>;
  output_path: string;
  output_format: string;
  enabled: boolean;
  sort_order: number;
}

// Client-side types (camelCase for convenience)
export interface SceneState {
  id: string;
  name: string;
  environment: string;
  lighting: string;
  renderPasses: number;
  noiseThreshold: number;
  denoiser: string;
  layers: string[];
  renderElements: string[];
  color: string;
}

export interface Camera {
  id: string;
  name: string;
  fov?: number;
}

export interface Container {
  id: string;
  name: string;
  parentId: string | null;
  sceneStateId: string;
  outputPathTemplate: string;
  sortOrder: number;
  expanded: boolean;
}

export interface Shot {
  id: string;
  name: string;
  containerId: string;
  cameraId: string;
  resolutionWidth: number;
  resolutionHeight: number;
  sceneStateId: string | null;
  overrides: Record<string, unknown>;
  outputPath: string;
  outputFormat: string;
  enabled: boolean;
  sortOrder: number;
}

// Mappers
function mapState(r: DbSceneState): SceneState {
  return { id: r.id, name: r.name, environment: r.environment, lighting: r.lighting, renderPasses: r.render_passes, noiseThreshold: r.noise_threshold, denoiser: r.denoiser, layers: r.layers, renderElements: r.render_elements, color: r.color };
}
function mapCamera(r: DbCamera): Camera {
  return { id: r.id, name: r.name, fov: r.fov };
}
function mapContainer(r: DbContainer): Container {
  return { id: r.id, name: r.name, parentId: r.parent_id, sceneStateId: r.scene_state_id, outputPathTemplate: r.output_path_template, sortOrder: r.sort_order, expanded: true };
}
function mapShot(r: DbShot): Shot {
  return { id: r.id, name: r.name, containerId: r.container_id, cameraId: r.camera_id, resolutionWidth: r.resolution_width, resolutionHeight: r.resolution_height, sceneStateId: r.scene_state_id, overrides: r.overrides || {}, outputPath: r.output_path, outputFormat: r.output_format, enabled: r.enabled, sortOrder: r.sort_order };
}

// Reverse mappers (client → DB)
function toDbShot(s: Shot): DbShot {
  return { id: s.id, name: s.name, container_id: s.containerId, camera_id: s.cameraId, resolution_width: s.resolutionWidth, resolution_height: s.resolutionHeight, scene_state_id: s.sceneStateId, overrides: s.overrides, output_path: s.outputPath, output_format: s.outputFormat, enabled: s.enabled, sort_order: s.sortOrder };
}
function toDbContainer(c: Container): Omit<DbContainer, 'expanded'> {
  return { id: c.id, name: c.name, parent_id: c.parentId, scene_state_id: c.sceneStateId, output_path_template: c.outputPathTemplate, sort_order: c.sortOrder };
}

interface FlowState {
  shots: Shot[];
  containers: Container[];
  sceneStates: SceneState[];
  cameras: Camera[];
  loading: boolean;
  error: string | null;

  // Selection
  selectedShotId: string | null;
  selectedContainerId: string | null;

  // Actions
  loadAll: () => Promise<void>;
  selectShot: (id: string | null) => void;
  selectContainer: (id: string | null) => void;
  toggleContainer: (id: string) => void;
  updateShot: (id: string, updates: Partial<Shot>) => Promise<void>;
  updateContainer: (id: string, updates: Partial<Container>) => Promise<void>;
  setOverride: (shotId: string, field: string, value: unknown) => Promise<void>;
  clearOverride: (shotId: string, field: string) => Promise<void>;

  // Resolvers
  getResolvedState: (shot: Shot) => SceneState;
  getShotsForContainer: (containerId: string) => Shot[];

  // Socket setup
  initSocket: () => void;
}

export const useFlowStore = create<FlowState>()((set, get) => ({
  shots: [],
  containers: [],
  sceneStates: [],
  cameras: [],
  loading: true,
  error: null,
  selectedShotId: null,
  selectedContainerId: null,

  loadAll: async () => {
    set({ loading: true, error: null });
    try {
      const [states, cams, ctrs, shots] = await Promise.all([
        api.fetchSceneStates(),
        api.fetchCameras(),
        api.fetchContainers(),
        api.fetchShots(),
      ]);
      set({
        sceneStates: states.map(mapState),
        cameras: cams.map(mapCamera),
        containers: ctrs.map(mapContainer),
        shots: shots.map(mapShot),
        loading: false,
      });
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load data' });
    }
  },

  selectShot: (id) => set({ selectedShotId: id, selectedContainerId: null }),
  selectContainer: (id) => set({ selectedContainerId: id, selectedShotId: null }),

  toggleContainer: (id) =>
    set((s) => ({
      containers: s.containers.map((c) => (c.id === id ? { ...c, expanded: !c.expanded } : c)),
    })),

  updateShot: async (id, updates) => {
    const shot = get().shots.find((s) => s.id === id);
    if (!shot) return;
    const merged = { ...shot, ...updates };
    // Optimistic update
    set((s) => ({ shots: s.shots.map((sh) => (sh.id === id ? merged : sh)) }));
    try {
      await api.updateShot(id, toDbShot(merged));
    } catch (err) {
      // Revert on failure
      set((s) => ({ shots: s.shots.map((sh) => (sh.id === id ? shot : sh)) }));
    }
  },

  updateContainer: async (id, updates) => {
    const ctr = get().containers.find((c) => c.id === id);
    if (!ctr) return;
    const merged = { ...ctr, ...updates };
    set((s) => ({ containers: s.containers.map((c) => (c.id === id ? merged : c)) }));
    try {
      await api.updateContainer(id, toDbContainer(merged));
    } catch (err) {
      set((s) => ({ containers: s.containers.map((c) => (c.id === id ? ctr : c)) }));
    }
  },

  setOverride: async (shotId, field, value) => {
    const shot = get().shots.find((s) => s.id === shotId);
    if (!shot) return;
    const updated = { ...shot, overrides: { ...shot.overrides, [field]: value } };
    set((s) => ({ shots: s.shots.map((sh) => (sh.id === shotId ? updated : sh)) }));
    try {
      await api.updateShot(shotId, toDbShot(updated));
    } catch (err) {
      set((s) => ({ shots: s.shots.map((sh) => (sh.id === shotId ? shot : sh)) }));
    }
  },

  clearOverride: async (shotId, field) => {
    const shot = get().shots.find((s) => s.id === shotId);
    if (!shot) return;
    const { [field]: _, ...rest } = shot.overrides;
    const updated = { ...shot, overrides: rest };
    set((s) => ({ shots: s.shots.map((sh) => (sh.id === shotId ? updated : sh)) }));
    try {
      await api.updateShot(shotId, toDbShot(updated));
    } catch (err) {
      set((s) => ({ shots: s.shots.map((sh) => (sh.id === shotId ? shot : sh)) }));
    }
  },

  getResolvedState: (shot) => {
    const { sceneStates, containers } = get();
    const container = containers.find((c) => c.id === shot.containerId);
    const stateId = shot.sceneStateId ?? container?.sceneStateId;
    const baseState = sceneStates.find((s) => s.id === stateId) ?? sceneStates[0];
    if (!baseState) return { id: '', name: '', environment: '', lighting: '', renderPasses: 0, noiseThreshold: 0, denoiser: '', layers: [], renderElements: [], color: 'teal' };
    // Apply overrides (map snake_case override keys to camelCase fields)
    const resolved = { ...baseState };
    if ('renderPasses' in shot.overrides) resolved.renderPasses = shot.overrides.renderPasses as number;
    if ('render_passes' in shot.overrides) resolved.renderPasses = shot.overrides.render_passes as number;
    if ('noiseThreshold' in shot.overrides) resolved.noiseThreshold = shot.overrides.noiseThreshold as number;
    if ('noise_threshold' in shot.overrides) resolved.noiseThreshold = shot.overrides.noise_threshold as number;
    if ('environment' in shot.overrides) resolved.environment = shot.overrides.environment as string;
    if ('lighting' in shot.overrides) resolved.lighting = shot.overrides.lighting as string;
    if ('denoiser' in shot.overrides) resolved.denoiser = shot.overrides.denoiser as string;
    if ('layers' in shot.overrides) resolved.layers = shot.overrides.layers as string[];
    if ('renderElements' in shot.overrides) resolved.renderElements = shot.overrides.renderElements as string[];
    if ('render_elements' in shot.overrides) resolved.renderElements = shot.overrides.render_elements as string[];
    return resolved;
  },

  getShotsForContainer: (containerId) => get().shots.filter((s) => s.containerId === containerId),

  initSocket: () => {
    const socket = getSocket();

    socket.on('shot:created', (row: DbShot) => {
      set((s) => ({ shots: [...s.shots.filter((sh) => sh.id !== row.id), mapShot(row)] }));
    });
    socket.on('shot:updated', (row: DbShot) => {
      set((s) => ({ shots: s.shots.map((sh) => (sh.id === row.id ? mapShot(row) : sh)) }));
    });
    socket.on('shot:deleted', ({ id }: { id: string }) => {
      set((s) => ({ shots: s.shots.filter((sh) => sh.id !== id) }));
    });

    socket.on('container:created', (row: DbContainer) => {
      set((s) => ({ containers: [...s.containers.filter((c) => c.id !== row.id), mapContainer(row)] }));
    });
    socket.on('container:updated', (row: DbContainer) => {
      set((s) => ({ containers: s.containers.map((c) => (c.id === row.id ? { ...mapContainer(row), expanded: c.expanded } : c)) }));
    });
    socket.on('container:deleted', ({ id }: { id: string }) => {
      set((s) => ({ containers: s.containers.filter((c) => c.id !== id) }));
    });

    socket.on('scene-state:created', (row: DbSceneState) => {
      set((s) => ({ sceneStates: [...s.sceneStates.filter((st) => st.id !== row.id), mapState(row)] }));
    });
    socket.on('scene-state:updated', (row: DbSceneState) => {
      set((s) => ({ sceneStates: s.sceneStates.map((st) => (st.id === row.id ? mapState(row) : st)) }));
    });
  },
}));
