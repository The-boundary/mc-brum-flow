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
  type OnConnectStart,
  type OnConnectEnd,
  type Connection,
  type EdgeTypes,
  type EdgeMouseHandler,
  BackgroundVariant,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  Camera, FolderOpen, Sun, Contrast, Layers,
  RectangleHorizontal, Gauge, Server, AlertTriangle,
  FileOutput, Keyboard,
} from 'lucide-react';

import { useFlowStore } from '@/stores/flowStore';
import { useUiStore } from '@/stores/uiStore';
import { nodeTypes } from './nodes';
import { ColoredEdge } from './ColoredEdge';
import { getFlowSemantics } from './graphSemantics';
import {
  getAutoLayoutPositions,
  getFlowHandleLayout,
  getSuggestedExistingTargetNodes,
  getSuggestedNextNodeTypes,
} from './flowLayout';
import type { NodeType } from '@shared/types';

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

interface PendingConnectionState {
  sourceNodeId: string;
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

function formatNodeTypeLabel(type: NodeType) {
  return NODE_TYPE_META[type]?.label ?? type;
}

export function NodeFlowView() {
  const autoLayoutNonce = useUiStore((state) => state.autoLayoutNonce);
  const fitViewNonce = useUiStore((state) => state.fitViewNonce);
  const {
    flowNodes, flowEdges: storeEdges, selectedNodeId, viewport,
    selectNode, addNode, addEdge: storeAddEdge, removeNode, removeEdge,
    updateNodePosition, applyNodeLayout, updateViewport, saveGraph, resolvePaths,
  } = useFlowStore();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [autoSuggest, setAutoSuggest] = useState<AutoSuggestState | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConnectionRef = useRef<PendingConnectionState | null>(null);
  const autoSuggestJustSetRef = useRef(false);
  const reactFlowInstance = useReactFlow();

  const semantics = useMemo(
    () => getFlowSemantics(flowNodes, storeEdges, selectedNodeId),
    [flowNodes, selectedNodeId, storeEdges]
  );

  const handleLayout = useMemo(
    () => getFlowHandleLayout(flowNodes, storeEdges),
    [flowNodes, storeEdges]
  );

  const hasCameraSelection = semantics.selectedCameraNodeId !== null;
  const existingAutoSuggestTargets = useMemo(() => {
    if (!autoSuggest) return [];
    return getSuggestedExistingTargetNodes(
      flowNodes, storeEdges, autoSuggest.sourceNodeId, autoSuggest.validTypes
    );
  }, [autoSuggest, flowNodes, storeEdges]);

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
        isPathHighlighted: semantics.highlightedNodeIds.has(n.id),
        isPathDimmed: hasCameraSelection && !semantics.highlightedNodeIds.has(n.id),
        inputHandleIds: handleLayout.nodeHandles.get(n.id)?.inputHandleIds ?? [],
        outputHandleIds: handleLayout.nodeHandles.get(n.id)?.outputHandleIds ?? [],
      },
    })),
    [flowNodes, handleLayout.nodeHandles, hasCameraSelection, semantics]
  );

  // Convert store FlowEdges to ReactFlow Edges with colored type
  const rfEdges: Edge[] = useMemo(() =>
    storeEdges.map((e) => {
      const cameraCount = semantics.edgeCameraCounts.get(e.id) ?? 0;
      const handleAssignment = handleLayout.edgeHandles.get(e.id);

      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.source_handle ?? handleAssignment?.sourceHandle,
        targetHandle: e.target_handle ?? handleAssignment?.targetHandle,
        type: 'colored',
        data: {
          cameraCount,
          isPathHighlighted: semantics.highlightedEdgeIds.has(e.id),
          isPathDimmed: hasCameraSelection && !semantics.highlightedEdgeIds.has(e.id),
          shouldAnimateFlow: hasCameraSelection && semantics.highlightedEdgeIds.has(e.id),
        },
      };
    }),
    [handleLayout.edgeHandles, hasCameraSelection, semantics, storeEdges]
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

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    if (!params.nodeId) {
      pendingConnectionRef.current = null;
      return;
    }
    pendingConnectionRef.current = { sourceNodeId: params.nodeId };
    setContextMenu(null);
    setAutoSuggest(null);
  }, []);

  const deleteEdgeById = useCallback((edgeId: string) => {
    removeEdge(edgeId);
    scheduleSave();
  }, [removeEdge, scheduleSave]);

  const onEdgeClick: EdgeMouseHandler = useCallback((event, edge) => {
    if (!(event.shiftKey || event.ctrlKey || event.metaKey)) return;
    deleteEdgeById(edge.id);
  }, [deleteEdgeById]);

  const onEdgeDoubleClick: EdgeMouseHandler = useCallback((_event, edge) => {
    deleteEdgeById(edge.id);
  }, [deleteEdgeById]);

  // Auto-suggest: when user drops a connection on empty canvas
  const onConnectEnd: OnConnectEnd = useCallback((event, connectionState) => {
    const pendingConnection = pendingConnectionRef.current;
    pendingConnectionRef.current = null;

    if (!pendingConnection) return;
    if (connectionState?.isValid || connectionState?.toNode || connectionState?.toHandle) return;

    const target = event.target as Element | null;
    const droppedOnInteractiveElement = Boolean(
      target?.closest('.react-flow__node, .react-flow__handle, .react-flow__controls, .react-flow__minimap')
    );

    if (droppedOnInteractiveElement) return;

    const validTypes = getSuggestedNextNodeTypes(flowNodes, storeEdges, pendingConnection.sourceNodeId);
    if (validTypes.length === 0) return;

    const clientX = 'clientX' in event ? event.clientX : event.touches?.[0]?.clientX ?? 0;
    const clientY = 'clientY' in event ? event.clientY : event.touches?.[0]?.clientY ?? 0;
    const flowPos = reactFlowInstance.screenToFlowPosition({ x: clientX, y: clientY });

    autoSuggestJustSetRef.current = true;
    setTimeout(() => {
      autoSuggestJustSetRef.current = false;
      setAutoSuggest({
        x: clientX + 8,
        y: clientY + 8,
        flowX: flowPos.x,
        flowY: flowPos.y,
        sourceNodeId: pendingConnection.sourceNodeId,
        validTypes,
      });
    }, 0);
  }, [flowNodes, reactFlowInstance, storeEdges]);

  // Click on background deselects
  const onPaneClick = useCallback(() => {
    selectNode(null);
    setContextMenu(null);
    if (!autoSuggestJustSetRef.current) {
      setAutoSuggest(null);
    }
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

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Delete/Backspace - delete selected node
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId) {
        e.preventDefault();
        removeNode(selectedNodeId);
        scheduleSave();
        return;
      }

      // Ctrl+S - save now
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        void saveGraph().then(() => resolvePaths());
        return;
      }

      // Escape - deselect and close menus
      if (e.key === 'Escape') {
        selectNode(null);
        setContextMenu(null);
        setAutoSuggest(null);
        return;
      }

      // ? - show keyboard shortcuts
      if (e.key === '?') {
        setShowShortcuts((v) => !v);
        return;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedNodeId, removeNode, scheduleSave, saveGraph, resolvePaths, selectNode]);

  const handleAddNode = useCallback((type: NodeType, x: number, y: number, sourceId?: string) => {
    addNode(type, { x, y });
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

  const handleConnectToExistingNode = useCallback((sourceId: string, targetId: string) => {
    const success = storeAddEdge(sourceId, targetId);
    if (success) {
      scheduleSave();
      selectNode(targetId);
    }
    setAutoSuggest(null);
  }, [scheduleSave, selectNode, storeAddEdge]);

  // Auto-layout using dagre — read nodes/edges from store directly
  // to avoid infinite loop (applyNodeLayout updates flowNodes which would re-trigger)
  useEffect(() => {
    if (!autoLayoutNonce) return;
    const { flowNodes: nodes, flowEdges: edges } = useFlowStore.getState();
    if (nodes.length === 0) return;

    const nextPositions = getAutoLayoutPositions(nodes, edges);
    applyNodeLayout(nextPositions);
    reactFlowInstance.fitView({ duration: 280, padding: 0.15 });
  }, [applyNodeLayout, autoLayoutNonce, reactFlowInstance]);

  useEffect(() => {
    if (!fitViewNonce || flowNodes.length === 0) return;
    reactFlowInstance.fitView({ duration: 220, padding: 0.18 });
  }, [fitViewNonce, flowNodes.length, reactFlowInstance]);

  const allNodeTypes = Object.entries(NODE_TYPE_META);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onEdgeClick={onEdgeClick}
        onEdgeDoubleClick={onEdgeDoubleClick}
        onPaneClick={onPaneClick}
        onPaneContextMenu={onPaneContextMenu}
        onMoveEnd={(_event, nextViewport) => updateViewport(nextViewport)}
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
          nodeColor={(node) => {
            const type = node.type as NodeType;
            if (type === 'camera') return '#34d399';
            if (type === 'output') return '#e879f9';
            if (type === 'override') return '#f87171';
            if (type === 'group') return '#fb923c';
            if (type === 'lightSetup') return '#fbbf24';
            if (type === 'toneMapping') return '#60a5fa';
            if (type === 'layerSetup') return '#22d3ee';
            if (type === 'aspectRatio') return '#2dd4bf';
            if (type === 'stageRev') return '#4ade80';
            if (type === 'deadline') return '#c084fc';
            return 'hsl(185 63% 60%)';
          }}
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

          {existingAutoSuggestTargets.length > 0 && (
            <>
              <div className="mx-3 my-1 h-px bg-border" />
              <div className="px-3 py-1 text-[10px] text-fg-dim uppercase tracking-wider">Connect Existing</div>
              {existingAutoSuggestTargets.map((node) => {
                const meta = NODE_TYPE_META[node.type];
                return (
                  <button
                    key={node.id}
                    onClick={() => handleConnectToExistingNode(autoSuggest.sourceNodeId, node.id)}
                    className="flex items-center gap-2.5 w-full px-3 py-1.5 text-xs text-foreground hover:bg-surface-300 transition-colors text-left"
                  >
                    <meta.icon className="w-3.5 h-3.5 text-muted-foreground" />
                    <div className="min-w-0">
                      <div className="truncate">{node.label}</div>
                      <div className="text-[10px] text-fg-dim">{formatNodeTypeLabel(node.type)}</div>
                    </div>
                  </button>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* Keyboard shortcuts overlay */}
      {showShortcuts && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setShowShortcuts(false)}
        >
          <div
            className="bg-surface-200 border border-border rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-brand" />
              Keyboard Shortcuts
            </h3>
            <div className="space-y-1.5 text-xs">
              {[
                ['Delete / Backspace', 'Remove selected node'],
                ['Ctrl + S', 'Save graph now'],
                ['Escape', 'Deselect & close menus'],
                ['Double-click edge', 'Delete edge'],
                ['Shift + click edge', 'Delete edge'],
                ['Right-click canvas', 'Add node menu'],
                ['Drag from handle', 'Create connection'],
                ['Drop on empty', 'Add & connect node'],
                ['?', 'Toggle this help'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-300 border border-border text-[10px] font-mono text-foreground">{key}</kbd>
                  <span className="text-fg-muted">{desc}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => setShowShortcuts(false)}
              className="mt-4 w-full rounded-lg bg-brand px-4 py-2 text-xs font-medium text-background hover:bg-brand-500 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Bottom-left help hint */}
      <div className="pointer-events-none absolute bottom-3 left-3 flex items-center gap-3">
        <div className="rounded bg-surface-100/90 border border-border px-2 py-1 text-[10px] text-fg-dim">
          <span className="opacity-60">Drag</span> connect · <span className="opacity-60">Shift-click</span> delete edge · <span className="opacity-60">?</span> shortcuts
        </div>
      </div>
    </div>
  );
}
