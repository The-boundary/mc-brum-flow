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

    const inputHandleIds = INPUT_NODE_TYPES.has(node.type) ? buildHandleIds('target', incoming.length) : [];
    const outputHandleIds = OUTPUT_NODE_TYPES.has(node.type) ? buildHandleIds('source', outgoing.length) : [];

    nodeHandles.set(node.id, { inputHandleIds, outputHandleIds });

    incoming.forEach((edge, index) => {
      const assignment = edgeHandles.get(edge.id) ?? {};
      assignment.targetHandle = inputHandleIds[index] ?? inputHandleIds[0];
      edgeHandles.set(edge.id, assignment);
    });

    outgoing.forEach((edge, index) => {
      const assignment = edgeHandles.get(edge.id) ?? {};
      assignment.sourceHandle = outputHandleIds[index] ?? outputHandleIds[0];
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
    ranksep: 140,
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

  return positions;
}

// ── Suggestion Helpers ──

const NEXT_STAGE_BY_TYPE: Partial<Record<NodeType, NodeType>> = {
  camera: 'lightSetup',
  group: 'lightSetup',
  lightSetup: 'toneMapping',
  toneMapping: 'layerSetup',
  layerSetup: 'aspectRatio',
  aspectRatio: 'stageRev',
  stageRev: 'deadline',
  deadline: 'output',
};

function getOverrideContinuationType(
  nodesById: Map<string, FlowNode>,
  incoming: Map<string, FlowEdge[]>,
  sourceNodeId: string
): NodeType | null {
  const queue = [sourceNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    if (visited.has(nodeId)) continue;
    visited.add(nodeId);

    for (const edge of incoming.get(nodeId) ?? []) {
      const upstreamNode = nodesById.get(edge.source);
      if (!upstreamNode) continue;
      if (upstreamNode.type === 'override' || upstreamNode.type === 'group') {
        queue.push(upstreamNode.id);
        continue;
      }
      return NEXT_STAGE_BY_TYPE[upstreamNode.type] ?? null;
    }
  }

  return null;
}

export function getSuggestedNextNodeTypes(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
  sourceNodeId: string
): NodeType[] {
  const edgeMaps = buildEdgeMaps(flowNodes, flowEdges);
  const sourceNode = edgeMaps.nodesById.get(sourceNodeId);
  if (!sourceNode) return [];

  if (sourceNode.type === 'camera' || sourceNode.type === 'group') {
    return ['group', 'lightSetup'];
  }

  if (sourceNode.type === 'override') {
    const continuationType = getOverrideContinuationType(edgeMaps.nodesById, edgeMaps.incoming, sourceNodeId);
    return continuationType ? [continuationType] : [];
  }

  const nextStageType = NEXT_STAGE_BY_TYPE[sourceNode.type];
  return nextStageType ? [nextStageType] : [];
}

export function getSuggestedExistingTargetNodes(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
  sourceNodeId: string,
  validTypes: NodeType[]
): FlowNode[] {
  const edgeMaps = buildEdgeMaps(flowNodes, flowEdges);
  const allowedTypes = new Set(validTypes);
  const existingTargets = new Set(
    (edgeMaps.outgoing.get(sourceNodeId) ?? []).map((e) => e.target)
  );

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
