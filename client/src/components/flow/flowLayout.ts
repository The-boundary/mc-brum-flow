import dagre from 'dagre';
import { pipelineIndex, type FlowEdge, type FlowNode, type NodeType } from '@shared/types';

export interface NodeHandleLayout {
  inputHandleIds: string[];
  outputHandleIds: string[];
}

export interface FlowHandleLayout {
  nodeHandles: Map<string, NodeHandleLayout>;
  edgeHandles: Map<string, { sourceHandle?: string; targetHandle?: string }>;
}

// ── Edge Maps for O(1) lookups ──

export interface EdgeMaps {
  incoming: Map<string, FlowEdge[]>;
  outgoing: Map<string, FlowEdge[]>;
  nodesById: Map<string, FlowNode>;
}

export function buildEdgeMaps(flowNodes: FlowNode[], flowEdges: FlowEdge[]): EdgeMaps {
  const nodesById = new Map<string, FlowNode>(flowNodes.map((n) => [n.id, n]));
  const incoming = new Map<string, FlowEdge[]>();
  const outgoing = new Map<string, FlowEdge[]>();

  for (const edge of flowEdges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    if (!incoming.has(edge.target)) incoming.set(edge.target, []);
    outgoing.get(edge.source)!.push(edge);
    incoming.get(edge.target)!.push(edge);
  }

  return { incoming, outgoing, nodesById };
}

// ── Handle Layout ──

const INPUT_NODE_TYPES = new Set<NodeType>([
  'group',
  'lightSetup',
  'toneMapping',
  'layerSetup',
  'aspectRatio',
  'stageRev',
  'override',
  'deadline',
  'output',
]);

const OUTPUT_NODE_TYPES = new Set<NodeType>([
  'camera',
  'group',
  'lightSetup',
  'toneMapping',
  'layerSetup',
  'aspectRatio',
  'stageRev',
  'override',
  'deadline',
]);

function buildHandleIds(prefix: 'source' | 'target', count: number): string[] {
  return Array.from({ length: Math.max(1, count) }, (_value, index) => `${prefix}-${index}`);
}

function parseHandleIndex(handleId?: string): number | null {
  if (!handleId) return null;
  const match = handleId.match(/-(\d+)$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function compareEdgesByCounterpart(
  a: FlowEdge,
  b: FlowEdge,
  nodesById: Map<string, FlowNode>,
  direction: 'incoming' | 'outgoing'
): number {
  const aNode = nodesById.get(direction === 'incoming' ? a.source : a.target);
  const bNode = nodesById.get(direction === 'incoming' ? b.source : b.target);

  if (!aNode && !bNode) return a.id.localeCompare(b.id);
  if (!aNode) return 1;
  if (!bNode) return -1;

  if (aNode.position.y !== bNode.position.y) return aNode.position.y - bNode.position.y;
  if (aNode.position.x !== bNode.position.x) return aNode.position.x - bNode.position.x;
  return a.id.localeCompare(b.id);
}

export function getFlowHandleLayout(flowNodes: FlowNode[], flowEdges: FlowEdge[]): FlowHandleLayout {
  const edgeMaps = buildEdgeMaps(flowNodes, flowEdges);
  const nodeHandles = new Map<string, NodeHandleLayout>();
  const edgeHandles = new Map<string, { sourceHandle?: string; targetHandle?: string }>();

  for (const node of flowNodes) {
    const incoming = [...(edgeMaps.incoming.get(node.id) ?? [])].sort((a, b) =>
      compareEdgesByCounterpart(a, b, edgeMaps.nodesById, 'incoming')
    );
    const outgoing = [...(edgeMaps.outgoing.get(node.id) ?? [])].sort((a, b) =>
      compareEdgesByCounterpart(a, b, edgeMaps.nodesById, 'outgoing')
    );

    const channelCount = Math.max(incoming.length, outgoing.length, 1);
    const inputHandleIds = INPUT_NODE_TYPES.has(node.type) ? buildHandleIds('target', channelCount) : [];
    const outputHandleIds = OUTPUT_NODE_TYPES.has(node.type) ? buildHandleIds('source', channelCount) : [];

    nodeHandles.set(node.id, { inputHandleIds, outputHandleIds });

    // Track claimed handles to resolve conflicts (two edges claiming the same slot)
    const claimedInputs = new Set<string>();
    incoming.forEach((edge, index) => {
      const assignment = edgeHandles.get(edge.id) ?? {};
      const explicitIndex = parseHandleIndex(edge.target_handle);
      let handle = explicitIndex !== null
        ? inputHandleIds[explicitIndex] ?? inputHandleIds[index] ?? inputHandleIds[0]
        : inputHandleIds[index] ?? inputHandleIds[0];
      // Resolve conflict: if this handle is already claimed, fall back to position-based
      if (claimedInputs.has(handle) && inputHandleIds[index]) {
        handle = inputHandleIds[index];
      }
      claimedInputs.add(handle);
      assignment.targetHandle = handle;
      edgeHandles.set(edge.id, assignment);
    });

    const claimedOutputs = new Set<string>();
    outgoing.forEach((edge, index) => {
      const assignment = edgeHandles.get(edge.id) ?? {};
      const explicitIndex = parseHandleIndex(edge.source_handle);
      let handle = explicitIndex !== null
        ? outputHandleIds[explicitIndex] ?? outputHandleIds[index] ?? outputHandleIds[0]
        : outputHandleIds[index] ?? outputHandleIds[0];
      if (claimedOutputs.has(handle) && outputHandleIds[index]) {
        handle = outputHandleIds[index];
      }
      claimedOutputs.add(handle);
      assignment.sourceHandle = handle;
      edgeHandles.set(edge.id, assignment);
    });
  }

  return { nodeHandles, edgeHandles };
}

// ── Dagre Auto-Layout ──

const NODE_WIDTH = 180;
const NODE_HEIGHT = 60;

export function getAutoLayoutPositions(flowNodes: FlowNode[], flowEdges: FlowEdge[]): Record<string, { x: number; y: number }> {
  if (flowNodes.length === 0) return {};

  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: 'LR',
    nodesep: 60,
    ranksep: 70,
    marginx: 40,
    marginy: 40,
  });

  for (const node of flowNodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of flowEdges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of flowNodes) {
    const dagreNode = g.node(node.id);
    positions[node.id] = {
      x: dagreNode.x - NODE_WIDTH / 2,
      y: dagreNode.y - NODE_HEIGHT / 2,
    };
  }

  // Post-process: sort sibling nodes by their target_handle index so
  // nodes connecting to target-0 appear above nodes connecting to target-1.
  const siblingsByTarget = new Map<string, { nodeId: string; handleIndex: number }[]>();
  for (const edge of flowEdges) {
    const hi = parseHandleIndex(edge.target_handle);
    if (hi === null) continue;
    if (!siblingsByTarget.has(edge.target)) siblingsByTarget.set(edge.target, []);
    siblingsByTarget.get(edge.target)!.push({ nodeId: edge.source, handleIndex: hi });
  }

  for (const siblings of siblingsByTarget.values()) {
    if (siblings.length < 2) continue;
    // Collect current Y values, sort them ascending (top-first)
    const yValues = siblings.map((s) => positions[s.nodeId]?.y).filter((y): y is number => y != null);
    if (yValues.length !== siblings.length) continue;
    yValues.sort((a, b) => a - b);
    // Assign Y values by handle index order (lowest handle index gets lowest Y = highest on screen)
    siblings.sort((a, b) => a.handleIndex - b.handleIndex);
    siblings.forEach((s, i) => {
      positions[s.nodeId].y = yValues[i];
    });
  }

  return positions;
}

