/** Scene State (preset) — stores everything EXCEPT camera and resolution */
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
  color: string; // badge color hint: 'amber' | 'blue' | 'teal' | 'purple' etc.
}

/** Camera */
export interface Camera {
  id: string;
  name: string;
  fov?: number;
}

/** A single render shot */
export interface Shot {
  id: string;
  name: string;
  containerId: string;
  cameraId: string;
  resolutionWidth: number;
  resolutionHeight: number;
  sceneStateId: string | null; // null = inherit from container
  /** Per-shot overrides — only stores fields the user explicitly overridden */
  overrides: Partial<Pick<SceneState, 'environment' | 'lighting' | 'renderPasses' | 'noiseThreshold' | 'denoiser' | 'layers' | 'renderElements'>>;
  outputPath: string;
  outputFormat: string;
  enabled: boolean;
}

/** Container = disk folder group */
export interface Container {
  id: string;
  name: string;
  parentId: string | null; // null = root
  sceneStateId: string;
  outputPathTemplate: string;
  expanded: boolean;
}

/** Resolved shot — with inherited values filled in */
export interface ResolvedShot extends Shot {
  resolvedState: SceneState;
  cameraName: string;
  containerName: string;
}

// ── Node Flow types ──

export type FlowNodeType = 'asset' | 'camera' | 'sceneState' | 'layers' | 'resolution' | 'output';

export interface FlowNodeData {
  type: FlowNodeType;
  label: string;
  entityId: string; // reference to Shot.id, Camera.id, SceneState.id, etc.
  config?: Record<string, unknown>;
}
