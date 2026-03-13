/**
 * flowGraphStore.ts
 *
 * Owns the flow graph structure: nodes, edges, viewport, selection.
 * Extracted from flowStore as part of the store decomposition.
 *
 * Mutations that affect the persisted graph call scheduleStoreSave via
 * the flowCoordinator, which debounces saves and optionally re-resolves
 * output paths.
 */

import { create } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { getFlowHandleLayout } from '@/components/flow/flowLayout';
import type { FlowNode, FlowEdge, NodeType } from '@shared/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let nextNodeId = 1;

export function genNodeId(): string {
  return `node_${Date.now()}_${nextNodeId++}`;
}

export function areSerializedValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function normalizeFlowEdges(flowNodes: FlowNode[], flowEdges: FlowEdge[]) {
  const layout = getFlowHandleLayout(flowNodes, flowEdges);
  return flowEdges.map((edge) => {
    const assigned = layout.edgeHandles.get(edge.id);
    return {
      ...edge,
      source_handle: assigned?.sourceHandle ?? edge.source_handle,
      target_handle: assigned?.targetHandle ?? edge.target_handle,
    };
  });
}

// ---------------------------------------------------------------------------
// Connection validation helpers
// ---------------------------------------------------------------------------

const DIRECT_CONNECTIONS: Record<NodeType, NodeType[]> = {
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

const OVERRIDABLE_SOURCE_TYPES = new Set<NodeType>([
  'lightSetup',
  'toneMapping',
  'layerSetup',
  'aspectRatio',
  'stageRev',
]);

function getNextPipelineType(type: NodeType): NodeType | null {
  return (DIRECT_CONNECTIONS[type] ?? []).find((targetType) => targetType !== 'override') ?? null;
}

function isValidFlowConnection(sourceNodeId: string, targetNodeId: string, flowNodes: FlowNode[], flowEdges: FlowEdge[]) {
  if (sourceNodeId === targetNodeId) return false;

  const nodesById = new Map(flowNodes.map((node) => [node.id, node]));
  const sourceNode = nodesById.get(sourceNodeId);
  const targetNode = nodesById.get(targetNodeId);
  if (!sourceNode || !targetNode) return false;

  if (sourceNode.type !== 'override') {
    return (DIRECT_CONNECTIONS[sourceNode.type] ?? []).includes(targetNode.type);
  }

  const incoming = new Map<string, FlowEdge[]>();
  for (const edge of flowEdges) {
    const existing = incoming.get(edge.target);
    if (existing) {
      existing.push(edge);
    } else {
      incoming.set(edge.target, [edge]);
    }
  }

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

      if (upstreamNode.type === 'override') {
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

  return continuationTypes.size === 1 && continuationTypes.has(targetNode.type);
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface FlowGraphState {
  // Data
  flowNodes: FlowNode[];
  flowEdges: FlowEdge[];
  viewport: { x: number; y: number; zoom: number };

  // Selection
  selectedNodeId: string | null;
  selectedNodeIds: string[];

  // Actions
  selectNode: (id: string | null) => void;
  setSelectedNodeIds: (ids: string[]) => void;
  addNode: (type: NodeType, position: { x: number; y: number }, configId?: string, cameraId?: string) => void;
  removeNode: (id: string) => void;
  removeNodes: (ids: string[]) => void;
  addEdge: (source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null) => boolean;
  removeEdge: (id: string) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  applyNodeLayout: (positions: Record<string, { x: number; y: number }>) => void;
  updateViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  updateNodeLabel: (id: string, label: string) => void;
  toggleHidePrevious: (id: string) => void;
}

// ---------------------------------------------------------------------------
// scheduleStoreSave bridge
// ---------------------------------------------------------------------------

// Late-binding bridge to avoid circular imports.
// flowCoordinator calls `bindGraphStoreSave` at module init to wire up
// the save/resolve functions. Until bound, mutations are fire-and-forget
// (which is fine — during the migration, all mutations flow through the
// monolith flowStore which has its own scheduleStoreSave).
type SaveBridge = (needsResolve: boolean) => void;
let _saveBridge: SaveBridge | null = null;

export function bindGraphStoreSave(bridge: SaveBridge) {
  _saveBridge = bridge;
}

function scheduleSave(needsResolve = false) {
  _saveBridge?.(needsResolve);
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useFlowGraphStore = create<FlowGraphState>()((set, get) => ({
  flowNodes: [],
  flowEdges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeId: null,
  selectedNodeIds: [],

  selectNode: (id) => set({ selectedNodeId: id }),
  setSelectedNodeIds: (ids) => set({ selectedNodeIds: ids }),

  addNode: (type, position, configId, cameraId) => {
    const id = genNodeId();
    const defaultLabels: Record<NodeType, string> = {
      camera: 'Camera',
      group: 'Group',
      lightSetup: 'Light Setup',
      toneMapping: 'Tone Mapping',
      layerSetup: 'Layer Setup',
      aspectRatio: 'Aspect Ratio',
      stageRev: 'Stage Rev',
      override: 'Override',
      deadline: 'Deadline',
      output: 'Output',
    };
    const node: FlowNode = {
      id,
      type,
      label: defaultLabels[type],
      position,
      ...(configId && { config_id: configId }),
      ...(cameraId && { camera_id: cameraId }),
      ...(type === 'output' && { enabled: true }),
      ...(type === 'group' && { hide_previous: false }),
    };
    set((s) => ({ flowNodes: [...s.flowNodes, node], selectedNodeId: id }));
    scheduleSave(true);
  },

  removeNode: (id) => {
    set((s) => ({
      flowNodes: s.flowNodes.filter((n) => n.id !== id),
      flowEdges: s.flowEdges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
    scheduleSave(true);
  },

  removeNodes: (ids) => {
    const idSet = new Set(ids);
    set((s) => ({
      flowNodes: s.flowNodes.filter((n) => !idSet.has(n.id)),
      flowEdges: s.flowEdges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
      selectedNodeId: s.selectedNodeId && idSet.has(s.selectedNodeId) ? null : s.selectedNodeId,
      selectedNodeIds: s.selectedNodeIds.filter((id) => !idSet.has(id)),
    }));
    scheduleSave(true);
  },

  addEdge: (source, target, sourceHandle, targetHandle) => {
    const { flowNodes, flowEdges } = get();
    const sourceNode = flowNodes.find((n) => n.id === source);
    const targetNode = flowNodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) return false;
    if (!isValidFlowConnection(source, target, flowNodes, flowEdges)) return false;

    // Normalize handles for comparison — treat null/undefined/missing consistently
    const sh = sourceHandle ?? undefined;
    const th = targetHandle ?? undefined;

    // Prevent duplicate edges: same source, target, AND handle pair.
    if (flowEdges.some((e) =>
      e.source === source &&
      e.target === target &&
      (e.source_handle ?? undefined) === sh &&
      (e.target_handle ?? undefined) === th
    )) {
      return false;
    }

    // Also prevent creating a no-handle edge when a handle-specific edge
    // already exists between the same source/target (and vice versa)
    if (!sh && !th && flowEdges.some((e) => e.source === source && e.target === target)) {
      return false;
    }

    // Build unique edge ID including handle info when present
    const handleSuffix = sh || th
      ? `_${sh ?? 'any'}_${th ?? 'any'}`
      : '';
    const baseId = `edge_${source}_${target}${handleSuffix}`;
    // Ensure uniqueness even if handle suffix collides (unlikely but safe)
    const idExists = flowEdges.some((e) => e.id === baseId);
    const edgeId = idExists ? `${baseId}_${Date.now()}` : baseId;

    const edge: FlowEdge = {
      id: edgeId,
      source,
      target,
      ...(sh && { source_handle: sh }),
      ...(th && { target_handle: th }),
    };

    // Add the new edge, then propagate lanes through downstream passthrough nodes
    set((s) => {
      let edges = [...s.flowEdges, edge];

      // Passthrough nodes: when inputs > outputs, auto-create matching output edges
      const PASSTHROUGH_TYPES = new Set<NodeType>([
        'group', 'lightSetup', 'toneMapping', 'layerSetup',
        'aspectRatio', 'stageRev', 'override', 'deadline',
      ]);

      const visited = new Set<string>();
      const queue = [target];

      while (queue.length > 0) {
        const nodeId = queue.shift()!;
        if (visited.has(nodeId)) continue;
        visited.add(nodeId);

        const node = s.flowNodes.find((n) => n.id === nodeId);
        if (!node || !PASSTHROUGH_TYPES.has(node.type)) continue;

        const incomingCount = edges.filter((e) => e.target === nodeId).length;
        const outgoing = edges.filter((e) => e.source === nodeId);
        const outgoingCount = outgoing.length;

        if (outgoingCount > 0 && outgoingCount < incomingCount) {
          // Find the max existing source handle index
          let maxSourceIdx = -1;
          for (const e of outgoing) {
            const m = e.source_handle?.match(/-(\d+)$/);
            if (m) maxSourceIdx = Math.max(maxSourceIdx, Number.parseInt(m[1], 10));
          }

          // Get unique downstream targets to replicate edges to
          const downstreamTargets = [...new Set(outgoing.map((e) => e.target))];
          const needed = incomingCount - outgoingCount;

          for (let i = 0; i < needed; i++) {
            for (const dt of downstreamTargets) {
              const dtIncoming = edges.filter((e) => e.target === dt);
              let maxTargetIdx = -1;
              for (const e of dtIncoming) {
                const m = e.target_handle?.match(/-(\d+)$/);
                if (m) maxTargetIdx = Math.max(maxTargetIdx, Number.parseInt(m[1], 10));
              }

              const newSh = `source-${maxSourceIdx + 1 + i}`;
              const newTh = `target-${maxTargetIdx + 1 + i}`;
              const newEdgeId = `edge_${nodeId}_${dt}_${newSh}_${newTh}`;

              if (!edges.some((e) => e.id === newEdgeId)) {
                edges = [...edges, {
                  id: newEdgeId,
                  source: nodeId,
                  target: dt,
                  source_handle: newSh,
                  target_handle: newTh,
                }];
                // Continue propagation to the downstream node
                queue.push(dt);
              }
            }
          }
        }
      }

      return { flowEdges: edges };
    });

    scheduleSave(true);
    return true;
  },

  removeEdge: (id) => {
    set((s) => ({ flowEdges: s.flowEdges.filter((e) => e.id !== id) }));
    scheduleSave(true);
  },

  updateNodePosition: (id, position) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((n) => (n.id === id ? { ...n, position } : n)),
    }));
    scheduleSave();
  },

  applyNodeLayout: (positions) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((node) => {
        const nextPosition = positions[node.id];
        return nextPosition ? { ...node, position: nextPosition } : node;
      }),
    }));
    scheduleSave();
  },

  updateViewport: (viewport) => {
    set({ viewport });
    scheduleSave();
  },

  updateNodeLabel: (id, label) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((n) => (n.id === id ? { ...n, label } : n)),
    }));
    scheduleSave(true);
  },

  toggleHidePrevious: (id) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((n) =>
        n.id === id && n.type === 'group' ? { ...n, hide_previous: !n.hide_previous } : n
      ),
    }));
    scheduleSave(true);
  },
}));

// ---------------------------------------------------------------------------
// Selector hook: subscribe to a single flow node by ID
// ---------------------------------------------------------------------------

export function useFlowNode(nodeId: string): FlowNode | undefined {
  return useFlowGraphStore(
    useShallow((s) => s.flowNodes.find((n) => n.id === nodeId)),
  );
}
