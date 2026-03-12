// shared/types/index.ts

// ── Database row types (snake_case, matching Postgres) ──

export interface Scene {
  id: string;
  name: string;
  file_path: string;
  instance_host: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Camera {
  id: string;
  scene_id: string;
  name: string;
  max_handle: number;
  max_class: string;
  created_at: string;
  updated_at: string;
}

export interface StudioDefault {
  id: string;
  category: string;
  settings: Record<string, unknown>;
  updated_at: string;
}

export type NodeType =
  | 'camera'
  | 'group'
  | 'lightSetup'
  | 'toneMapping'
  | 'layerSetup'
  | 'aspectRatio'
  | 'stageRev'
  | 'override'
  | 'deadline'
  | 'output';

export interface NodeConfig {
  id: string;
  node_type: NodeType;
  label: string;
  delta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  position: { x: number; y: number };
  config_id?: string;      // FK to node_configs.id (null for camera/group)
  camera_id?: string;      // FK to cameras.id (only for camera nodes)
  hide_previous?: boolean;  // only for group nodes
  enabled?: boolean;        // legacy output default, used as fallback for old graphs
  path_states?: Record<string, boolean>; // per-path output enablement keyed by resolved path
}

export interface FlowEdge {
  id: string;
  source: string;        // FlowNode.id
  target: string;        // FlowNode.id
  source_handle?: string;
  target_handle?: string;
}

export interface FlowConfig {
  id: string;
  scene_id: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: { x: number; y: number; zoom: number };
  updated_at: string;
}

export type MaxSyncStatus = 'idle' | 'queued' | 'syncing' | 'success' | 'error';

export interface MaxSyncState {
  scene_id: string;
  status: MaxSyncStatus;
  active_path_key: string | null;
  active_camera_name: string | null;
  last_synced_config: Record<string, unknown>;
  last_request_id: string | null;
  last_reason: string;
  last_error: string | null;
  last_synced_at: string | null;
  updated_at: string;
}

// ── Pipeline order (strict, all required) ──

export const PIPELINE_ORDER: NodeType[] = [
  'camera',
  'group',
  'lightSetup',
  'toneMapping',
  'layerSetup',
  'aspectRatio',
  'stageRev',
  'deadline',
  'output',
];

// Override can appear after any processing node
export const OVERRIDE_TYPE: NodeType = 'override';

// Returns the pipeline stage index for a node type (-1 for override)
export function pipelineIndex(type: NodeType): number {
  if (type === 'override') return -1;
  return PIPELINE_ORDER.indexOf(type);
}

// Check if a connection from sourceType to targetType is valid
export function isValidConnection(sourceType: NodeType, targetType: NodeType): boolean {
  if (targetType === 'override') return true; // override can follow anything
  if (sourceType === 'override') {
    // override outputs to the next stage after whatever it overrides
    return true; // validation happens contextually
  }
  const si = pipelineIndex(sourceType);
  const ti = pipelineIndex(targetType);
  if (si < 0 || ti < 0) return false;
  // group can connect to group (same stage) or next stages
  if (sourceType === 'group' && targetType === 'group') return true;
  return ti > si;
}
