import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  getSmoothStepPath,
  MiniMap,
  ReactFlow,
  type Connection,
  type ConnectionLineComponentProps,
  type Edge,
  type EdgeMouseHandler,
  type EdgeTypes,
  type NodeChange,
  type Node,
  type OnConnect,
  type OnConnectEnd,
  type OnConnectStart,
  useEdgesState,
  useNodesState,
  useReactFlow,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  AlertTriangle,
  Camera,
  Contrast,
  FileOutput,
  FolderOpen,
  Gauge,
  Keyboard,
  Layers,
  Link2,
  RectangleHorizontal,
  Server,
  Sun,
  Unlink2,
} from 'lucide-react';

import type { FlowEdge, FlowNode, NodeType } from '@shared/types';

import { useFlowStore } from '@/stores/flowStore';
import { useUiStore } from '@/stores/uiStore';

import { ColoredEdge } from './ColoredEdge';
import {
  getAutoLayoutPositions,
  getFlowHandleLayout,
  getSuggestedExistingTargetNodes,
  getSuggestedNextNodeTypes,
} from './flowLayout';
import { getFlowSemantics } from './graphSemantics';
import { nodeTypes } from './nodes';

const LABEL_TONE_CLASSES = {
  camera: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-100',
  group: 'border-orange-500/40 bg-orange-500/15 text-orange-100',
  mixed: 'border-sky-500/40 bg-sky-500/15 text-sky-100',
  path: 'border-border bg-surface-100/95 text-foreground',
} as const;

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
  sourceHandleId?: string | null;
  validTypes: NodeType[];
}

interface PendingConnectionState {
  sourceNodeId: string;
  sourceHandleId?: string | null;
}

const NODE_TYPE_META: Record<NodeType, { label: string; icon: typeof Camera }> = {
  camera: { label: 'Camera', icon: Camera },
  group: { label: 'Group', icon: FolderOpen },
  lightSetup: { label: 'Light Setup', icon: Sun },
  toneMapping: { label: 'Tone Mapping', icon: Contrast },
  layerSetup: { label: 'Layer Setup', icon: Layers },
  aspectRatio: { label: 'Aspect Ratio', icon: RectangleHorizontal },
  stageRev: { label: 'Stage Rev', icon: Gauge },
  override: { label: 'Override', icon: AlertTriangle },
  deadline: { label: 'Deadline', icon: Server },
  output: { label: 'Output', icon: FileOutput },
};

function formatNodeTypeLabel(type: NodeType) {
  return NODE_TYPE_META[type]?.label ?? type;
}

function getHiddenPreviousNodeIds(flowNodes: FlowNode[], flowEdges: FlowEdge[]) {
  const incomingEdges = new Map<string, FlowEdge[]>();
  const hiddenNodeIds = new Set<string>();

  for (const edge of flowEdges) {
    const bucket = incomingEdges.get(edge.target);
    if (bucket) {
      bucket.push(edge);
    } else {
      incomingEdges.set(edge.target, [edge]);
    }
  }

  for (const node of flowNodes) {
    if (node.type !== 'group' || !node.hide_previous) continue;

    const queue = [...(incomingEdges.get(node.id) ?? [])];
    const visited = new Set<string>();

    while (queue.length > 0) {
      const edge = queue.shift();
      if (!edge || visited.has(edge.source)) continue;

      visited.add(edge.source);
      hiddenNodeIds.add(edge.source);
      queue.push(...(incomingEdges.get(edge.source) ?? []));
    }
  }

  return hiddenNodeIds;
}

function getMiniMapNodeColor(type?: string | null) {
  switch (type) {
    case 'camera':
      return '#34d399';
    case 'output':
      return '#e879f9';
    case 'override':
      return '#f87171';
    case 'group':
      return '#fb923c';
    case 'lightSetup':
      return '#fbbf24';
    case 'toneMapping':
      return '#60a5fa';
    case 'layerSetup':
      return '#22d3ee';
    case 'aspectRatio':
      return '#2dd4bf';
    case 'stageRev':
      return '#4ade80';
    case 'deadline':
      return '#c084fc';
    default:
      return 'hsl(185 63% 60%)';
  }
}

