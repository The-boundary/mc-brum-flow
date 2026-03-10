import { useCallback, useEffect, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Node,
  type Edge,
  type OnConnect,
  type NodeTypes,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useFlowStore } from '@/stores/flowStore';
import { AssetNode } from './nodes/AssetNode';
import { CameraNode } from './nodes/CameraNode';
import { SceneStateNode } from './nodes/SceneStateNode';
import { ResolutionNode } from './nodes/ResolutionNode';
import { OutputNode } from './nodes/OutputNode';

const nodeTypes: NodeTypes = {
  asset: AssetNode,
  camera: CameraNode,
  sceneState: SceneStateNode,
  resolution: ResolutionNode,
  output: OutputNode,
};

export function NodeFlowView() {
  const { shots, containers, cameras, sceneStates } = useFlowStore();

  // Build nodes and edges from data model
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = 0;

    // Asset nodes (left column) — one per shot
    shots.forEach((shot, i) => {
      const container = containers.find((c) => c.id === shot.containerId);
      nodes.push({
        id: `asset-${shot.id}`,
        type: 'asset',
        position: { x: 0, y: i * 120 },
        data: { label: shot.name, shotId: shot.id, containerName: container?.name ?? '' },
      });
    });

    // Camera nodes (second column) — deduplicated
    const usedCameraIds = [...new Set(shots.map((s) => s.cameraId))];
    usedCameraIds.forEach((camId, i) => {
      const cam = cameras.find((c) => c.id === camId);
      nodes.push({
        id: `camera-${camId}`,
        type: 'camera',
        position: { x: 300, y: i * 120 },
        data: { label: cam?.name ?? camId, cameraId: camId },
      });
    });

    // Scene State nodes (third column) — deduplicated
    const usedStateIds = [...new Set(containers.map((c) => c.sceneStateId))];
    usedStateIds.forEach((stateId, i) => {
      const state = sceneStates.find((s) => s.id === stateId);
      nodes.push({
        id: `state-${stateId}`,
        type: 'sceneState',
        position: { x: 600, y: i * 120 },
        data: { label: state?.name ?? stateId, stateId, color: state?.color ?? 'teal' },
      });
    });

    // Resolution nodes (fourth column) — deduplicated
    const resolutions = [...new Set(shots.map((s) => `${s.resolutionWidth}x${s.resolutionHeight}`))];
    resolutions.forEach((res, i) => {
      nodes.push({
        id: `res-${res}`,
        type: 'resolution',
        position: { x: 900, y: i * 120 },
        data: { label: res, resolution: res },
      });
    });

    // Output nodes (right column) — one per shot
    shots.forEach((shot, i) => {
      nodes.push({
        id: `output-${shot.id}`,
        type: 'output',
        position: { x: 1200, y: i * 120 },
        data: { label: `${shot.name}.${shot.outputFormat.toLowerCase()}`, shotId: shot.id, format: shot.outputFormat },
      });
    });

    // Edges: asset → camera
    shots.forEach((shot) => {
      edges.push({
        id: `e-asset-cam-${shot.id}`,
        source: `asset-${shot.id}`,
        target: `camera-${shot.cameraId}`,
        animated: true,
        style: { stroke: '#2b7a7c' },
      });
    });

    // Edges: camera → scene state (via container)
    shots.forEach((shot) => {
      const container = containers.find((c) => c.id === shot.containerId);
      const stateId = shot.sceneStateId ?? container?.sceneStateId;
      if (stateId) {
        edges.push({
          id: `e-cam-state-${shot.id}`,
          source: `camera-${shot.cameraId}`,
          target: `state-${stateId}`,
          style: { stroke: '#2b7a7c' },
        });
      }
    });

    // Edges: scene state → resolution
    shots.forEach((shot) => {
      const container = containers.find((c) => c.id === shot.containerId);
      const stateId = shot.sceneStateId ?? container?.sceneStateId;
      const res = `${shot.resolutionWidth}x${shot.resolutionHeight}`;
      if (stateId) {
        edges.push({
          id: `e-state-res-${shot.id}`,
          source: `state-${stateId}`,
          target: `res-${res}`,
          style: { stroke: '#2b7a7c' },
        });
      }
    });

    // Edges: resolution → output
    shots.forEach((shot) => {
      const res = `${shot.resolutionWidth}x${shot.resolutionHeight}`;
      edges.push({
        id: `e-res-out-${shot.id}`,
        source: `res-${res}`,
        target: `output-${shot.id}`,
        style: { stroke: '#2b7a7c' },
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [shots, containers, cameras, sceneStates]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when store data changes (useNodesState only reads initial value once)
  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges, setEdges]);

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, style: { stroke: '#5acfd9' } }, eds)),
    [setEdges]
  );

  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.2}
        maxZoom={2}
        snapToGrid
        snapGrid={[20, 20]}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(190 12% 20%)" />
        <Controls className="!bg-surface-200 !border-border !rounded-lg [&>button]:!bg-surface-300 [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-surface-400" />
        <MiniMap
          className="!bg-surface-100 !border-border !rounded-lg"
          nodeColor="hsl(185 63% 60%)"
          maskColor="rgba(0,0,0,0.5)"
        />
      </ReactFlow>
    </div>
  );
}
