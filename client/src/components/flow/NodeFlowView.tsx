import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnConnect,
  type Connection,
  type EdgeTypes,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Camera, FolderOpen, Sun, Contrast, Layers,
  RectangleHorizontal, Gauge, Server, AlertTriangle,
  FileOutput,
} from 'lucide-react';

import { useFlowStore } from '@/stores/flowStore';
import { nodeTypes } from './nodes';
import { ColoredEdge } from './ColoredEdge';
import type { NodeType } from '@shared/types';
import { PIPELINE_ORDER, isValidConnection } from '@shared/types';

const edgeTypes: EdgeTypes = {
  colored: ColoredEdge,
};

interface ContextMenuState {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
}

interface AutoSuggestState {
  x: number;
  y: number;
  flowX: number;
  flowY: number;
  sourceNodeId: string;
  validTypes: NodeType[];
}

const NODE_TYPE_META: Record<NodeType, { label: string; icon: typeof Camera }> = {
  camera:      { label: 'Camera',        icon: Camera },
  group:       { label: 'Group',         icon: FolderOpen },
  lightSetup:  { label: 'Light Setup',   icon: Sun },
  toneMapping: { label: 'Tone Mapping',  icon: Contrast },
  layerSetup:  { label: 'Layer Setup',   icon: Layers },
  aspectRatio: { label: 'Aspect Ratio',  icon: RectangleHorizontal },
  stageRev:    { label: 'Stage Rev',     icon: Gauge },
  override:    { label: 'Override',      icon: AlertTriangle },
  deadline:    { label: 'Deadline',      icon: Server },
  output:      { label: 'Output',        icon: FileOutput },
};

