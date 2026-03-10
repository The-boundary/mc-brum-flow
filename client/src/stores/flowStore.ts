import { create } from 'zustand';
import type { Shot, Container, SceneState, Camera } from '@/types/flow';

// Demo scene states
const DEMO_STATES: SceneState[] = [
  {
    id: 'state-day',
    name: 'Day',
    environment: 'Sun & Sky',
    lighting: 'Physical Sun',
    renderPasses: 20,
    noiseThreshold: 0.2,
    denoiser: 'Intel OIDN',
    layers: ['Background', 'Furniture', 'Props', 'Lighting'],
    renderElements: ['Beauty', 'Alpha', 'ZDepth', 'Normals'],
    color: 'amber',
  },
  {
    id: 'state-night',
    name: 'Night',
    environment: 'HDRI Studio',
    lighting: 'Area Lights',
    renderPasses: 40,
    noiseThreshold: 0.15,
    denoiser: 'Intel OIDN',
    layers: ['Background', 'Furniture', 'Props', 'Lighting', 'Emissive'],
    renderElements: ['Beauty', 'Alpha', 'ZDepth', 'Normals', 'LightMix'],
    color: 'blue',
  },
  {
    id: 'state-overcast',
    name: 'Overcast',
    environment: 'HDRI Overcast',
    lighting: 'HDRI Only',
    renderPasses: 25,
    noiseThreshold: 0.18,
    denoiser: 'Intel OIDN',
    layers: ['Background', 'Furniture', 'Props'],
    renderElements: ['Beauty', 'Alpha', 'ZDepth'],
    color: 'teal',
  },
];

// Demo cameras
const DEMO_CAMERAS: Camera[] = [
  { id: 'cam-1', name: 'CAM_Living_01', fov: 65 },
  { id: 'cam-2', name: 'CAM_Living_02', fov: 50 },
  { id: 'cam-3', name: 'CAM_Kitchen_01', fov: 75 },
  { id: 'cam-4', name: 'CAM_Bedroom_01', fov: 60 },
  { id: 'cam-5', name: 'CAM_Exterior_01', fov: 45 },
];

// Demo containers
const DEMO_CONTAINERS: Container[] = [
  { id: 'ctr-interior', name: 'Interior Shots', parentId: null, sceneStateId: 'state-day', outputPathTemplate: '/renders/interior/{shot}/', expanded: true },
  { id: 'ctr-exterior', name: 'Exterior Shots', parentId: null, sceneStateId: 'state-overcast', outputPathTemplate: '/renders/exterior/{shot}/', expanded: true },
  { id: 'ctr-night', name: 'Night Views', parentId: null, sceneStateId: 'state-night', outputPathTemplate: '/renders/night/{shot}/', expanded: false },
];

