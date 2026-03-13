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

export const DIRECT_CONNECTIONS: Record<NodeType, NodeType[]> = {
  camera: ['group', 'lightSetup'],
  group: ['group', 'lightSetup'],
  lightSetup: ['override', 'toneMapping'],
  toneMapping: ['override', 'layerSetup'],
  layerSetup: ['override', 'aspectRatio'],
  aspectRatio: ['override', 'stageRev'],
  stageRev: ['override', 'deadline'],
  override: [],
  deadline: ['output'],
  output: [],
};

export const OVERRIDABLE_SOURCE_TYPES = new Set<NodeType>([
  'lightSetup',
  'toneMapping',
  'layerSetup',
  'aspectRatio',
  'stageRev',
]);

export function parseHandleIndex(handleId?: string): number | null {
  if (!handleId) return null;
  const match = handleId.match(/-(\d+)$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

// Returns the pipeline stage index for a node type (-1 for override)
export function pipelineIndex(type: NodeType): number {
  if (type === 'override') return -1;
  return PIPELINE_ORDER.indexOf(type);
}

function getNextPipelineType(type: NodeType): NodeType | null {
  const allowedTargets = DIRECT_CONNECTIONS[type] ?? [];
  return allowedTargets.find((targetType) => targetType !== OVERRIDE_TYPE) ?? null;
}

function getIncomingEdges(flowEdges: FlowEdge[]) {
  const incoming = new Map<string, FlowEdge[]>();

  for (const edge of flowEdges) {
    const existing = incoming.get(edge.target);
    if (existing) {
      existing.push(edge);
    } else {
      incoming.set(edge.target, [edge]);
    }
  }

  return incoming;
}

function getOverrideBaseType(sourceNodeId: string, flowNodes: FlowNode[], flowEdges: FlowEdge[]): NodeType | null {
  const nodesById = new Map(flowNodes.map((node) => [node.id, node]));
  const incoming = getIncomingEdges(flowEdges);
  const queue = [sourceNodeId];
  const visited = new Set<string>();
  const continuationTypes = new Set<NodeType>();

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);

    for (const edge of incoming.get(nodeId) ?? []) {
      const upstreamNode = nodesById.get(edge.source);
      if (!upstreamNode) continue;

      if (upstreamNode.type === OVERRIDE_TYPE) {
        queue.push(upstreamNode.id);
        continue;
      }

      if (!OVERRIDABLE_SOURCE_TYPES.has(upstreamNode.type)) {
        continue;
      }

      const nextType = getNextPipelineType(upstreamNode.type);
      if (nextType) {
        continuationTypes.add(nextType);
      }
    }
  }

  if (continuationTypes.size !== 1) {
    return null;
  }

  return [...continuationTypes][0] ?? null;
}

export function getAllowedTargetNodeTypes(sourceNodeId: string, flowNodes: FlowNode[], flowEdges: FlowEdge[]): NodeType[] {
  const sourceNode = flowNodes.find((node) => node.id === sourceNodeId);
  if (!sourceNode) return [];

  if (sourceNode.type === OVERRIDE_TYPE) {
    const continuationType = getOverrideBaseType(sourceNodeId, flowNodes, flowEdges);
    return continuationType ? [continuationType] : [];
  }

  return [...(DIRECT_CONNECTIONS[sourceNode.type] ?? [])];
}

export function isValidConnection(sourceType: NodeType, targetType: NodeType): boolean {
  return (DIRECT_CONNECTIONS[sourceType] ?? []).includes(targetType);
}

export function isValidFlowConnection(
  sourceNodeId: string,
  targetNodeId: string,
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
): boolean {
  if (sourceNodeId === targetNodeId) return false;

  const targetNode = flowNodes.find((node) => node.id === targetNodeId);
  if (!targetNode) return false;

  return getAllowedTargetNodeTypes(sourceNodeId, flowNodes, flowEdges).includes(targetNode.type);
}
