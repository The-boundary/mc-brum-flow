import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Box, Camera, Palette, Maximize2, FileOutput } from 'lucide-react';

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

const EDGE_DIM = '#1c3a3b';
const EDGE_DEFAULT = '#2b7a7c';
const EDGE_HIGHLIGHT = '#5acfd9';

interface ContextMenuState {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
}

const CONTEXT_MENU_ITEMS = [
  { key: 'shot', label: 'Add Shot', icon: Box },
  { key: 'camera', label: 'Add Camera', icon: Camera },
  { key: 'sceneState', label: 'Add Scene State', icon: Palette },
  { key: 'resolution', label: 'Add Resolution', icon: Maximize2 },
  { key: 'output', label: 'Add Output', icon: FileOutput },
];

export function NodeFlowView() {
  const { shots, containers, cameras, sceneStates, selectedShotId, selectNode } = useFlowStore();
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);

  // Build the set of node IDs in the selected shot's pipe
  const selectedPipeNodeIds = useMemo(() => {
    if (!selectedShotId) return new Set<string>();
    const shot = shots.find((s) => s.id === selectedShotId);
    if (!shot) return new Set<string>();
    const container = containers.find((c) => c.id === shot.containerId);
    const stateId = shot.sceneStateId ?? container?.sceneStateId;
    const res = `${shot.resolutionWidth}x${shot.resolutionHeight}`;
    const ids = new Set<string>();
    ids.add(`asset-${shot.id}`);
    ids.add(`camera-${shot.cameraId}`);
    if (stateId) ids.add(`state-${stateId}`);
    ids.add(`res-${res}`);
    ids.add(`output-${shot.id}`);
    return ids;
  }, [selectedShotId, shots, containers]);

  // Build nodes and edges from data model
  const { initialNodes, initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Asset nodes (left column) — one per shot
    shots.forEach((shot, i) => {
      const container = containers.find((c) => c.id === shot.containerId);
      const inPipe = selectedPipeNodeIds.has(`asset-${shot.id}`);
      const dimmed = selectedShotId !== null && !inPipe;
      nodes.push({
        id: `asset-${shot.id}`,
        type: 'asset',
        position: { x: 0, y: i * 120 },
        data: { label: shot.name, shotId: shot.id, containerName: container?.name ?? '', dimmed },
      });
    });

    // Camera nodes (second column) — deduplicated
    const usedCameraIds = [...new Set(shots.map((s) => s.cameraId))];
    usedCameraIds.forEach((camId, i) => {
      const cam = cameras.find((c) => c.id === camId);
      const inPipe = selectedPipeNodeIds.has(`camera-${camId}`);
      const dimmed = selectedShotId !== null && !inPipe;
      nodes.push({
        id: `camera-${camId}`,
        type: 'camera',
        position: { x: 300, y: i * 120 },
        data: { label: cam?.name ?? camId, cameraId: camId, dimmed },
      });
    });

    // Scene State nodes (third column) — deduplicated
    const usedStateIds = [...new Set(containers.map((c) => c.sceneStateId))];
    usedStateIds.forEach((stateId, i) => {
      const state = sceneStates.find((s) => s.id === stateId);
      const inPipe = selectedPipeNodeIds.has(`state-${stateId}`);
      const dimmed = selectedShotId !== null && !inPipe;
      nodes.push({
        id: `state-${stateId}`,
        type: 'sceneState',
        position: { x: 600, y: i * 120 },
        data: { label: state?.name ?? stateId, stateId, color: state?.color ?? 'teal', dimmed },
      });
    });

    // Resolution nodes (fourth column) — deduplicated
    const resolutions = [...new Set(shots.map((s) => `${s.resolutionWidth}x${s.resolutionHeight}`))];
    resolutions.forEach((res, i) => {
      const inPipe = selectedPipeNodeIds.has(`res-${res}`);
      const dimmed = selectedShotId !== null && !inPipe;
      nodes.push({
        id: `res-${res}`,
        type: 'resolution',
        position: { x: 900, y: i * 120 },
        data: { label: res, resolution: res, dimmed },
      });
    });

    // Output nodes (right column) — one per shot
    shots.forEach((shot, i) => {
      const inPipe = selectedPipeNodeIds.has(`output-${shot.id}`);
      const dimmed = selectedShotId !== null && !inPipe;
      nodes.push({
        id: `output-${shot.id}`,
        type: 'output',
        position: { x: 1200, y: i * 120 },
        data: { label: `${shot.name}.${shot.outputFormat.toLowerCase()}`, shotId: shot.id, format: shot.outputFormat, dimmed },
      });
    });

    // Edges: asset → camera
    shots.forEach((shot) => {
      const inPipe = selectedShotId === shot.id;
      const dimmed = selectedShotId !== null && !inPipe;
      edges.push({
        id: `e-asset-cam-${shot.id}`,
        source: `asset-${shot.id}`,
        target: `camera-${shot.cameraId}`,
        animated: inPipe,
        style: { stroke: inPipe ? EDGE_HIGHLIGHT : dimmed ? EDGE_DIM : EDGE_DEFAULT, strokeWidth: inPipe ? 2.5 : 1 },
      });
    });

    // Edges: camera → scene state
    shots.forEach((shot) => {
      const container = containers.find((c) => c.id === shot.containerId);
      const stateId = shot.sceneStateId ?? container?.sceneStateId;
      if (stateId) {
        const inPipe = selectedShotId === shot.id;
        const dimmed = selectedShotId !== null && !inPipe;
        edges.push({
          id: `e-cam-state-${shot.id}`,
          source: `camera-${shot.cameraId}`,
          target: `state-${stateId}`,
          animated: inPipe,
          style: { stroke: inPipe ? EDGE_HIGHLIGHT : dimmed ? EDGE_DIM : EDGE_DEFAULT, strokeWidth: inPipe ? 2.5 : 1 },
        });
      }
    });

    // Edges: scene state → resolution
    shots.forEach((shot) => {
      const container = containers.find((c) => c.id === shot.containerId);
      const stateId = shot.sceneStateId ?? container?.sceneStateId;
      const res = `${shot.resolutionWidth}x${shot.resolutionHeight}`;
      if (stateId) {
        const inPipe = selectedShotId === shot.id;
        const dimmed = selectedShotId !== null && !inPipe;
        edges.push({
          id: `e-state-res-${shot.id}`,
          source: `state-${stateId}`,
          target: `res-${res}`,
          animated: inPipe,
          style: { stroke: inPipe ? EDGE_HIGHLIGHT : dimmed ? EDGE_DIM : EDGE_DEFAULT, strokeWidth: inPipe ? 2.5 : 1 },
        });
      }
    });

    // Edges: resolution → output
    shots.forEach((shot) => {
      const res = `${shot.resolutionWidth}x${shot.resolutionHeight}`;
      const inPipe = selectedShotId === shot.id;
      const dimmed = selectedShotId !== null && !inPipe;
      edges.push({
        id: `e-res-out-${shot.id}`,
        source: `res-${res}`,
        target: `output-${shot.id}`,
        animated: inPipe,
        style: { stroke: inPipe ? EDGE_HIGHLIGHT : dimmed ? EDGE_DIM : EDGE_DEFAULT, strokeWidth: inPipe ? 2.5 : 1 },
      });
    });

    return { initialNodes: nodes, initialEdges: edges };
  }, [shots, containers, cameras, sceneStates, selectedShotId, selectedPipeNodeIds]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [flowEdges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  // Sync when store data changes
  useEffect(() => { setNodes(initialNodes); }, [initialNodes, setNodes]);
  useEffect(() => { setEdges(initialEdges); }, [initialEdges, setEdges]);

  const onConnect: OnConnect = useCallback(
    (params) => setEdges((eds) => addEdge({ ...params, style: { stroke: '#5acfd9' } }, eds)),
    [setEdges]
  );

  // Click on background deselects
  const onPaneClick = useCallback(() => {
    selectNode(null, null);
    setContextMenu(null);
  }, [selectNode]);

  // Right-click context menu
  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      flowX: 0,
      flowY: 0,
    });
  }, []);

  // Close context menu on click anywhere
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => setContextMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  const handleContextAction = useCallback((_key: string) => {
    // TODO: wire up creation dialogs
    setContextMenu(null);
  }, []);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={flowEdges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
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

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="fixed z-50 bg-surface-200 border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {CONTEXT_MENU_ITEMS.map((item) => (
            <button
              key={item.key}
              onClick={() => handleContextAction(item.key)}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-xs text-foreground hover:bg-surface-300 transition-colors text-left"
            >
              <item.icon className="w-3.5 h-3.5 text-muted-foreground" />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