function BranchConnectionLine({
  fromHandle,
  fromNode,
  fromPosition,
  fromX,
  fromY,
  toPosition,
  toX,
  toY,
}: ConnectionLineComponentProps<Node>) {
  const [path] = getSmoothStepPath({
    sourceX: fromX,
    sourceY: fromY,
    sourcePosition: fromPosition,
    targetX: toX,
    targetY: toY,
    targetPosition: toPosition,
    borderRadius: 8,
  });

  const outputHandleLabels = (fromNode.data as {
    outputHandleLabels?: Record<string, { label: string; tone: keyof typeof LABEL_TONE_CLASSES }>;
  } | undefined)?.outputHandleLabels ?? {};
  const hoverLabel = fromHandle?.id ? outputHandleLabels[fromHandle.id] : undefined;

  return (
    <g>
      <path d={path} fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth={2} strokeDasharray="8 8" />
      {hoverLabel?.label ? (
        <foreignObject
          x={fromX + 12}
          y={fromY - 14}
          width={180}
          height={28}
          style={{ overflow: 'visible', pointerEvents: 'none' }}
        >
          <div className={`inline-flex max-w-[180px] items-center rounded border px-2 py-1 text-[10px] shadow-lg backdrop-blur-sm ${LABEL_TONE_CLASSES[hoverLabel.tone]}`}>
            <span className="truncate">{hoverLabel.label}</span>
          </div>
        </foreignObject>
      ) : null}
    </g>
  );
}

