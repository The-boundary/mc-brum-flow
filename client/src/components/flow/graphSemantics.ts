import type { FlowEdge, FlowNode } from '@shared/types';

export interface FlowSemantics {
  edgeCameraCounts: Map<string, number>;
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

  // Camera coverage
  const nodeCameraIds = new Map<string, Set<string>>();
  const edgeCameraIds = new Map<string, Set<string>>();
  const cameraNodes = flowNodes.filter((node) => node.type === 'camera');

  for (const cameraNode of cameraNodes) {
    const queue = [cameraNode.id];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);
      pushCameraToSet(nodeCameraIds, nodeId, cameraNode.id);

      for (const edge of outgoingEdges.get(nodeId) ?? []) {
        pushCameraToSet(edgeCameraIds, edge.id, cameraNode.id);
        if (!visited.has(edge.target) && nodesById.has(edge.target)) {
          queue.push(edge.target);
        }
      }
    }
  }

  // Downstream traversal from selected node
  const downstreamNodeIds = new Set<string>();
  const upstreamNodeIds = new Set<string>();

  if (selectedNodeId) {
    // Downstream BFS
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

    // Upstream BFS
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

  // Camera-based highlighting (when a camera node is selected)
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
    // Highlight the connected path from any selected node
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
    highlightedEdgeIds,
    highlightedNodeIds,
    selectedCameraNodeId,
    downstreamNodeIds,
    upstreamNodeIds,
  };
}
