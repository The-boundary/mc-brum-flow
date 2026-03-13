/**
 * flowCoordinator.ts
 *
 * Orchestration module that coordinates across multiple stores.
 * This is NOT a Zustand store — it's a plain module with exported functions.
 *
 * During the decomposition migration, all state reads/writes go through
 * useFlowStore.getState() since it still holds all state. As sub-stores
 * become the primary owners, reads/writes will shift to them.
 */

import { useFlowStore } from './flowStore';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { getFlowHandleLayout } from '@/components/flow/flowLayout';
import type {
  Scene,
  Camera,
  StudioDefault,
  NodeConfig,
  FlowNode,
  FlowEdge,
  FlowConfig,
  NodeType,
  MaxSyncState,
} from '@shared/types';
import type { MaxDebugLogEntry, MaxTcpInstance } from './types';

// ---------------------------------------------------------------------------
// Module-level state for debounced persistence
// ---------------------------------------------------------------------------
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistNeedsResolve = false;

// ---------------------------------------------------------------------------
// Helpers (duplicated from flowStore — shared until refactored)
// ---------------------------------------------------------------------------

function isFlowConfigPayload(value: unknown): value is FlowConfig {
  if (typeof value !== 'object' || value === null) return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.scene_id === 'string' &&
    Array.isArray(row.nodes) &&
    Array.isArray(row.edges)
  );
}

function areSerializedValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function normalizeFlowEdges(flowNodes: FlowNode[], flowEdges: FlowEdge[]) {
  const layout = getFlowHandleLayout(flowNodes, flowEdges);
  return flowEdges.map((edge) => {
    const assigned = layout.edgeHandles.get(edge.id);
    return {
      ...edge,
      source_handle: assigned?.sourceHandle ?? edge.source_handle,
      target_handle: assigned?.targetHandle ?? edge.target_handle,
    };
  });
}

let nextNodeId = 1;

function genNodeId(): string {
  return `node_${Date.now()}_${nextNodeId++}`;
}

// ---------------------------------------------------------------------------
// scheduleStoreSave
// ---------------------------------------------------------------------------

/**
 * Debounced save + optional resolve. Module-level timer ensures only one
 * pending save at a time, coalescing rapid mutations into a single API call.
 */
export function scheduleStoreSave(
  saveGraphFn: () => Promise<void>,
  resolvePathsFn?: () => Promise<void>,
  needsResolve = false,
) {
  persistNeedsResolve = persistNeedsResolve || needsResolve;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const shouldResolve = persistNeedsResolve;
    persistNeedsResolve = false;
    void saveGraphFn().then(async () => {
      if (shouldResolve && resolvePathsFn) {
        await resolvePathsFn();
      }
    });
  }, 400);
}

// ---------------------------------------------------------------------------
// saveGraph
// ---------------------------------------------------------------------------

/**
 * Persist the current flow graph (nodes, edges, viewport) for the active scene.
 */
