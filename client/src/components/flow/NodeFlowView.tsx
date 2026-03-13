import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  getSmoothStepPath,
  ReactFlow,
  SelectionMode,
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
  RectangleHorizontal,
  Server,
  Sun,
} from 'lucide-react';

import type { FlowEdge, FlowNode, NodeType } from '@shared/types';

import { useFlowStore, type ResolvedPath } from '@/stores/flowStore';
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

export function getMiniMapNodeColor(type?: string | null) {
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
  const zoomInNonce = useUiStore((state) => state.zoomInNonce);
  const zoomOutNonce = useUiStore((state) => state.zoomOutNonce);
  const {
    activeSceneId,
    flowNodes,
    flowEdges: storeEdges,
    selectedNodeId,
    viewport,
    selectNode,
    addNode,
    addEdge: storeAddEdge,
    setSelectedNodeIds,
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
  const linkSameType = useUiStore((s) => s.linkSameType);
  const moveParents = useUiStore((s) => s.moveParents);
  const splitOutputs = useUiStore((s) => s.splitOutputs);
  const resolvedPaths = useFlowStore((s) => s.resolvedPaths);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingConnectionRef = useRef<PendingConnectionState | null>(null);
  const autoSuggestJustSetRef = useRef(false);
  const lastAppliedViewportSceneRef = useRef<string | null>(null);
  const lastAutoLayoutNonceRef = useRef(autoLayoutNonce);
  const lastFitViewNonceRef = useRef(fitViewNonce);
  const lastZoomInNonceRef = useRef(zoomInNonce);
  const lastZoomOutNonceRef = useRef(zoomOutNonce);
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

  // When splitOutputs is on, replace each output node with per-path virtual nodes
  const { displayNodes, displayEdges, nodeIdMap, edgeIdMap, splitPathMap } = useMemo(() => {
    const emptyResult = {
      displayNodes: visibleFlowNodes,
      displayEdges: visibleStoreEdges,
      nodeIdMap: new Map<string, string>(),
      edgeIdMap: new Map<string, string>(),
      splitPathMap: new Map<string, ResolvedPath>(),
    };
    if (!splitOutputs || resolvedPaths.length === 0) return emptyResult;

    const nMap = new Map<string, string>();
    const eMap = new Map<string, string>();
    const pMap = new Map<string, ResolvedPath>();
    const newNodes: FlowNode[] = [];
    const newEdges: FlowEdge[] = [];
    const outputNodeIds = new Set(
      visibleFlowNodes.filter((n) => n.type === 'output').map((n) => n.id)
    );

    for (const node of visibleFlowNodes) {
      if (node.type !== 'output') {
        newNodes.push(node);
      }
    }

    for (const node of visibleFlowNodes) {
      if (node.type !== 'output') continue;
      const paths = resolvedPaths.filter((p) => p.outputNodeId === node.id);
      if (paths.length === 0) {
        newNodes.push(node);
        continue;
      }
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const virtualId = `${node.id}__split__${i}`;
        nMap.set(virtualId, node.id);
        pMap.set(virtualId, path);
        newNodes.push({
          ...node,
          id: virtualId,
          label: path.cameraName,
          position: { x: node.position.x, y: node.position.y + i * 80 },
        });
      }
    }

    for (const edge of visibleStoreEdges) {
      if (!outputNodeIds.has(edge.target)) {
        newEdges.push(edge);
        continue;
      }
      const paths = resolvedPaths.filter((p) => p.outputNodeId === edge.target);
      if (paths.length === 0) {
        newEdges.push(edge);
        continue;
      }
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        const nodeIds = path.nodeIds;
        const outputIdx = nodeIds.indexOf(edge.target);
        if (outputIdx < 1) continue;
        if (nodeIds[outputIdx - 1] === edge.source) {
          const virtualTargetId = `${edge.target}__split__${i}`;
          const virtualEdgeId = `${edge.id}__split__${i}`;
          eMap.set(virtualEdgeId, edge.id);
          newEdges.push({ ...edge, id: virtualEdgeId, target: virtualTargetId });
        }
      }
    }

    return { displayNodes: newNodes, displayEdges: newEdges, nodeIdMap: nMap, edgeIdMap: eMap, splitPathMap: pMap };
  }, [splitOutputs, resolvedPaths, visibleFlowNodes, visibleStoreEdges]);

  // Use the FULL graph for semantics so hidden cameras still count for edge coloring
  const semantics = useMemo(
    () => getFlowSemantics(flowNodes, storeEdges, selectedNodeId),
    [flowNodes, storeEdges, selectedNodeId]
  );
  const handleLayout = useMemo(
    () => getFlowHandleLayout(displayNodes, displayEdges),
    [displayNodes, displayEdges]
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
      displayNodes.map((node) => {
        const originalId = nodeIdMap.get(node.id) ?? node.id;
        const isVirtual = nodeIdMap.has(node.id);
        return {
          id: node.id,
          type: node.type,
          position: node.position,
          draggable: !isVirtual,
          connectable: !isVirtual,
          data: {
            label: node.label,
            nodeType: node.type,
            camera_id: node.camera_id,
            config_id: node.config_id,
            hide_previous: node.hide_previous,
            enabled: node.enabled,
            outputHandleLabels: semantics.outputHandleLabels.get(originalId) ?? {},
            isPathHighlighted: semantics.highlightedNodeIds.has(originalId),
            isPathDimmed: hasCameraSelection && !semantics.highlightedNodeIds.has(originalId),
            inputHandleIds: handleLayout.nodeHandles.get(node.id)?.inputHandleIds ?? [],
            outputHandleIds: handleLayout.nodeHandles.get(node.id)?.outputHandleIds ?? [],
            splitPath: splitPathMap.get(node.id),
            originalNodeId: isVirtual ? originalId : undefined,
          },
        };
      }),
    [displayNodes, semantics, hasCameraSelection, handleLayout.nodeHandles, nodeIdMap, splitPathMap]
  );

  // Compute routing offsets so parallel edges form a staircase instead of overlapping
  const routingOffsets = useMemo(() => {
    const offsets = new Map<string, number>();
    const nodeMap = new Map(displayNodes.map((n) => [n.id, n]));
    const STEP = 12;

    // Target-side: spread edges converging on the same target node
    const byTarget = new Map<string, FlowEdge[]>();
    for (const edge of displayEdges) {
      const group = byTarget.get(edge.target);
      if (group) group.push(edge);
      else byTarget.set(edge.target, [edge]);
    }
    for (const [, edges] of byTarget) {
      if (edges.length <= 1) continue;
      const sorted = [...edges].sort((a, b) =>
        (nodeMap.get(a.source)?.position.y ?? 0) - (nodeMap.get(b.source)?.position.y ?? 0)
      );
      for (let i = 0; i < sorted.length; i++) {
        offsets.set(sorted[i].id, (i - (sorted.length - 1) / 2) * STEP);
      }
    }

    // Source-side: spread edges diverging from the same source node
    const bySource = new Map<string, FlowEdge[]>();
    for (const edge of displayEdges) {
      const group = bySource.get(edge.source);
      if (group) group.push(edge);
      else bySource.set(edge.source, [edge]);
    }
    for (const [, edges] of bySource) {
      if (edges.length <= 1) continue;
      const sorted = [...edges].sort((a, b) =>
        (nodeMap.get(a.target)?.position.y ?? 0) - (nodeMap.get(b.target)?.position.y ?? 0)
      );
      for (let i = 0; i < sorted.length; i++) {
        const off = (i - (sorted.length - 1) / 2) * STEP;
        const existing = offsets.get(sorted[i].id) ?? 0;
        offsets.set(sorted[i].id, existing + off);
      }
    }

    return offsets;
  }, [displayNodes, displayEdges]);

  const rfEdges: Edge[] = useMemo(
    () =>
      displayEdges.map((edge) => {
        const originalId = edgeIdMap.get(edge.id) ?? edge.id;
        const cameraCount = semantics.edgeCameraCounts.get(originalId) ?? 0;
        const handleAssignment = handleLayout.edgeHandles.get(edge.id);

        return {
          id: edge.id,
          source: edge.source,
          target: edge.target,
          sourceHandle: handleAssignment?.sourceHandle,
          targetHandle: handleAssignment?.targetHandle,
          type: 'colored',
          data: {
            cameraCount,
            hoverLabel: semantics.edgeLabels.get(originalId),
            isPathHighlighted: semantics.highlightedEdgeIds.has(originalId),
            isPathDimmed: hasCameraSelection && !semantics.highlightedEdgeIds.has(originalId),
            shouldAnimateFlow: hasCameraSelection && semantics.highlightedEdgeIds.has(originalId),
            routingOffset: routingOffsets.get(edge.id) ?? 0,
          },
        };
      }),
    [displayEdges, semantics, hasCameraSelection, handleLayout.edgeHandles, edgeIdMap, routingOffsets]
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(rfNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(rfEdges);

  useEffect(() => {
    setNodes(rfNodes);
  }, [rfNodes, setNodes]);

  useEffect(() => {
    setEdges(rfEdges);
  }, [rfEdges, setEdges]);

  // Sync React Flow's multi-selection state to the store
  useEffect(() => {
    const ids = nodes.filter((n) => n.selected).map((n) => n.id);
    setSelectedNodeIds(ids);
  }, [nodes, setSelectedNodeIds]);

  useEffect(() => {
    if (!activeSceneId) return;
    if (lastAppliedViewportSceneRef.current === activeSceneId) return;

    lastAppliedViewportSceneRef.current = activeSceneId;
    // Read viewport directly from store to avoid re-running on every viewport change
    const currentViewport = useFlowStore.getState().viewport;
    void reactFlowInstance.setViewport(currentViewport, { duration: 0 });
  }, [activeSceneId, reactFlowInstance]);

  const scheduleSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void saveGraph();
    }, 2000);
  }, [saveGraph]);

  const fitGraphToView = useCallback(() => {
    if (visibleFlowNodes.length > 0) {
      void reactFlowInstance.fitView({ duration: 220, padding: 0.18 });
    }
  }, [reactFlowInstance, visibleFlowNodes]);

  // Build a set of upstream (parent) node IDs for a given node by walking edges backwards
  const getUpstreamNodeIds = useCallback(
    (nodeId: string): Set<string> => {
      const upstream = new Set<string>();
      const queue = [nodeId];
      while (queue.length > 0) {
        const current = queue.shift()!;
        for (const edge of visibleStoreEdges) {
          if (edge.target === current && !upstream.has(edge.source)) {
            upstream.add(edge.source);
            queue.push(edge.source);
          }
        }
      }
      return upstream;
    },
    [visibleStoreEdges]
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<Node>[]) => {
      let finalChanges = changes;
      const extra: NodeChange<Node>[] = [];

      for (const change of changes) {
        if (change.type !== 'position' || !change.dragging || !change.position) continue;

        const draggedNode = nodes.find((n) => n.id === change.id);
        if (!draggedNode) continue;

        const dx = change.position.x - draggedNode.position.x;
        const dy = change.position.y - draggedNode.position.y;
        if (dx === 0 && dy === 0) continue;

        const alreadyMoved = new Set<string>([change.id]);

        // Link same type: move all nodes of the same type
        if (linkSameType) {
          for (const node of nodes) {
            if (node.type === draggedNode.type && !alreadyMoved.has(node.id)) {
              alreadyMoved.add(node.id);
              extra.push({
                type: 'position',
                id: node.id,
                position: { x: node.position.x + dx, y: node.position.y + dy },
                dragging: true,
              });
            }
          }
        }

        // Move parents: move all upstream/parent nodes
        if (moveParents) {
          const upstreamIds = getUpstreamNodeIds(change.id);
          for (const node of nodes) {
            if (upstreamIds.has(node.id) && !alreadyMoved.has(node.id)) {
              alreadyMoved.add(node.id);
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

      if (extra.length > 0) {
        finalChanges = [...changes, ...extra];
      }

      onNodesChange(finalChanges);

      // Persist positions on drag end
      for (const change of changes) {
        if (change.type === 'position' && change.position && !change.dragging) {
          updateNodePosition(change.id, change.position);

          // Also persist co-moved nodes
          if (linkSameType || moveParents) {
            const draggedNode = nodes.find((n) => n.id === change.id);
            if (draggedNode) {
              const saved = new Set<string>([change.id]);
              if (linkSameType) {
                for (const node of nodes) {
                  if (node.type === draggedNode.type && !saved.has(node.id)) {
                    saved.add(node.id);
                    updateNodePosition(node.id, node.position);
                  }
                }
              }
              if (moveParents) {
                const upstreamIds = getUpstreamNodeIds(change.id);
                for (const node of nodes) {
                  if (upstreamIds.has(node.id) && !saved.has(node.id)) {
                    saved.add(node.id);
                    updateNodePosition(node.id, node.position);
                  }
                }
              }
            }
          }

          scheduleSave();
        }
      }
    },
    [onNodesChange, scheduleSave, updateNodePosition, linkSameType, moveParents, nodes, getUpstreamNodeIds]
  );

  const connectAllOutputs = useCallback(
    (sourceId: string, targetId: string): boolean => {
      const existingEdges = useFlowStore.getState().flowEdges.filter((e) => e.source === sourceId);
      let maxSourceIndex = -1;
      for (const edge of existingEdges) {
        const match = edge.source_handle?.match(/-(\d+)$/);
        if (match) {
          maxSourceIndex = Math.max(maxSourceIndex, Number.parseInt(match[1], 10));
        }
      }

      const distinctSourceHandles = new Set(existingEdges.map((e) => e.source_handle).filter(Boolean));
      const laneCount = Math.max(distinctSourceHandles.size, 1);

      let changed = false;
      for (let i = 0; i < laneCount; i++) {
        const sourceHandle = `source-${maxSourceIndex + 1 + i}`;
        const targetHandle = `target-${i}`;
        if (storeAddEdge(sourceId, targetId, sourceHandle, targetHandle)) {
          changed = true;
        }
      }
      return changed;
    },
    [storeAddEdge]
  );

  const onConnect: OnConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target) return;

      let changed = false;

      if (params.sourceHandle === 'source-all') {
        changed = connectAllOutputs(params.source, params.target);
      } else {
        // Normal single-handle connection — pass handle IDs from React Flow
        changed = storeAddEdge(
          params.source,
          params.target,
          params.sourceHandle ?? null,
          params.targetHandle ?? null
        );
      }

      // Multi-select: also wire all other selected nodes to the same target
      const selectedNodes = nodes.filter((n) => n.selected && n.id !== params.source && n.id !== params.target);
      for (const node of selectedNodes) {
        if (storeAddEdge(node.id, params.target, null, null)) changed = true;
      }

      if (changed) scheduleSave();
    },
    [scheduleSave, storeAddEdge, nodes, connectAllOutputs]
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

      if (event.key === 'Delete' || event.key === 'Backspace') {
        const selectedIds = nodes.filter((n) => n.selected).map((n) => n.id);
        if (selectedIds.length === 0 && selectedNodeId) {
          selectedIds.push(selectedNodeId);
        }
        if (selectedIds.length > 0) {
          event.preventDefault();
          for (const id of selectedIds) removeNode(id);
          scheduleSave();
          return;
        }
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
        return;
      }

      if (!event.ctrlKey && !event.metaKey && !event.altKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        fitGraphToView();
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
    fitGraphToView,
    removeNode,
    resolvePaths,
    saveGraph,
    scheduleSave,
    selectNode,
    selectedNodeId,
    nodes,
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
          if (sourceHandleId === 'source-all') {
            connectAllOutputs(sourceId, newest.id);
          } else {
            storeAddEdge(sourceId, newest.id, sourceHandleId ?? null, null);
          }

          // Multi-select: also wire all other selected nodes to the new node
          const selectedNodes = nodes.filter((n) => n.selected && n.id !== sourceId);
          for (const node of selectedNodes) {
            storeAddEdge(node.id, newest.id, null, null);
          }
        }
      }
      scheduleSave();
      setContextMenu(null);
      setAutoSuggest(null);
    },
    [addNode, scheduleSave, storeAddEdge, nodes, connectAllOutputs]
  );

  const handleConnectToExistingNode = useCallback(
    (sourceId: string, targetId: string, sourceHandleId?: string | null) => {
      let changed = false;

      if (sourceHandleId === 'source-all') {
        changed = connectAllOutputs(sourceId, targetId);
      } else {
        changed = storeAddEdge(sourceId, targetId, sourceHandleId ?? null, null);
      }

      // Multi-select: also wire all other selected nodes to the target
      const selectedNodes = nodes.filter((n) => n.selected && n.id !== sourceId && n.id !== targetId);
      for (const node of selectedNodes) {
        if (storeAddEdge(node.id, targetId, null, null)) changed = true;
      }

      if (changed) {
        scheduleSave();
        selectNode(targetId);
      }
      setAutoSuggest(null);
    },
    [scheduleSave, selectNode, storeAddEdge, nodes, connectAllOutputs]
  );

  useEffect(() => {
    if (autoLayoutNonce === lastAutoLayoutNonceRef.current) return;
    lastAutoLayoutNonceRef.current = autoLayoutNonce;
    const { flowNodes: nodes, flowEdges: edges } = useFlowStore.getState();
    if (nodes.length === 0) return;
    const nextPositions = getAutoLayoutPositions(nodes, edges);
    if (Object.keys(nextPositions).length === 0) return;
    applyNodeLayout(nextPositions);
  }, [applyNodeLayout, autoLayoutNonce]);

  useEffect(() => {
    if (fitViewNonce === lastFitViewNonceRef.current) return;
    lastFitViewNonceRef.current = fitViewNonce;
    fitGraphToView();
  }, [fitGraphToView, fitViewNonce]);

  useEffect(() => {
    if (zoomInNonce === lastZoomInNonceRef.current) return;
    lastZoomInNonceRef.current = zoomInNonce;
    void reactFlowInstance.zoomIn({ duration: 200 });
  }, [zoomInNonce, reactFlowInstance]);

  useEffect(() => {
    if (zoomOutNonce === lastZoomOutNonceRef.current) return;
    lastZoomOutNonceRef.current = zoomOutNonce;
    void reactFlowInstance.zoomOut({ duration: 200 });
  }, [zoomOutNonce, reactFlowInstance]);

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
        onMove={(_event, nextViewport) => updateViewport(nextViewport)}
        onMoveEnd={(_event, nextViewport) => updateViewport(nextViewport)}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        connectionLineComponent={BranchConnectionLine}
        defaultViewport={initialViewport}
        fitView={false}
        autoPanOnNodeFocus={false}
        autoPanOnConnect={false}
        autoPanOnNodeDrag={false}
        minZoom={0.1}
        maxZoom={3}
        snapToGrid
        snapGrid={[20, 20]}
        selectionMode={SelectionMode.Partial}
        deleteKeyCode={null}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(190 12% 20%)" />
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