export function NodeFlowView() {
  const {
    flowNodes, flowEdges: storeEdges, selectedNodeId, viewport,
    selectNode, addNode, addEdge: storeAddEdge, removeNode, removeEdge,
    updateNodePosition, saveGraph,
  } = useFlowStore();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [autoSuggest, setAutoSuggest] = useState<AutoSuggestState | null>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactFlowInstance = useReactFlow();

  // Convert store FlowNodes to ReactFlow Nodes
  const rfNodes: Node[] = useMemo(() =>
    flowNodes.map((n) => ({
      id: n.id,
      type: n.type,
      position: n.position,
      data: {
        label: n.label,
        nodeType: n.type,
        camera_id: n.camera_id,
        config_id: n.config_id,
        hide_previous: n.hide_previous,
        enabled: n.enabled,
      },
    })),
    [flowNodes]
  );

  // Convert store FlowEdges to ReactFlow Edges with colored type
  const rfEdges: Edge[] = useMemo(() =>
    storeEdges.map((e) => {
      const sourceNode = flowNodes.find((n) => n.id === e.source);
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        type: 'colored',
        data: { sourceType: sourceNode?.type ?? 'default' },
      };
    }),
    [storeEdges, flowNodes]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  // Sync when store changes
  useEffect(() => { setNodes(rfNodes); }, [rfNodes, setNodes]);
  useEffect(() => { setEdges(rfEdges); }, [rfEdges, setEdges]);

  // Auto-save after changes (debounced)
  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => saveGraph(), 2000);
  }, [saveGraph]);

  // Handle node position changes
  const handleNodesChange = useCallback((changes: any) => {
    onNodesChange(changes);
    for (const change of changes) {
      if (change.type === 'position' && change.position && !change.dragging) {
        updateNodePosition(change.id, change.position);
        scheduleSave();
      }
    }
  }, [onNodesChange, updateNodePosition, scheduleSave]);

  // Handle new connections with pipeline validation
  const onConnect: OnConnect = useCallback((params: Connection) => {
    if (!params.source || !params.target) return;
    const success = storeAddEdge(params.source, params.target);
    if (success) scheduleSave();
  }, [storeAddEdge, scheduleSave]);

  // Auto-suggest: when user drops a connection on empty canvas
  const onConnectEnd = useCallback((event: MouseEvent | TouchEvent) => {
    const target = event.target as HTMLElement;
    // Only show if dropped on the pane (not on a node)
    if (target.classList.contains('react-flow__pane') || target.closest('.react-flow__pane')) {
      // Find the connection source from the connecting state
      const connectingState = reactFlowInstance.toObject();
      // Get position from mouse/touch event
      const clientX = 'clientX' in event ? event.clientX : event.touches?.[0]?.clientX ?? 0;
      const clientY = 'clientY' in event ? event.clientY : event.touches?.[0]?.clientY ?? 0;
      const flowPos = reactFlowInstance.screenToFlowPosition({ x: clientX, y: clientY });

      // Find which node was the source of the drag
      // React Flow stores this internally - we check which handles were being dragged
      const draggingNode = connectingState.nodes.find((n: any) =>
        n.selected || document.querySelector(`[data-id="${n.id}"] .source.connecting`)
      );

      if (draggingNode) {
        const sourceType = draggingNode.type as NodeType;
        const validTypes = [...PIPELINE_ORDER, 'override' as NodeType].filter((t) =>
          isValidConnection(sourceType, t)
        );

        if (validTypes.length > 0) {
          setAutoSuggest({
            x: clientX,
            y: clientY,
            flowX: flowPos.x,
            flowY: flowPos.y,
            sourceNodeId: draggingNode.id,
            validTypes,
          });
        }
      }
    }
  }, [reactFlowInstance]);

  // Click on background deselects
  const onPaneClick = useCallback(() => {
    selectNode(null);
    setContextMenu(null);
    setAutoSuggest(null);
  }, [selectNode]);

  // Right-click context menu
  const onPaneContextMenu = useCallback((event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    const flowPos = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      flowX: flowPos.x,
      flowY: flowPos.y,
    });
    setAutoSuggest(null);
  }, [reactFlowInstance]);

  // Close menus on click
  useEffect(() => {
    if (!contextMenu && !autoSuggest) return;
    const handler = () => {
      setContextMenu(null);
      setAutoSuggest(null);
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu, autoSuggest]);

  // Delete selected node on Delete key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        removeNode(selectedNodeId);
        scheduleSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, removeNode, scheduleSave]);

  const handleAddNode = useCallback((type: NodeType, x: number, y: number, sourceId?: string) => {
    addNode(type, { x, y });
    // If adding from auto-suggest, also connect
    if (sourceId) {
      const newNodes = useFlowStore.getState().flowNodes;
      const newest = newNodes[newNodes.length - 1];
      if (newest) {
        storeAddEdge(sourceId, newest.id);
      }
    }
    scheduleSave();
    setContextMenu(null);
    setAutoSuggest(null);
  }, [addNode, storeAddEdge, scheduleSave]);

  // All node types for context menu
  const allNodeTypes = Object.entries(NODE_TYPE_META);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectEnd={onConnectEnd}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultViewport={viewport}
        fitView={!flowNodes.length}
        minZoom={0.1}
        maxZoom={3}
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={null}
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
          onClick={(e) => e.stopPropagation()}
        >
          {allNodeTypes.map(([type, meta]) => (
            <button
              key={type}
              onClick={() => handleAddNode(type as NodeType, contextMenu.flowX, contextMenu.flowY)}
              className="flex items-center gap-2.5 w-full px-3 py-1.5 text-xs text-foreground hover:bg-surface-300 transition-colors text-left"
            >
              <meta.icon className="w-3.5 h-3.5 text-muted-foreground" />
              {meta.label}
            </button>
          ))}
        </div>
      )}

      {/* Auto-suggest dropdown on connection drop */}
      {autoSuggest && (
        <div
          className="fixed z-50 bg-surface-200 border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: autoSuggest.x, top: autoSuggest.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] text-fg-dim uppercase tracking-wider">Add & Connect</div>
          {autoSuggest.validTypes.map((type) => {
            const meta = NODE_TYPE_META[type];
            return (
              <button
                key={type}
                onClick={() => handleAddNode(type, autoSuggest.flowX, autoSuggest.flowY, autoSuggest.sourceNodeId)}
                className="flex items-center gap-2.5 w-full px-3 py-1.5 text-xs text-foreground hover:bg-surface-300 transition-colors text-left"
              >
                <meta.icon className="w-3.5 h-3.5 text-muted-foreground" />
                {meta.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