// ── Suggestion Helpers ──

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

function getAllowedTargetNodeTypes(sourceNodeId: string, flowNodes: FlowNode[], flowEdges: FlowEdge[]): NodeType[] {
  const edgeMaps = buildEdgeMaps(flowNodes, flowEdges);
  const sourceNode = edgeMaps.nodesById.get(sourceNodeId);
  if (!sourceNode) return [];

  if (sourceNode.type !== 'override') {
    return [...(DIRECT_CONNECTIONS[sourceNode.type] ?? [])];
  }

  const queue = [sourceNodeId];
  const visited = new Set<string>();
  const continuationTypes = new Set<NodeType>();

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);

    for (const edge of edgeMaps.incoming.get(nodeId) ?? []) {
      const upstreamNode = edgeMaps.nodesById.get(edge.source);
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

  return continuationTypes.size === 1 ? [...continuationTypes] : [];
}

export function getSuggestedNextNodeTypes(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
  sourceNodeId: string
): NodeType[] {
  return getAllowedTargetNodeTypes(sourceNodeId, flowNodes, flowEdges);
}

export function getSuggestedExistingTargetNodes(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
  sourceNodeId: string,
  validTypes: NodeType[]
): FlowNode[] {
  const edgeMaps = buildEdgeMaps(flowNodes, flowEdges);
  const allowedTypes = new Set(validTypes);
  const outgoing = edgeMaps.outgoing.get(sourceNodeId) ?? [];

  // If any outgoing edge has explicit handles, multi-handle routing is active.
  // In that case, don't exclude targets — they may accept another handle-specific edge.
  const hasHandleSpecificEdges = outgoing.some((e) => e.source_handle != null);

  const existingTargets = hasHandleSpecificEdges
    ? new Set<string>() // don't filter any
    : new Set(outgoing.map((e) => e.target));

  return flowNodes
    .filter((node) => node.id !== sourceNodeId)
    .filter((node) => allowedTypes.has(node.type))
    .filter((node) => !existingTargets.has(node.id))
    .sort((left, right) => {
      const leftStage = pipelineIndex(left.type);
      const rightStage = pipelineIndex(right.type);
      if (leftStage !== rightStage) return leftStage - rightStage;
      if (left.type !== right.type) return left.type.localeCompare(right.type);
      return left.label.localeCompare(right.label);
    });
}
