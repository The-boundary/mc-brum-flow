import type { FlowEdge, FlowNode } from '@shared/types';

interface FlowSemantics {
  edgeCameraCounts: Map<string, number>;
  highlightedEdgeIds: Set<string>;
  highlightedNodeIds: Set<string>;
  selectedCameraNodeId: string | null;
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

  for (const edge of flowEdges) {
    const bucket = outgoingEdges.get(edge.source);
    if (bucket) {
      bucket.push(edge);
      continue;
    }
    outgoingEdges.set(edge.source, [edge]);
  }

  const nodeCameraIds = new Map<string, Set<string>>();
  const edgeCameraIds = new Map<string, Set<string>>();
  const cameraNodes = flowNodes.filter((node) => node.type === 'camera');

  for (const cameraNode of cameraNodes) {
    const queue = [cameraNode.id];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const nodeId = queue.shift();
      if (!nodeId || visited.has(nodeId)) continue;

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
  };
}
