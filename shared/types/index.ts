/** Scene State (preset) — stores everything EXCEPT camera and resolution */
export interface SceneState {
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
  created_at?: string;
  updated_at?: string;
}

/** Camera */
export interface Camera {
  id: string;
  name: string;
  fov?: number;
  created_at?: string;
}

/** Container — maps to disk folder */
export interface Container {
  id: string;
  name: string;
  parent_id: string | null;
  scene_state_id: string;
  output_path_template: string;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

/** Shot — a single render job */
export interface Shot {
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
  created_at?: string;
  updated_at?: string;
}

/** Flow config — stored positions/edges for the node graph view */
export interface FlowConfig {
  id: string;
  nodes: unknown[];
  edges: unknown[];
  viewport: { x: number; y: number; zoom: number } | null;
  updated_at?: string;
}