export function NodeFlowView() {
  const autoLayoutNonce = useUiStore((state) => state.autoLayoutNonce);
  const fitViewNonce = useUiStore((state) => state.fitViewNonce);
  const {
    activeSceneId,
    flowNodes,
    flowEdges: storeEdges,
    selectedNodeId,
    viewport,
    selectNode,
    addNode,
    addEdge: storeAddEdge,
    removeNode,
    removeEdge,
    updateNodePosition,
    applyNodeLayout,
    updateViewport,
    saveGraph,
    resolvePaths,
  } = useFlowStore();

  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [autoSuggest, setAutoSuggest] = useState<AutoSuggestState | null>(null);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [linkCameras, setLinkCameras] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConnectionRef = useRef<PendingConnectionState | null>(null);
  const autoSuggestJustSetRef = useRef(false);
  const lastAppliedViewportSceneRef = useRef<string | null>(null);
  const reactFlowInstance = useReactFlow();
  const initialViewport = useMemo(() => viewport, [activeSceneId]);

  const hiddenPreviousNodeIds = useMemo(
    () => getHiddenPreviousNodeIds(flowNodes, storeEdges),
    [flowNodes, storeEdges]
  );
  const visibleFlowNodes = useMemo(
    () => flowNodes.filter((node) => !hiddenPreviousNodeIds.has(node.id)),
    [flowNodes, hiddenPreviousNodeIds]
  );
  const visibleStoreEdges = useMemo(
    () => storeEdges.filter((edge) => !hiddenPreviousNodeIds.has(edge.source) && !hiddenPreviousNodeIds.has(edge.target)),
    [storeEdges, hiddenPreviousNodeIds]
  );

  const semantics = useMemo(
    () => getFlowSemantics(visibleFlowNodes, visibleStoreEdges, selectedNodeId),
    [visibleFlowNodes, visibleStoreEdges, selectedNodeId]
  );
  const handleLayout = useMemo(
    () => getFlowHandleLayout(visibleFlowNodes, visibleStoreEdges),
    [visibleFlowNodes, visibleStoreEdges]
  );

  const hasCameraSelection = semantics.selectedCameraNodeId !== null;
  const existingAutoSuggestTargets = useMemo(() => {
    if (!autoSuggest) return [];

    return getSuggestedExistingTargetNodes(
      visibleFlowNodes,
      visibleStoreEdges,
      autoSuggest.sourceNodeId,
      autoSuggest.validTypes
    );
  }, [autoSuggest, visibleFlowNodes, visibleStoreEdges]);

  const rfNodes: Node[] = useMemo(
    () =>
      visibleFlowNodes.map((node) => ({
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          label: node.label,
          nodeType: node.type,
          camera_id: node.camera_id,
          config_id: node.config_id,
          hide_previous: node.hide_previous,
          enabled: node.enabled,
          outputHandleLabels: semantics.outputHandleLabels.get(node.id) ?? {},
          isPathHighlighted: semantics.highlightedNodeIds.has(node.id),
          isPathDimmed: hasCameraSelection && !semantics.highlightedNodeIds.has(node.id),
          inputHandleIds: handleLayout.nodeHandles.get(node.id)?.inputHandleIds ?? [],
          outputHandleIds: handleLayout.nodeHandles.get(node.id)?.outputHandleIds ?? [],
        },
      })),
    [visibleFlowNodes, semantics, hasCameraSelection, handleLayout.nodeHandles]
  );

  const rfEdges: Edge[] = useMemo(
    () =>
      visibleStoreEdges.map((edge) => {
        const cameraCount = semantics.edgeCameraCounts.get(edge.id) ?? 0;
        const handleAssignment = handleLayout.edgeHandles.get(edge.id);

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.source_handle ?? handleAssignment?.sourceHandle,
          targetHandle: edge.target_handle ?? handleAssignment?.targetHandle,
          type: 'colored',
          data: {
            cameraCount,
            hoverLabel: semantics.edgeLabels.get(edge.id),
            isPathHighlighted: semantics.highlightedEdgeIds.has(edge.id),
            isPathDimmed: hasCameraSelection && !semantics.highlightedEdgeIds.has(edge.id),
            shouldAnimateFlow: hasCameraSelection && semantics.highlightedEdgeIds.has(edge.id),
          },
        };
      }),
    [visibleStoreEdges, semantics, hasCameraSelection, handleLayout.edgeHandles]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  useEffect(() => {
    setNodes(rfNodes);
  }, [rfNodes, setNodes]);

  useEffect(() => {
    setEdges(rfEdges);
  }, [rfEdges, setEdges]);

  useEffect(() => {
    if (!activeSceneId) return;
    if (lastAppliedViewportSceneRef.current === activeSceneId) return;

    lastAppliedViewportSceneRef.current = activeSceneId;
    void reactFlowInstance.setViewport(viewport, { duration: 0 });
  }, [activeSceneId, reactFlowInstance, viewport]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveGraph();
    }, 2000);
  }, [saveGraph]);

  const fitSelectionOrGraph = useCallback(() => {
    const selectedNode = selectedNodeId
      ? visibleFlowNodes.find((node) => node.id === selectedNodeId)
      : null;

    if (selectedNode) {
      void reactFlowInstance.setCenter(selectedNode.position.x + 90, selectedNode.position.y + 35, {
        duration: 220,
        zoom: 1.15,
      });
      return;
    }

    if (visibleFlowNodes.length > 0) {
      void reactFlowInstance.fitView({ duration: 220, padding: 0.18 });
    }
  }, [reactFlowInstance, selectedNodeId, visibleFlowNodes]);

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      let finalChanges = changes;

      if (linkCameras) {
        const extra: NodeChange<Node>[] = [];
        for (const change of changes) {
          if (change.type === 'position' && change.dragging && change.position) {
            const draggedNode = nodes.find((n) => n.id === change.id);
            if (draggedNode?.type === 'camera') {
              const dx = change.position.x - draggedNode.position.x;
              const dy = change.position.y - draggedNode.position.y;
              if (dx !== 0 || dy !== 0) {
                for (const node of nodes) {
                  if (node.type === 'camera' && node.id !== change.id) {
                    extra.push({
                      type: 'position',
                      id: node.id,
                      position: { x: node.position.x + dx, y: node.position.y + dy },
                      dragging: true,
                    });
                  }
                }
              }
            }
          }
        }
        if (extra.length > 0) {
          finalChanges = [...changes, ...extra];
        }
      }

      onNodesChange(finalChanges);

      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          updateNodePosition(change.id, change.position);

          if (linkCameras) {
            const draggedNode = nodes.find((n) => n.id === change.id);
            if (draggedNode?.type === 'camera') {
              for (const node of nodes) {
                if (node.type === 'camera' && node.id !== change.id) {
                  updateNodePosition(node.id, node.position);
                }
              }
            }
          }

          scheduleSave();
        }
      }
    },
    [onNodesChange, scheduleSave, updateNodePosition, linkCameras, nodes]
  );

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;
      if (storeAddEdge(params.source, params.target, params.sourceHandle, params.targetHandle)) scheduleSave();
    },
    [scheduleSave, storeAddEdge]
  );

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    if (!params.nodeId) {
      pendingConnectionRef.current = null;
      return;
    }

    pendingConnectionRef.current = { sourceNodeId: params.nodeId, sourceHandleId: 'handleId' in params ? params.handleId : null };
    setContextMenu(null);
    setAutoSuggest(null);
  }, []);

  const deleteEdgeById = useCallback(
    (edgeId: string) => {
      removeEdge(edgeId);
      scheduleSave();
    },
    [removeEdge, scheduleSave]
  );

  const onEdgeClick: EdgeMouseHandler = useCallback(
    (event, edge) => {
      if (!(event.shiftKey || event.ctrlKey || event.metaKey)) return;
      deleteEdgeById(edge.id);
    },
    [deleteEdgeById]
  );

  const onEdgeDoubleClick: EdgeMouseHandler = useCallback(
    (_event, edge) => {
      deleteEdgeById(edge.id);
    },
    [deleteEdgeById]
  );

  const onConnectEnd: OnConnectEnd = useCallback(
    (event, connectionState) => {
      const pendingConnection = pendingConnectionRef.current;
      pendingConnectionRef.current = null;

      if (!pendingConnection) return;
      if (connectionState?.isValid || connectionState?.toNode || connectionState?.toHandle) return;

      const target = event.target as Element | null;
      const droppedOnInteractiveElement = Boolean(
        target?.closest('.react-flow__node, .react-flow__handle, .react-flow__controls, .react-flow__minimap')
      );
      if (droppedOnInteractiveElement) return;

      const validTypes = getSuggestedNextNodeTypes(visibleFlowNodes, visibleStoreEdges, pendingConnection.sourceNodeId);
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
          sourceHandleId: pendingConnection.sourceHandleId ?? null,
          validTypes,
        });
      }, 0);
    },
    [reactFlowInstance, visibleFlowNodes, visibleStoreEdges]
  );

  const onPaneClick = useCallback(() => {
    selectNode(null);
    setContextMenu(null);
    if (!autoSuggestJustSetRef.current) {
      setAutoSuggest(null);
    }
  }, [selectNode]);

  const onPaneContextMenu = useCallback(
    (event: MouseEvent | React.MouseEvent) => {
      event.preventDefault();
      const flowPos = reactFlowInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
      setContextMenu({
        x: event.clientX,
        y: event.clientY,
        flowX: flowPos.x,
        flowY: flowPos.y,
      });
      setAutoSuggest(null);
    },
    [reactFlowInstance]
  );

  useEffect(() => {
    if (!contextMenu && !autoSuggest) return;
    const handler = () => {
      setContextMenu(null);
      setAutoSuggest(null);
    };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [autoSuggest, contextMenu]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const tag = (event.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedNodeId) {
        event.preventDefault();
        removeNode(selectedNodeId);
        scheduleSave();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void saveGraph().then(() => resolvePaths());
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'l') {
        event.preventDefault();
        if (visibleFlowNodes.length === 0) return;
        const nextPositions = getAutoLayoutPositions(visibleFlowNodes, visibleStoreEdges);
        applyNodeLayout(nextPositions);
        void reactFlowInstance.fitView({ duration: 280, padding: 0.15 });
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        fitSelectionOrGraph();
        return;
      }

      if (event.key === 'Escape') {
        selectNode(null);
        setContextMenu(null);
        setAutoSuggest(null);
        return;
      }

      if (event.key === '?') {
        setShowShortcuts((value) => !value);
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [
    applyNodeLayout,
    fitSelectionOrGraph,
    reactFlowInstance,
    removeNode,
    resolvePaths,
    saveGraph,
    scheduleSave,
    selectNode,
    selectedNodeId,
    visibleFlowNodes,
    visibleStoreEdges,
  ]);

  const handleAddNode = useCallback(
    (type: NodeType, x: number, y: number, sourceId?: string, sourceHandleId?: string | null) => {
      addNode(type, { x, y });
      if (sourceId) {
        const newNodes = useFlowStore.getState().flowNodes;
        const newest = newNodes[newNodes.length - 1];
        if (newest) {
          const targetHandleId = sourceHandleId ? sourceHandleId.replace('source-', 'target-') : null;
          storeAddEdge(sourceId, newest.id, sourceHandleId, targetHandleId);
        }
      }
      scheduleSave();
      setContextMenu(null);
      setAutoSuggest(null);
    },
    [addNode, scheduleSave, storeAddEdge]
  );

  const handleConnectToExistingNode = useCallback(
    (sourceId: string, targetId: string, sourceHandleId?: string | null) => {
      const targetHandleId = sourceHandleId ? sourceHandleId.replace('source-', 'target-') : null;
      if (storeAddEdge(sourceId, targetId, sourceHandleId, targetHandleId)) {
        scheduleSave();
        selectNode(targetId);
      }
      setAutoSuggest(null);
    },
    [scheduleSave, selectNode, storeAddEdge]
  );

  useEffect(() => {
    if (!autoLayoutNonce) return;
    const { flowNodes: nodes, flowEdges: edges } = useFlowStore.getState();
    if (nodes.length === 0) return;
    const nextPositions = getAutoLayoutPositions(nodes, edges);
    if (Object.keys(nextPositions).length === 0) return;
    applyNodeLayout(nextPositions);
    void reactFlowInstance.fitView({ duration: 280, padding: 0.15 });
  }, [applyNodeLayout, autoLayoutNonce, reactFlowInstance]);

  useEffect(() => {
    if (!fitViewNonce) return;
    fitSelectionOrGraph();
  }, [fitSelectionOrGraph, fitViewNonce]);

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
        connectionLineComponent={BranchConnectionLine}
        defaultViewport={initialViewport}
        fitView={false}
        minZoom={0.1}
        maxZoom={3}
        snapToGrid
        snapGrid={[20, 20]}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(190 12% 20%)" />
        <Controls className="!bg-surface-200 !border-border !rounded-lg [&>button]:!bg-surface-300 [&>button]:!border-border [&>button]:!text-foreground [&>button:hover]:!bg-surface-400" />

        {/* Link cameras toggle */}
        <div className="absolute bottom-3 left-14 z-10">
          <button
            type="button"
            onClick={() => setLinkCameras((v) => !v)}
            title={linkCameras ? 'Cameras linked — drag one to move all' : 'Cameras independent — click to link'}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium shadow-md backdrop-blur-sm transition-all ${
              linkCameras
                ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 hover:bg-emerald-500/30'
                : 'border-border bg-surface-200/90 text-fg-muted hover:bg-surface-300 hover:text-foreground'
            }`}
          >
            {linkCameras ? <Link2 className="h-3.5 w-3.5" /> : <Unlink2 className="h-3.5 w-3.5" />}
            {linkCameras ? 'Cameras Linked' : 'Link Cameras'}
          </button>
        </div>
        <MiniMap
          className="!bg-surface-100 !border-border !rounded-lg"
          nodeColor={(node) => getMiniMapNodeColor(node.type)}
          maskColor="rgba(0,0,0,0.5)"
        />
      </ReactFlow>

      {contextMenu && (
        <div
          className="fixed z-50 bg-surface-200 border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onClick={(event) => event.stopPropagation()}
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

      {autoSuggest && (
        <div
          className="fixed z-50 bg-surface-200 border border-border rounded-lg shadow-xl py-1 min-w-[180px]"
          style={{ left: autoSuggest.x, top: autoSuggest.y }}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-3 py-1 text-[10px] text-fg-dim uppercase tracking-wider">Add & Connect</div>
          {autoSuggest.validTypes.map((type) => {
            const meta = NODE_TYPE_META[type];
            return (
              <button
                key={type}
                onClick={() => handleAddNode(type, autoSuggest.flowX, autoSuggest.flowY, autoSuggest.sourceNodeId, autoSuggest.sourceHandleId ?? null)}
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
                    onClick={() => handleConnectToExistingNode(autoSuggest.sourceNodeId, node.id, autoSuggest.sourceHandleId ?? null)}
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

      {showShortcuts && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowShortcuts(false)}>
          <div
            className="bg-surface-200 border border-border rounded-xl shadow-2xl p-5 max-w-sm w-full mx-4"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <Keyboard className="w-4 h-4 text-brand" />
              Keyboard Shortcuts
            </h3>
            <div className="space-y-1.5 text-xs">
              {[
                ['Delete / Backspace', 'Remove selected node'],
                ['Ctrl + S', 'Save graph now'],
                ['L', 'Auto layout graph'],
                ['Z', 'Fit graph or zoom to selection'],
                ['Escape', 'Deselect and close menus'],
                ['Double-click edge', 'Delete edge'],
                ['Shift + click edge', 'Delete edge'],
                ['Right-click canvas', 'Add node menu'],
                ['Drag from handle', 'Create connection'],
                ['Drop on empty', 'Add and connect node'],
                ['?', 'Toggle this help'],
              ].map(([key, description]) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <kbd className="px-1.5 py-0.5 rounded bg-surface-300 border border-border text-[10px] font-mono text-foreground">{key}</kbd>
                  <span className="text-fg-muted">{description}</span>
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
    </div>
  );
}