export async function saveGraph(): Promise<void> {
  const { activeSceneId, flowNodes, flowEdges, viewport } = useFlowStore.getState();
  if (!activeSceneId) return;
  try {
    await api.saveFlowConfig({
      scene_id: activeSceneId,
      nodes: flowNodes,
      edges: flowEdges,
      viewport,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save graph';
    useFlowStore.setState({ error: message });
    useFlowStore.getState().showToast(message, 'error');
  }
}

// ---------------------------------------------------------------------------
// resolvePaths (convenience wrapper)
// ---------------------------------------------------------------------------

/**
 * Resolve output paths for the active scene.
 */
export async function resolvePaths(): Promise<void> {
  const { activeSceneId } = useFlowStore.getState();
  if (!activeSceneId) return;
  try {
    const result = await api.resolvePaths(activeSceneId);
    useFlowStore.setState({
      resolvedPaths: result.paths,
      pathCount: result.count,
      pathResolutionError: false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Path resolution failed';
    console.warn('Path resolution failed:', message);
    useFlowStore.getState().showToast(`Path resolution failed: ${message}`, 'error');
    useFlowStore.setState({ pathResolutionError: true });
  }
}

// ---------------------------------------------------------------------------
// loadAll
// ---------------------------------------------------------------------------

/**
 * Orchestrate initial data loading: scenes, studio defaults, node configs,
 * then for the active scene: cameras, flow config, max sync state, then resolve.
 */
export async function loadAll(): Promise<void> {
  useFlowStore.setState({ loading: true, error: null });
  try {
    const [scenes, defaults, configs] = await Promise.all([
      api.fetchScenes(),
      api.fetchStudioDefaults(),
      api.fetchNodeConfigs(),
    ]);
    const scenesList = Array.isArray(scenes) ? scenes : [];
    const defaultsList = Array.isArray(defaults) ? defaults : [];
    const configsList = Array.isArray(configs) ? configs : [];
    const activeId = scenesList[0]?.id ?? null;
    if (scenesList.length > 1) {
      console.info(`Auto-selected first scene "${scenesList[0]?.name}" out of ${scenesList.length} scenes`);
    }

    let cameras: Camera[] = [];
    let flowNodes: FlowNode[] = [];
    let flowEdges: FlowEdge[] = [];
    let flowEdgesWereNormalized = false;
    let viewport = { x: 0, y: 0, zoom: 1 };
    let maxSyncState: MaxSyncState | null = null;

    if (activeId) {
      const [cams, flowConfig, syncState] = await Promise.all([
        api.fetchCameras(activeId),
        api.fetchFlowConfig(activeId),
        api.fetchMaxSyncState(activeId),
      ]);
      cameras = cams;
      if (flowConfig) {
        flowNodes = flowConfig.nodes ?? [];
        flowEdges = normalizeFlowEdges(flowNodes, flowConfig.edges ?? []);
        flowEdgesWereNormalized = (flowConfig.edges ?? []).some(
          (edge: FlowEdge) => !edge.source_handle || !edge.target_handle,
        );
        viewport = flowConfig.viewport ?? viewport;
      }
      maxSyncState = syncState;
    }

    useFlowStore.setState({
      scenes: scenesList,
      activeSceneId: activeId,
      cameras,
      studioDefaults: defaultsList,
      nodeConfigs: configsList,
      flowNodes,
      flowEdges,
      viewport,
      maxSyncState,
      loading: false,
    });

    if (activeId) {
      if (flowEdgesWereNormalized) {
        await saveGraph();
      }
      resolvePaths();
    }
  } catch (err) {
    useFlowStore.setState({
      loading: false,
      error: err instanceof Error ? err.message : 'Failed to load data',
    });
  }
}

// ---------------------------------------------------------------------------
// setActiveScene
// ---------------------------------------------------------------------------

/**
 * Switch to a different scene: fetch cameras, flow config, max sync state,
 * normalize edges, then resolve paths.
 */
export async function setActiveScene(id: string): Promise<void> {
  useFlowStore.setState({ activeSceneId: id, selectedNodeId: null, loading: true });
  try {
    const [cams, flowConfig, maxSyncState] = await Promise.all([
      api.fetchCameras(id),
      api.fetchFlowConfig(id),
      api.fetchMaxSyncState(id),
    ]);
    const normalizedEdges = normalizeFlowEdges(
      flowConfig?.nodes ?? [],
      flowConfig?.edges ?? [],
    );
    const flowEdgesWereNormalized = (flowConfig?.edges ?? []).some(
      (edge: FlowEdge) => !edge.source_handle || !edge.target_handle,
    );
    useFlowStore.setState({
      cameras: cams,
      flowNodes: flowConfig?.nodes ?? [],
      flowEdges: normalizedEdges,
      viewport: flowConfig?.viewport ?? { x: 0, y: 0, zoom: 1 },
      maxSyncState,
      loading: false,
    });
    if (flowEdgesWereNormalized) {
      await saveGraph();
    }
    resolvePaths();
  } catch (err) {
    useFlowStore.setState({
      loading: false,
      error: err instanceof Error ? err.message : 'Failed to load scene',
    });
  }
}

// ---------------------------------------------------------------------------
// initSocket
// ---------------------------------------------------------------------------

/**
 * Subscribe to all socket events. Side effects update flowStore state
 * and trigger path resolution where needed.
 */
export function initSocket(): void {
  const socket = getSocket();

  // Remove all existing listeners to prevent duplicates on re-mount
  socket.removeAllListeners('scene:created');
  socket.removeAllListeners('scene:deleted');
  socket.removeAllListeners('camera:upserted');
  socket.removeAllListeners('camera:deleted');
  socket.removeAllListeners('studio-defaults:updated');
  socket.removeAllListeners('node-config:created');
  socket.removeAllListeners('node-config:updated');
  socket.removeAllListeners('node-config:deleted');
  socket.removeAllListeners('flow-config:updated');
  socket.removeAllListeners('max-sync:updated');
  socket.removeAllListeners('max-tcp:connected');
  socket.removeAllListeners('max-tcp:disconnected');
  socket.removeAllListeners('max-tcp:instances');
  socket.removeAllListeners('max-tcp:file-opened');
  socket.removeAllListeners('max:log');

  socket.on('scene:created', (row: Scene) => {
    useFlowStore.setState((s) => ({
      scenes: [...s.scenes.filter((sc) => sc.id !== row.id), row],
    }));
  });

  socket.on('scene:deleted', ({ id }: { id: string }) => {
    useFlowStore.setState((s) => {
      const remaining = s.scenes.filter((sc) => sc.id !== id);
      const needSwitch = s.activeSceneId === id;
      return {
        scenes: remaining,
        activeSceneId: needSwitch ? (remaining[0]?.id ?? null) : s.activeSceneId,
      };
    });
  });

  socket.on('camera:upserted', (row: Camera) => {
    useFlowStore.setState((s) => {
      const exists = s.cameras.some((c) => c.id === row.id);
      return {
        cameras: exists
          ? s.cameras.map((c) => (c.id === row.id ? row : c))
          : [...s.cameras, row],
      };
    });
  });

  socket.on('camera:deleted', ({ id }: { id: string }) => {
    useFlowStore.setState((s) => ({
      cameras: s.cameras.filter((c) => c.id !== id),
    }));
  });

  socket.on('studio-defaults:updated', (row: StudioDefault) => {
    useFlowStore.setState((s) => ({
      studioDefaults: s.studioDefaults.map((d) => (d.id === row.id ? row : d)),
    }));
    void resolvePaths();
  });

  socket.on('node-config:created', (row: NodeConfig) => {
    useFlowStore.setState((s) => ({
      nodeConfigs: [...s.nodeConfigs.filter((c) => c.id !== row.id), row],
    }));
    void resolvePaths();
  });

  socket.on('node-config:updated', (row: NodeConfig) => {
    useFlowStore.setState((s) => ({
      nodeConfigs: s.nodeConfigs.map((c) => (c.id === row.id ? row : c)),
    }));
    void resolvePaths();
  });

  socket.on('node-config:deleted', ({ id }: { id: string }) => {
    useFlowStore.setState((s) => ({
      nodeConfigs: s.nodeConfigs.filter((c) => c.id !== id),
    }));
    void resolvePaths();
  });

  socket.on('flow-config:updated', (row: unknown) => {
    if (!isFlowConfigPayload(row)) return;
    const { activeSceneId } = useFlowStore.getState();
    if (row.scene_id === activeSceneId) {
      const nextNodes = row.nodes ?? [];
      const nextEdges = normalizeFlowEdges(nextNodes, row.edges ?? []);
      const currentState = useFlowStore.getState();
      const nodesChanged = !areSerializedValuesEqual(currentState.flowNodes, nextNodes);
      const edgesChanged = !areSerializedValuesEqual(currentState.flowEdges, nextEdges);

      if (!nodesChanged && !edgesChanged) {
        return;
      }

      useFlowStore.setState({
        flowNodes: nextNodes,
        flowEdges: nextEdges,
      });
      void resolvePaths();
    }
  });

  socket.on('max:log', (entry: MaxDebugLogEntry) => {
    useFlowStore.setState((s) => ({
      maxDebugLog: [entry, ...s.maxDebugLog].slice(0, 200),
    }));
  });

  socket.on('max-sync:updated', (row: MaxSyncState) => {
    const { activeSceneId } = useFlowStore.getState();
    if (row.scene_id === activeSceneId) {
      const prev = useFlowStore.getState().maxSyncState;
      useFlowStore.setState({ maxSyncState: row });
      // Auto-log sync completions
      if (prev?.status !== row.status && (row.status === 'success' || row.status === 'error')) {
        useFlowStore.getState().addSyncLog({
          status: row.status,
          reason: row.last_reason || 'auto-sync',
          cameraName: row.active_camera_name || undefined,
          pathKey: row.active_path_key || undefined,
          error: row.last_error || undefined,
        });
      }
    }
  });

  // Max TCP instance events
  socket.on('max-tcp:instances', (list: MaxTcpInstance[]) => {
    useFlowStore.setState({ maxTcpInstances: list });
  });

  socket.on('max-tcp:connected', (instance: MaxTcpInstance) => {
    useFlowStore.setState((s) => ({
      maxTcpInstances: [...s.maxTcpInstances.filter((i) => i.id !== instance.id), instance],
    }));
    useFlowStore.getState().showToast(`3ds Max connected: ${instance.hostname}`, 'success');
  });

  socket.on('max-tcp:disconnected', ({ instanceId }: { instanceId: string }) => {
    useFlowStore.setState((s) => ({
      maxTcpInstances: s.maxTcpInstances.filter((i) => i.id !== instanceId),
    }));
  });

  socket.on('max-tcp:file-opened', ({ instanceId, filename }: { instanceId: string; filename: string }) => {
    useFlowStore.setState((s) => ({
      maxTcpInstances: s.maxTcpInstances.map((i) =>
        i.id === instanceId ? { ...i, currentFile: filename } : i,
      ),
    }));
    const shortName = filename.split(/[/\\]/).pop() || filename;
    useFlowStore.getState().showToast(`3ds Max opened: ${shortName}`, 'info');
  });
}

// ---------------------------------------------------------------------------
// assignNodeConfig
// ---------------------------------------------------------------------------

/**
 * Assign (or clear) a node config on a flow node, then save and resolve.
 */
export async function assignNodeConfig(nodeId: string, configId?: string): Promise<void> {
  const config = configId
    ? useFlowStore.getState().nodeConfigs.find((entry) => entry.id === configId)
    : null;
  useFlowStore.setState((s) => ({
    flowNodes: s.flowNodes.map((node) => {
      if (node.id !== nodeId) return node;
      return {
        ...node,
        config_id: configId,
        ...(config ? { label: config.label } : {}),
      };
    }),
  }));
  await saveGraph();
  await resolvePaths();
}

// ---------------------------------------------------------------------------
// assignNodeCamera
// ---------------------------------------------------------------------------

/**
 * Assign a camera to a camera-type flow node, then save and resolve.
 */
export async function assignNodeCamera(nodeId: string, cameraId: string): Promise<void> {
  const camera = useFlowStore.getState().cameras.find((entry) => entry.id === cameraId);
  if (!camera) return;

  useFlowStore.setState((s) => ({
    flowNodes: s.flowNodes.map((node) =>
      node.id === nodeId && node.type === 'camera'
        ? { ...node, camera_id: cameraId, label: camera.name }
        : node,
    ),
  }));

  await saveGraph();
  await resolvePaths();
}

// ---------------------------------------------------------------------------
// scaffoldPipeline
// ---------------------------------------------------------------------------

/**
 * Create a default pipeline of nodes and edges representing the typical
 * camera-to-output render pipeline.
 */
export function scaffoldPipeline(): void {
  const PIPELINE_STAGES: { type: NodeType; label: string }[] = [
    { type: 'camera', label: 'Camera' },
    { type: 'group', label: 'Group' },
    { type: 'lightSetup', label: 'Light Setup' },
    { type: 'toneMapping', label: 'Tone Mapping' },
    { type: 'layerSetup', label: 'Layer Setup' },
    { type: 'aspectRatio', label: 'Aspect Ratio' },
    { type: 'stageRev', label: 'Rev B' },
    { type: 'deadline', label: 'Deadline' },
    { type: 'output', label: 'Output' },
  ];

  const xStart = 80;
  const xGap = 220;
  const yCenter = 200;
  const nodes: FlowNode[] = [];
  const edges: FlowEdge[] = [];

  for (let i = 0; i < PIPELINE_STAGES.length; i++) {
    const stage = PIPELINE_STAGES[i];
    const id = genNodeId();
    nodes.push({
      id,
      type: stage.type,
      label: stage.label,
      position: { x: xStart + i * xGap, y: yCenter },
      ...(stage.type === 'output' && { enabled: true }),
      ...(stage.type === 'group' && { hide_previous: false }),
    });

    if (i > 0) {
      const prevId = nodes[i - 1].id;
      edges.push({
        id: `${prevId}__${id}`,
        source: prevId,
        target: id,
        source_handle: 'source-0',
        target_handle: 'target-0',
      });
    }
  }

  useFlowStore.setState((s) => ({
    flowNodes: [...s.flowNodes, ...nodes],
    flowEdges: [...s.flowEdges, ...edges],
    selectedNodeId: nodes[0]?.id ?? s.selectedNodeId,
  }));

  scheduleStoreSave(saveGraph, resolvePaths, true);
  useFlowStore.getState().showToast('Scaffolded typical pipeline', 'success');
}
