import type { FlowEdge, FlowNode, NodeType } from '@shared/types';

export interface NodeHandleLayout {
  inputHandleIds: string[];
  outputHandleIds: string[];
}

export interface FlowHandleLayout {
  nodeHandles: Map<string, NodeHandleLayout>;
  edgeHandles: Map<string, { sourceHandle?: string; targetHandle?: string }>;
}

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

function buildIncomingEdgeMap(flowEdges: FlowEdge[]): Map<string, FlowEdge[]> {
  const incomingEdges = new Map<string, FlowEdge[]>();

  for (const edge of flowEdges) {
    const bucket = incomingEdges.get(edge.target);
    if (bucket) {
      bucket.push(edge);
      continue;
    }

    incomingEdges.set(edge.target, [edge]);
  }

  return incomingEdges;
}

export function getFlowHandleLayout(flowNodes: FlowNode[], flowEdges: FlowEdge[]): FlowHandleLayout {
  const nodesById = new Map(flowNodes.map((node) => [node.id, node]));
  const outgoingEdges = new Map<string, FlowEdge[]>();
  const incomingEdges = buildIncomingEdgeMap(flowEdges);
  const nodeHandles = new Map<string, NodeHandleLayout>();
  const edgeHandles = new Map<string, { sourceHandle?: string; targetHandle?: string }>();

  for (const edge of flowEdges) {
    const bucket = outgoingEdges.get(edge.source);
    if (bucket) {
      bucket.push(edge);
      continue;
    }

    outgoingEdges.set(edge.source, [edge]);
  }

  for (const node of flowNodes) {
    const incoming = [...(incomingEdges.get(node.id) ?? [])].sort((a, b) =>
      compareEdgesByCounterpart(a, b, nodesById, 'incoming')
    );
    const outgoing = [...(outgoingEdges.get(node.id) ?? [])].sort((a, b) =>
      compareEdgesByCounterpart(a, b, nodesById, 'outgoing')
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

  return {
    nodeHandles,
    edgeHandles,
  };
}

function getOverrideContinuationType(
  nodesById: Map<string, FlowNode>,
  incomingEdges: Map<string, FlowEdge[]>,
  sourceNodeId: string
): NodeType | null {
  const queue = [sourceNodeId];
  const visited = new Set<string>();

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;

    visited.add(nodeId);

    for (const edge of incomingEdges.get(nodeId) ?? []) {
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
  const nodesById = new Map(flowNodes.map((node) => [node.id, node]));
  const sourceNode = nodesById.get(sourceNodeId);

  if (!sourceNode) return [];

  if (sourceNode.type === 'camera' || sourceNode.type === 'group') {
    return ['group', 'lightSetup'];
  }

  if (sourceNode.type === 'override') {
    const continuationType = getOverrideContinuationType(
      nodesById,
      buildIncomingEdgeMap(flowEdges),
      sourceNodeId
    );

    return continuationType ? [continuationType] : [];
  }

  const nextStageType = NEXT_STAGE_BY_TYPE[sourceNode.type];
  return nextStageType ? [nextStageType] : [];
}