// Demo shots
const DEMO_SHOTS: Shot[] = [
  { id: 'shot-1', name: 'Living Room Wide', containerId: 'ctr-interior', cameraId: 'cam-1', resolutionWidth: 3840, resolutionHeight: 2160, sceneStateId: null, overrides: {}, outputPath: '/renders/interior/living_wide/', outputFormat: 'EXR', enabled: true },
  { id: 'shot-2', name: 'Living Room Detail', containerId: 'ctr-interior', cameraId: 'cam-2', resolutionWidth: 3840, resolutionHeight: 2160, sceneStateId: null, overrides: { renderPasses: 30 }, outputPath: '/renders/interior/living_detail/', outputFormat: 'EXR', enabled: true },
  { id: 'shot-3', name: 'Kitchen Overview', containerId: 'ctr-interior', cameraId: 'cam-3', resolutionWidth: 5120, resolutionHeight: 2880, sceneStateId: null, overrides: {}, outputPath: '/renders/interior/kitchen/', outputFormat: 'EXR', enabled: true },
  { id: 'shot-4', name: 'Bedroom Closeup', containerId: 'ctr-interior', cameraId: 'cam-4', resolutionWidth: 3840, resolutionHeight: 2160, sceneStateId: null, overrides: { noiseThreshold: 0.1 }, outputPath: '/renders/interior/bedroom/', outputFormat: 'PNG', enabled: true },
  { id: 'shot-5', name: 'Front Facade', containerId: 'ctr-exterior', cameraId: 'cam-5', resolutionWidth: 5120, resolutionHeight: 2880, sceneStateId: null, overrides: {}, outputPath: '/renders/exterior/facade/', outputFormat: 'EXR', enabled: true },
  { id: 'shot-6', name: 'Garden View', containerId: 'ctr-exterior', cameraId: 'cam-1', resolutionWidth: 3840, resolutionHeight: 2160, sceneStateId: null, overrides: { environment: 'Sun & Sky' }, outputPath: '/renders/exterior/garden/', outputFormat: 'EXR', enabled: true },
  { id: 'shot-7', name: 'Night Exterior', containerId: 'ctr-night', cameraId: 'cam-5', resolutionWidth: 3840, resolutionHeight: 2160, sceneStateId: null, overrides: {}, outputPath: '/renders/night/exterior/', outputFormat: 'EXR', enabled: true },
  { id: 'shot-8', name: 'Night Living', containerId: 'ctr-night', cameraId: 'cam-1', resolutionWidth: 3840, resolutionHeight: 2160, sceneStateId: null, overrides: { renderPasses: 60 }, outputPath: '/renders/night/living/', outputFormat: 'EXR', enabled: true },
];

interface FlowState {
  shots: Shot[];
  containers: Container[];
  sceneStates: SceneState[];
  cameras: Camera[];

  // Selection
  selectedShotId: string | null;
  selectedContainerId: string | null;

  // Actions
  selectShot: (id: string | null) => void;
  selectContainer: (id: string | null) => void;
  toggleContainer: (id: string) => void;
  updateShot: (id: string, updates: Partial<Shot>) => void;
  updateContainer: (id: string, updates: Partial<Container>) => void;
  setOverride: (shotId: string, field: string, value: unknown) => void;
  clearOverride: (shotId: string, field: string) => void;

  // Resolvers
  getResolvedState: (shot: Shot) => SceneState;
  getShotsForContainer: (containerId: string) => Shot[];
}

export const useFlowStore = create<FlowState>()((set, get) => ({
  shots: DEMO_SHOTS,
  containers: DEMO_CONTAINERS,
  sceneStates: DEMO_STATES,
  cameras: DEMO_CAMERAS,

  selectedShotId: null,
  selectedContainerId: null,

  selectShot: (id) => set({ selectedShotId: id, selectedContainerId: null }),
  selectContainer: (id) => set({ selectedContainerId: id, selectedShotId: null }),

  toggleContainer: (id) =>
    set((s) => ({
      containers: s.containers.map((c) =>
        c.id === id ? { ...c, expanded: !c.expanded } : c
      ),
    })),

  updateShot: (id, updates) =>
    set((s) => ({
      shots: s.shots.map((shot) =>
        shot.id === id ? { ...shot, ...updates } : shot
      ),
    })),

  updateContainer: (id, updates) =>
    set((s) => ({
      containers: s.containers.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  setOverride: (shotId, field, value) =>
    set((s) => ({
      shots: s.shots.map((shot) =>
        shot.id === shotId
          ? { ...shot, overrides: { ...shot.overrides, [field]: value } }
          : shot
      ),
    })),

  clearOverride: (shotId, field) =>
    set((s) => ({
      shots: s.shots.map((shot) => {
        if (shot.id !== shotId) return shot;
        const { [field]: _, ...rest } = shot.overrides as Record<string, unknown>;
        return { ...shot, overrides: rest };
      }),
    })),

  getResolvedState: (shot) => {
    const { sceneStates, containers } = get();
    const container = containers.find((c) => c.id === shot.containerId);
    const stateId = shot.sceneStateId ?? container?.sceneStateId;
    const baseState = sceneStates.find((s) => s.id === stateId) ?? sceneStates[0];
    return { ...baseState, ...shot.overrides } as SceneState;
  },

  getShotsForContainer: (containerId) => {
    return get().shots.filter((s) => s.containerId === containerId);
  },
}));
