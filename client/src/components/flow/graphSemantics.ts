import type { FlowEdge, FlowNode } from '@shared/types';

export interface FlowSemantics {
  edgeCameraCounts: Map<string, number>;
  edgeLabels: Map<string, string>;
  highlightedEdgeIds: Set<string>;
  highlightedNodeIds: Set<string>;
  selectedCameraNodeId: string | null;
  downstreamNodeIds: Set<string>;
  upstreamNodeIds: Set<string>;
}

function pushCameraToSet(map: Map<string, Set<string>>, key: string, cameraNodeId: string) {
  const existing = map.get(key);
  if (existing) {
    existing.add(cameraNodeId);
    return;
  }
  map.set(key, new Set([cameraNodeId]));
}

function parseHandleIndex(handleId?: string): number | null {
  if (!handleId) return null;
  const match = handleId.match(/-(\d+)$/);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function getEdgesForLane(edges: FlowEdge[], side: 'source' | 'target', lane: number | null) {
  if (lane === null) return edges;

  const matched = edges.filter((edge) => parseHandleIndex(side === 'source' ? edge.source_handle : edge.target_handle) === lane);
  if (matched.length > 0) return matched;

  const laneAgnostic = edges.filter((edge) => (side === 'source' ? edge.source_handle : edge.target_handle) == null);
  return laneAgnostic.length > 0 ? laneAgnostic : edges;
}

function summarizeLabels(labels: Set<string>, fallback: string) {
  const sorted = [...labels].filter(Boolean).sort((left, right) => left.localeCompare(right));
  if (sorted.length === 0) return fallback;
  if (sorted.length === 1) return sorted[0];
  return `${sorted[0]} +${sorted.length - 1}`;
}

function buildEdgeLabelMaps(flowNodes: FlowNode[], flowEdges: FlowEdge[]) {
  const nodesById = new Map(flowNodes.map((node) => [node.id, node]));
  const incomingEdges = new Map<string, FlowEdge[]>();

  for (const edge of flowEdges) {
    const bucket = incomingEdges.get(edge.target);
    if (bucket) {
      bucket.push(edge);
    } else {
      incomingEdges.set(edge.target, [edge]);
    }
  }

  const edgeLabels = new Map<string, string>();

  function collectUpstream(nodeId: string, lane: number | null, visited: Set<string>) {
    const visitKey = `${nodeId}:${lane ?? 'any'}`;
    if (visited.has(visitKey)) {
      return { cameraLabels: new Set<string>(), groupLabels: new Set<string>() };
    }
    visited.add(visitKey);

    const cameraLabels = new Set<string>();
    const groupLabels = new Set<string>();
    const node = nodesById.get(nodeId);

    if (node?.type === 'camera') {
      cameraLabels.add(node.label);
    }
    if (node?.type === 'group') {
      groupLabels.add(node.label);
    }

    const eligibleIncoming = getEdgesForLane(incomingEdges.get(nodeId) ?? [], 'target', lane);
    for (const edge of eligibleIncoming) {
      const upstreamLane = parseHandleIndex(edge.source_handle) ?? lane;
      const upstream = collectUpstream(edge.source, upstreamLane, visited);
      for (const label of upstream.cameraLabels) cameraLabels.add(label);
      for (const label of upstream.groupLabels) groupLabels.add(label);
    }

    return { cameraLabels, groupLabels };
  }

  for (const edge of flowEdges) {
    const lane = parseHandleIndex(edge.source_handle) ?? parseHandleIndex(edge.target_handle);
    const upstream = collectUpstream(edge.source, lane, new Set<string>());
    const label = upstream.groupLabels.size > 0
      ? summarizeLabels(upstream.groupLabels, summarizeLabels(upstream.cameraLabels, 'Merged path'))
      : summarizeLabels(upstream.cameraLabels, 'Path');
    edgeLabels.set(edge.id, label);
  }

  return edgeLabels;
}

export function getFlowSemantics(
  flowNodes: FlowNode[],
  flowEdges: FlowEdge[],
  selectedNodeId: string | null
): FlowSemantics {
  const nodesById = new Map(flowNodes.map((node) => [node.id, node]));
  const outgoingEdges = new Map<string, FlowEdge[]>();
  const incomingEdges = new Map<string, FlowEdge[]>();

  for (const edge of flowEdges) {
    if (!outgoingEdges.has(edge.source)) outgoingEdges.set(edge.source, []);
    if (!incomingEdges.has(edge.target)) incomingEdges.set(edge.target, []);
    outgoingEdges.get(edge.source)!.push(edge);
    incomingEdges.get(edge.target)!.push(edge);
  }

  const nodeCameraIds = new Map<string, Set<string>>();
  const edgeCameraIds = new Map<string, Set<string>>();
  const cameraNodes = flowNodes.filter((node) => node.type === 'camera');

  const walkCameraCoverage = (nodeId: string, lane: number | null, cameraNodeId: string, visited: Set<string>) => {
    const visitKey = `${nodeId}:${lane ?? 'any'}:${cameraNodeId}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);

    pushCameraToSet(nodeCameraIds, nodeId, cameraNodeId);

    for (const edge of getEdgesForLane(outgoingEdges.get(nodeId) ?? [], 'source', lane)) {
      pushCameraToSet(edgeCameraIds, edge.id, cameraNodeId);
      const nextLane = parseHandleIndex(edge.target_handle) ?? parseHandleIndex(edge.source_handle) ?? lane;
      if (nodesById.has(edge.target)) {
        walkCameraCoverage(edge.target, nextLane, cameraNodeId, visited);
      }
    }
  };

  for (const cameraNode of cameraNodes) {
    walkCameraCoverage(cameraNode.id, null, cameraNode.id, new Set<string>());
  }

  const downstreamNodeIds = new Set<string>();
  const upstreamNodeIds = new Set<string>();

  if (selectedNodeId) {
    const dq = [selectedNodeId];
    const dv = new Set<string>();
    while (dq.length > 0) {
      const nid = dq.shift()!;
      if (dv.has(nid)) continue;
      dv.add(nid);
      if (nid !== selectedNodeId) downstreamNodeIds.add(nid);
      for (const edge of outgoingEdges.get(nid) ?? []) {
        if (!dv.has(edge.target)) dq.push(edge.target);
      }
    }

    const uq = [selectedNodeId];
    const uv = new Set<string>();
    while (uq.length > 0) {
      const nid = uq.shift()!;
      if (uv.has(nid)) continue;
      uv.add(nid);
      if (nid !== selectedNodeId) upstreamNodeIds.add(nid);
      for (const edge of incomingEdges.get(nid) ?? []) {
        if (!uv.has(edge.source)) uq.push(edge.source);
      }
    }
  }

  const selectedNode = selectedNodeId ? nodesById.get(selectedNodeId) : null;
  const selectedCameraNodeId = selectedNode?.type === 'camera' ? selectedNode.id : null;
  const highlightedNodeIds = new Set<string>();
  const highlightedEdgeIds = new Set<string>();

  if (selectedCameraNodeId) {
    for (const [nodeId, cameraIds] of nodeCameraIds.entries()) {
      if (cameraIds.has(selectedCameraNodeId)) highlightedNodeIds.add(nodeId);
    }
    for (const [edgeId, cameraIds] of edgeCameraIds.entries()) {
      if (cameraIds.has(selectedCameraNodeId)) highlightedEdgeIds.add(edgeId);
    }
  } else if (selectedNodeId) {
    for (const nid of downstreamNodeIds) highlightedNodeIds.add(nid);
    for (const nid of upstreamNodeIds) highlightedNodeIds.add(nid);
    highlightedNodeIds.add(selectedNodeId);

    for (const edge of flowEdges) {
      if (highlightedNodeIds.has(edge.source) && highlightedNodeIds.has(edge.target)) {
        highlightedEdgeIds.add(edge.id);
      }
    }
  }

  const edgeCameraCounts = new Map<string, number>();
  for (const edge of flowEdges) {
    edgeCameraCounts.set(edge.id, edgeCameraIds.get(edge.id)?.size ?? 0);
  }

  return {
    edgeCameraCounts,
    edgeLabels: buildEdgeLabelMaps(flowNodes, flowEdges),
    highlightedEdgeIds,
    highlightedNodeIds,
    selectedCameraNodeId,
    downstreamNodeIds,
    upstreamNodeIds,
  };
}
