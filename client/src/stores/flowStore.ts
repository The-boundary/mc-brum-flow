import { create } from 'zustand';
import { ApiError } from '@/lib/api';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { getFlowHandleLayout } from '@/components/flow/flowLayout';
import type { Scene, Camera, StudioDefault, NodeConfig, FlowNode, FlowEdge, NodeType, MaxSyncState } from '@shared/types';
import type { MaxHealthResult } from '@/lib/api';

export interface ResolvedPath {
  pathKey: string;
  nodeIds: string[];
  outputNodeId: string;
  cameraName: string;
  filename: string;
  resolvedConfig: Record<string, unknown>;
  enabled: boolean;
  stageLabels: Partial<Record<'lightSetup' | 'toneMapping' | 'layerSetup' | 'aspectRatio' | 'stageRev' | 'deadline' | 'override', string>>;
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  status: 'success' | 'error' | 'syncing' | 'queued';
  reason: string;
  cameraName?: string;
  pathKey?: string;
  error?: string;
  durationMs?: number;
}

export interface CameraMatchPrompt {
  nodeId: string;
  pathKey?: string;
  requestedCameraName: string;
  availableCameras: Camera[];
}

export interface MaxDebugLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'error' | 'warn';
  direction: 'outgoing' | 'incoming' | 'system';
  summary: string;
  detail?: string;
  durationMs?: number;
  host?: string;
  port?: number;
}

interface FlowState {
  // Data
  scenes: Scene[];
  activeSceneId: string | null;
  cameras: Camera[];
  studioDefaults: StudioDefault[];
  nodeConfigs: NodeConfig[];
  flowNodes: FlowNode[];
  flowEdges: FlowEdge[];
  viewport: { x: number; y: number; zoom: number };

  // Selection
  selectedNodeId: string | null;

  // Output preview
  resolvedPaths: ResolvedPath[];
  pathCount: number;
  maxSyncState: MaxSyncState | null;

  // Max connection
  maxHealth: MaxHealthResult | null;
  cameraMatchPrompt: CameraMatchPrompt | null;

  // Sync activity log
  syncLog: SyncLogEntry[];

  // Max debug log
  maxDebugLog: MaxDebugLogEntry[];

  // Toast notification
  toast: { message: string; level: 'info' | 'success' | 'error' } | null;

  // Loading
  loading: boolean;
  error: string | null;

  // Actions
  loadAll: () => Promise<void>;
  setActiveScene: (id: string) => Promise<void>;
  selectNode: (id: string | null) => void;
  addNode: (type: NodeType, position: { x: number; y: number }, configId?: string, cameraId?: string) => void;
  removeNode: (id: string) => void;
  addEdge: (source: string, target: string, sourceHandle?: string | null, targetHandle?: string | null) => boolean;
  removeEdge: (id: string) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  applyNodeLayout: (positions: Record<string, { x: number; y: number }>) => void;
  updateViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  assignNodeConfig: (nodeId: string, configId?: string) => Promise<void>;
  assignNodeCamera: (nodeId: string, cameraId: string) => Promise<void>;
  updateNodeLabel: (id: string, label: string) => void;
  toggleHidePrevious: (id: string) => void;
  setResolvedPathEnabled: (pathKey: string, outputNodeId: string, enabled: boolean) => Promise<void>;
  setOutputPathsEnabled: (outputNodeId: string, pathKeys: string[], enabled: boolean) => Promise<void>;
  setAllResolvedPathsEnabled: (enabled: boolean) => Promise<void>;
  saveGraph: () => Promise<void>;
  resolvePaths: () => Promise<void>;
  createNodeConfig: (nodeType: NodeType, label: string, delta: Record<string, unknown>) => Promise<NodeConfig | null>;
  updateNodeConfig: (id: string, updates: { label?: string; delta?: Record<string, unknown> }) => Promise<NodeConfig | null>;
  deleteNodeConfig: (id: string) => Promise<void>;
  initSocket: () => void;
  checkMaxHealth: () => Promise<void>;
  importCamerasFromMax: () => Promise<number>;
  pushToMax: (pathKey?: string, pathIndex?: number) => Promise<boolean>;
  submitRender: (pathIndices: number[]) => Promise<boolean>;
  addSyncLog: (entry: Omit<SyncLogEntry, 'id' | 'timestamp'>) => void;
  showToast: (message: string, level?: 'info' | 'success' | 'error') => void;
  dismissToast: () => void;
  clearMaxDebugLog: () => void;
  dismissCameraMatchPrompt: () => void;
}

let nextNodeId = 1;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistNeedsResolve = false;
let syncLogCounter = 0;

function genNodeId(): string {
  return `node_${Date.now()}_${nextNodeId++}`;
}

function scheduleStoreSave(
  saveGraph: () => Promise<void>,
  resolvePaths?: () => Promise<void>,
  needsResolve = false,
) {
  persistNeedsResolve = persistNeedsResolve || needsResolve;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const shouldResolve = persistNeedsResolve;
    persistNeedsResolve = false;
    void saveGraph().then(async () => {
      if (shouldResolve && resolvePaths) {
        await resolvePaths();
      }
    });
  }, 400);
}

function areSerializedValuesEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

const DIRECT_CONNECTIONS: Record<NodeType, NodeType[]> = {
  camera: ['group', 'lightSetup'],
  group: ['group', 'lightSetup'],
  lightSetup: ['override', 'toneMapping'],
  toneMapping: ['override', 'layerSetup'],
  layerSetup: ['override', 'aspectRatio'],
  aspectRatio: ['override', 'stageRev'],
  stageRev: ['override', 'deadline'],
  override: [],
  deadline: ['output'],
  output: [],
};

const OVERRIDABLE_SOURCE_TYPES = new Set<NodeType>([
  'lightSetup',
  'toneMapping',
  'layerSetup',
  'aspectRatio',
  'stageRev',
]);

function getNextPipelineType(type: NodeType): NodeType | null {
  return (DIRECT_CONNECTIONS[type] ?? []).find((targetType) => targetType !== 'override') ?? null;
}

function isValidFlowConnection(sourceNodeId: string, targetNodeId: string, flowNodes: FlowNode[], flowEdges: FlowEdge[]) {
  if (sourceNodeId === targetNodeId) return false;

  const nodesById = new Map(flowNodes.map((node) => [node.id, node]));
  const sourceNode = nodesById.get(sourceNodeId);
  const targetNode = nodesById.get(targetNodeId);
  if (!sourceNode || !targetNode) return false;

  if (sourceNode.type !== 'override') {
    return (DIRECT_CONNECTIONS[sourceNode.type] ?? []).includes(targetNode.type);
  }

  const incoming = new Map<string, FlowEdge[]>();
  for (const edge of flowEdges) {
    const existing = incoming.get(edge.target);
    if (existing) {
      existing.push(edge);
    } else {
      incoming.set(edge.target, [edge]);
    }
  }

  const queue = [sourceNodeId];
  const visited = new Set<string>();
  const continuationTypes = new Set<NodeType>();

  while (queue.length > 0) {
    const nodeId = queue.shift();
    if (!nodeId || visited.has(nodeId)) continue;
    visited.add(nodeId);

    for (const edge of incoming.get(nodeId) ?? []) {
      const upstreamNode = nodesById.get(edge.source);
      if (!upstreamNode) continue;

      if (upstreamNode.type === 'override') {
        queue.push(upstreamNode.id);
        continue;
      }

      if (!OVERRIDABLE_SOURCE_TYPES.has(upstreamNode.type)) {
        continue;
      }

      const nextType = getNextPipelineType(upstreamNode.type);
      if (nextType) {
        continuationTypes.add(nextType);
      }
    }
  }

  return continuationTypes.size === 1 && continuationTypes.has(targetNode.type);
}

function normalizeFlowEdges(flowNodes: FlowNode[], flowEdges: FlowEdge[]) {
  const layout = getFlowHandleLayout(flowNodes, flowEdges);
  return flowEdges.map((edge) => {
    const assigned = layout.edgeHandles.get(edge.id);
    return {
      ...edge,
      source_handle: edge.source_handle ?? assigned?.sourceHandle,
      target_handle: edge.target_handle ?? assigned?.targetHandle,
    };
  });
}

export const useFlowStore = create<FlowState>()((set, get) => ({
  scenes: [],
  activeSceneId: null,
  cameras: [],
  studioDefaults: [],
  nodeConfigs: [],
  flowNodes: [],
  flowEdges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
  selectedNodeId: null,
  resolvedPaths: [],
  pathCount: 0,
  maxSyncState: null,
  maxHealth: null,
  cameraMatchPrompt: null,
  syncLog: [],
  maxDebugLog: [],
  toast: null,
  loading: true,
  error: null,

  loadAll: async () => {
    set({ loading: true, error: null });
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
          flowNodes = flowConfig.nodes || [];
          flowEdges = normalizeFlowEdges(flowNodes, flowConfig.edges || []);
          flowEdgesWereNormalized = (flowConfig.edges || []).some((edge: FlowEdge) => !edge.source_handle || !edge.target_handle);
          viewport = flowConfig.viewport || viewport;
        }
        maxSyncState = syncState;
      }

      set({
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
          await get().saveGraph();
        }
        get().resolvePaths();
      }
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load data' });
    }
  },

  setActiveScene: async (id: string) => {
    set({ activeSceneId: id, selectedNodeId: null, loading: true });
    try {
      const [cams, flowConfig, maxSyncState] = await Promise.all([
        api.fetchCameras(id),
        api.fetchFlowConfig(id),
        api.fetchMaxSyncState(id),
      ]);
      const normalizedEdges = normalizeFlowEdges(flowConfig?.nodes || [], flowConfig?.edges || []);
      const flowEdgesWereNormalized = (flowConfig?.edges || []).some((edge: FlowEdge) => !edge.source_handle || !edge.target_handle);
      set({
        cameras: cams,
        flowNodes: flowConfig?.nodes || [],
        flowEdges: normalizedEdges,
        viewport: flowConfig?.viewport || { x: 0, y: 0, zoom: 1 },
        maxSyncState,
        loading: false,
      });
      if (flowEdgesWereNormalized) {
        await get().saveGraph();
      }
      get().resolvePaths();
    } catch (err) {
      set({ loading: false, error: err instanceof Error ? err.message : 'Failed to load scene' });
    }
  },

  selectNode: (id) => set({ selectedNodeId: id }),

  addNode: (type, position, configId, cameraId) => {
    const id = genNodeId();
    const defaultLabels: Record<NodeType, string> = {
      camera: 'Camera',
      group: 'Group',
      lightSetup: 'Light Setup',
      toneMapping: 'Tone Mapping',
      layerSetup: 'Layer Setup',
      aspectRatio: 'Aspect Ratio',
      stageRev: 'Stage Rev',
      override: 'Override',
      deadline: 'Deadline',
      output: 'Output',
    };
    const node: FlowNode = {
      id,
      type,
      label: defaultLabels[type],
      position,
      ...(configId && { config_id: configId }),
      ...(cameraId && { camera_id: cameraId }),
      ...(type === 'output' && { enabled: true }),
      ...(type === 'group' && { hide_previous: false }),
    };
    set((s) => ({ flowNodes: [...s.flowNodes, node], selectedNodeId: id }));
    scheduleStoreSave(get().saveGraph, get().resolvePaths, true);
  },

  removeNode: (id) => {
    set((s) => ({
      flowNodes: s.flowNodes.filter((n) => n.id !== id),
      flowEdges: s.flowEdges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
    scheduleStoreSave(get().saveGraph, get().resolvePaths, true);
  },

  addEdge: (source, target, sourceHandle, targetHandle) => {
    const { flowNodes, flowEdges } = get();
    const sourceNode = flowNodes.find((n) => n.id === source);
    const targetNode = flowNodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) return false;
    if (!isValidFlowConnection(source, target, flowNodes, flowEdges)) return false;
    // Prevent duplicate edges
    if (flowEdges.some((e) => e.source === source && e.target === target && e.source_handle === (sourceHandle ?? undefined) && e.target_handle === (targetHandle ?? undefined))) {
      return false;
    }

    const edge: FlowEdge = {
      id: `edge_${source}_${sourceHandle ?? 'auto'}_${target}_${targetHandle ?? 'auto'}`,
      source,
      target,
      ...(sourceHandle ? { source_handle: sourceHandle } : {}),
      ...(targetHandle ? { target_handle: targetHandle } : {}),
    };
    set((s) => ({ flowEdges: [...s.flowEdges, edge] }));
    scheduleStoreSave(get().saveGraph, get().resolvePaths, true);
    return true;
  },

  removeEdge: (id) => {
    set((s) => ({ flowEdges: s.flowEdges.filter((e) => e.id !== id) }));
    scheduleStoreSave(get().saveGraph, get().resolvePaths, true);
  },

  updateNodePosition: (id, position) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((n) => (n.id === id ? { ...n, position } : n)),
    }));
    scheduleStoreSave(get().saveGraph, get().resolvePaths);
  },

  applyNodeLayout: (positions) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((node) => {
        const nextPosition = positions[node.id];
        return nextPosition ? { ...node, position: nextPosition } : node;
      }),
    }));
    scheduleStoreSave(get().saveGraph, get().resolvePaths);
  },

  updateViewport: (viewport) => {
    set({ viewport });
    scheduleStoreSave(get().saveGraph);
  },

  assignNodeConfig: async (nodeId, configId) => {
    const config = configId ? get().nodeConfigs.find((entry) => entry.id === configId) : null;
    set((s) => ({
      flowNodes: s.flowNodes.map((node) => {
        if (node.id !== nodeId) return node;
        return {
          ...node,
          config_id: configId,
          ...(config ? { label: config.label } : {}),
        };
      }),
    }));
    await get().saveGraph();
    await get().resolvePaths();
  },

  assignNodeCamera: async (nodeId, cameraId) => {
    const camera = get().cameras.find((entry) => entry.id === cameraId);
    if (!camera) return;

    set((s) => ({
      flowNodes: s.flowNodes.map((node) => (
        node.id === nodeId && node.type === 'camera'
          ? { ...node, camera_id: cameraId, label: camera.name }
          : node
      )),
    }));

    await get().saveGraph();
    await get().resolvePaths();
  },

  updateNodeLabel: (id, label) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((n) => (n.id === id ? { ...n, label } : n)),
    }));
    scheduleStoreSave(get().saveGraph, get().resolvePaths, true);
  },

  toggleHidePrevious: (id) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((n) =>
        n.id === id && n.type === 'group' ? { ...n, hide_previous: !n.hide_previous } : n
      ),
    }));
    scheduleStoreSave(get().saveGraph, get().resolvePaths, true);
  },

  setResolvedPathEnabled: async (pathKey, outputNodeId, enabled) => {
    let updated = false;

    set((s) => {
      const nextNodes = s.flowNodes.map((node) => {
        if (node.id !== outputNodeId || node.type !== 'output') return node;

        updated = true;
        return {
          ...node,
          path_states: {
            ...(node.path_states ?? {}),
            [pathKey]: enabled,
          },
        };
      });

      const nextResolvedPaths = s.resolvedPaths.map((path) =>
        path.pathKey === pathKey ? { ...path, enabled } : path
      );

      return {
        flowNodes: nextNodes,
        resolvedPaths: nextResolvedPaths,
      };
    });

    if (updated) {
      await get().saveGraph();
    }
  },

  setOutputPathsEnabled: async (outputNodeId, pathKeys, enabled) => {
    if (pathKeys.length === 0) return;

    const keySet = new Set(pathKeys);
    let updated = false;

    set((s) => {
      const nextNodes = s.flowNodes.map((node) => {
        if (node.id !== outputNodeId || node.type !== 'output') return node;

        updated = true;
        const nextStates = { ...(node.path_states ?? {}) };
        for (const pathKey of keySet) {
          nextStates[pathKey] = enabled;
        }

        return {
          ...node,
          path_states: nextStates,
        };
      });

      const nextResolvedPaths = s.resolvedPaths.map((path) =>
        path.outputNodeId === outputNodeId && keySet.has(path.pathKey)
          ? { ...path, enabled }
          : path
      );

      return {
        flowNodes: nextNodes,
        resolvedPaths: nextResolvedPaths,
      };
    });

    if (updated) {
      await get().saveGraph();
    }
  },

  setAllResolvedPathsEnabled: async (enabled) => {
    let updated = false;

    set((s) => {
      const statesByOutput = new Map<string, Record<string, boolean>>();
      for (const path of s.resolvedPaths) {
        const outputStates = statesByOutput.get(path.outputNodeId) ?? {};
        outputStates[path.pathKey] = enabled;
        statesByOutput.set(path.outputNodeId, outputStates);
      }

      const nextNodes = s.flowNodes.map((node) => {
        if (node.type !== 'output') return node;
        const nextPathStates = statesByOutput.get(node.id);
        if (!nextPathStates) return node;

        updated = true;
        return {
          ...node,
          path_states: {
            ...(node.path_states ?? {}),
            ...nextPathStates,
          },
        };
      });

      return {
        flowNodes: nextNodes,
        resolvedPaths: s.resolvedPaths.map((path) => ({ ...path, enabled })),
      };
    });

    if (updated) {
      await get().saveGraph();
    }
  },

  saveGraph: async () => {
    const { activeSceneId, flowNodes, flowEdges, viewport } = get();
    if (!activeSceneId) return;
    try {
      await api.saveFlowConfig({
        scene_id: activeSceneId,
        nodes: flowNodes,
        edges: flowEdges,
        viewport,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to save graph' });
    }
  },

  resolvePaths: async () => {
    const { activeSceneId } = get();
    if (!activeSceneId) return;
    try {
      const result = await api.resolvePaths(activeSceneId);
      set({ resolvedPaths: result.paths, pathCount: result.count });
    } catch (err) {
      console.warn('Path resolution failed:', err instanceof Error ? err.message : err);
      set({ resolvedPaths: [], pathCount: 0 });
    }
  },

  createNodeConfig: async (nodeType, label, delta) => {
    try {
      const config = await api.createNodeConfig({ node_type: nodeType, label, delta });
      set((s) => ({ nodeConfigs: [...s.nodeConfigs, config] }));
      await get().resolvePaths();
      return config;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create preset' });
      return null;
    }
  },

  updateNodeConfig: async (id, updates) => {
    try {
      const config = await api.updateNodeConfig(id, updates);
      set((s) => ({ nodeConfigs: s.nodeConfigs.map((c) => (c.id === id ? config : c)) }));
      await get().resolvePaths();
      return config;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update preset' });
      return null;
    }
  },

  deleteNodeConfig: async (id) => {
    try {
      await api.deleteNodeConfig(id);
      set((s) => ({ nodeConfigs: s.nodeConfigs.filter((c) => c.id !== id) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to delete preset' });
    }
  },

  initSocket: () => {
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

    socket.on('scene:created', (row: Scene) => {
      set((s) => ({ scenes: [...s.scenes.filter((sc) => sc.id !== row.id), row] }));
    });
    socket.on('scene:deleted', ({ id }: { id: string }) => {
      set((s) => {
        const remaining = s.scenes.filter((sc) => sc.id !== id);
        const needSwitch = s.activeSceneId === id;
        return { scenes: remaining, activeSceneId: needSwitch ? (remaining[0]?.id ?? null) : s.activeSceneId };
      });
    });

    socket.on('camera:upserted', (row: Camera) => {
      set((s) => {
        const exists = s.cameras.some((c) => c.id === row.id);
        return { cameras: exists ? s.cameras.map((c) => (c.id === row.id ? row : c)) : [...s.cameras, row] };
      });
    });
    socket.on('camera:deleted', ({ id }: { id: string }) => {
      set((s) => ({ cameras: s.cameras.filter((c) => c.id !== id) }));
    });

    socket.on('studio-defaults:updated', (row: StudioDefault) => {
      set((s) => ({ studioDefaults: s.studioDefaults.map((d) => (d.id === row.id ? row : d)) }));
      void get().resolvePaths();
    });

    socket.on('node-config:created', (row: NodeConfig) => {
      set((s) => ({ nodeConfigs: [...s.nodeConfigs.filter((c) => c.id !== row.id), row] }));
      void get().resolvePaths();
    });
    socket.on('node-config:updated', (row: NodeConfig) => {
      set((s) => ({ nodeConfigs: s.nodeConfigs.map((c) => (c.id === row.id ? row : c)) }));
      void get().resolvePaths();
    });
    socket.on('node-config:deleted', ({ id }: { id: string }) => {
      set((s) => ({ nodeConfigs: s.nodeConfigs.filter((c) => c.id !== id) }));
      void get().resolvePaths();
    });

    socket.on('flow-config:updated', (row: any) => {
      const { activeSceneId } = get();
      if (row.scene_id === activeSceneId) {
        const nextNodes = row.nodes || [];
        const nextEdges = normalizeFlowEdges(nextNodes, row.edges || []);
        const currentState = get();
        const nodesChanged = !areSerializedValuesEqual(currentState.flowNodes, nextNodes);
        const edgesChanged = !areSerializedValuesEqual(currentState.flowEdges, nextEdges);

        if (!nodesChanged && !edgesChanged) {
          return;
        }

        set({
          flowNodes: nextNodes,
          flowEdges: nextEdges,
        });
        void get().resolvePaths();
      }
    });

    socket.on('max:log', (entry: MaxDebugLogEntry) => {
      set((s) => ({ maxDebugLog: [entry, ...s.maxDebugLog].slice(0, 200) }));
    });

    socket.on('max-sync:updated', (row: MaxSyncState) => {
      const { activeSceneId } = get();
      if (row.scene_id === activeSceneId) {
        const prev = get().maxSyncState;
        set({ maxSyncState: row });
        // Auto-log sync completions
        if (prev?.status !== row.status && (row.status === 'success' || row.status === 'error')) {
          get().addSyncLog({
            status: row.status,
            reason: row.last_reason || 'auto-sync',
            cameraName: row.active_camera_name || undefined,
            pathKey: row.active_path_key || undefined,
            error: row.last_error || undefined,
          });
        }
      }
    });
  },

  checkMaxHealth: async () => {
    try {
      const health = await api.checkMaxHealth();
      set({ maxHealth: health });
    } catch (err) {
      set({ maxHealth: { connected: false, error: err instanceof Error ? err.message : 'Check failed', host: '', port: 0 } });
    }
  },

  importCamerasFromMax: async () => {
    const { activeSceneId } = get();
    if (!activeSceneId) return 0;
    try {
      const result = await api.importCamerasFromMax(activeSceneId);
      const importedCameras = Array.isArray(result.cameras) ? (result.cameras as Camera[]) : [];
      let createdNodes = 0;

      set((s) => {
        const mergedCameras = [...s.cameras];
        for (const camera of importedCameras) {
          const existingIndex = mergedCameras.findIndex((entry) => entry.id === camera.id);
          if (existingIndex >= 0) {
            mergedCameras[existingIndex] = camera;
          } else {
            mergedCameras.push(camera);
          }
        }

        const existingCameraIds = new Set(
          s.flowNodes
            .filter((node) => node.type === 'camera' && typeof node.camera_id === 'string')
            .map((node) => node.camera_id as string)
        );
        const existingCameraNodes = s.flowNodes.filter((node) => node.type === 'camera');
        const baseX = existingCameraNodes.length > 0
          ? Math.min(...existingCameraNodes.map((node) => node.position.x))
          : 80;
        let nextY = existingCameraNodes.length > 0
          ? Math.max(...existingCameraNodes.map((node) => node.position.y)) + 120
          : 80;

        const newCameraNodes: FlowNode[] = [];
        for (const camera of importedCameras) {
          if (existingCameraIds.has(camera.id)) continue;
          existingCameraIds.add(camera.id);
          createdNodes += 1;
          newCameraNodes.push({
            id: genNodeId(),
            type: 'camera',
            label: camera.name,
            position: { x: baseX, y: nextY },
            camera_id: camera.id,
          });
          nextY += 120;
        }

        return {
          cameras: mergedCameras,
          flowNodes: newCameraNodes.length > 0 ? [...s.flowNodes, ...newCameraNodes] : s.flowNodes,
          selectedNodeId: newCameraNodes.length > 0 ? newCameraNodes[newCameraNodes.length - 1]?.id ?? s.selectedNodeId : s.selectedNodeId,
        };
      });

      if (createdNodes > 0) {
        await get().saveGraph();
        await get().resolvePaths();
      }

      get().addSyncLog({
        status: 'success',
        reason: `cameras-imported:${result.imported}${createdNodes > 0 ? `:nodes-${createdNodes}` : ''}`,
      });

      if (createdNodes > 0) {
        get().showToast(`Imported ${createdNodes} camera${createdNodes > 1 ? 's' : ''} from 3ds Max`, 'success');
      } else if (result.imported > 0) {
        get().showToast(`${result.imported} camera${result.imported > 1 ? 's' : ''} already in graph — nothing new to add`, 'info');
      } else {
        get().showToast('No cameras found in the 3ds Max scene', 'info');
      }

      return result.imported;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to import cameras';
      set({ error: message });
      get().addSyncLog({
        status: 'error',
        reason: 'cameras-imported',
        error: message,
      });
      get().showToast(message, 'error');
      return 0;
    }
  },

  pushToMax: async (pathKey, pathIndex) => {
    const { activeSceneId } = get();
    if (!activeSceneId) return false;
    try {
      set({ cameraMatchPrompt: null });
      const state = await api.pushToMax(activeSceneId, pathKey, pathIndex);
      set({ maxSyncState: state });
      get().addSyncLog({
        status: state?.status === 'error' ? 'error' : 'success',
        reason: 'manual-push',
        cameraName: state?.active_camera_name,
        pathKey: state?.active_path_key,
        error: state?.last_error,
      });
      return true;
    } catch (err) {
      if (err instanceof ApiError && err.code === 'max_camera_not_found') {
        await get().importCamerasFromMax().catch(() => 0);

        const { resolvedPaths, flowNodes, cameras } = get();
        const requestedCameraName = typeof err.details?.requested_camera_name === 'string'
          ? err.details.requested_camera_name
          : 'Unknown camera';
        const availableHandles = Array.isArray(err.details?.available_cameras)
          ? new Set(
              err.details.available_cameras
                .map((camera) => (typeof camera === 'object' && camera && 'max_handle' in camera ? Number((camera as { max_handle: unknown }).max_handle) : NaN))
                .filter((value) => Number.isFinite(value))
            )
          : null;
        const resolvedPath = pathKey ? resolvedPaths.find((path) => path.pathKey === pathKey) : null;
        const cameraNodeId = resolvedPath?.nodeIds.find((nodeId) => flowNodes.find((node) => node.id === nodeId)?.type === 'camera');
        const availableCameras = availableHandles && availableHandles.size > 0
          ? cameras.filter((camera) => availableHandles.has(camera.max_handle))
          : cameras;

        if (cameraNodeId && availableCameras.length > 0) {
          set({
            cameraMatchPrompt: {
              nodeId: cameraNodeId,
              pathKey,
              requestedCameraName,
              availableCameras,
            },
            error: err.message,
          });
        } else {
          set({ error: err.message });
        }

        get().addSyncLog({
          status: 'error',
          reason: 'camera-not-found-in-max',
          cameraName: requestedCameraName,
          error: err.message,
        });
        return false;
      }

      set({ error: err instanceof Error ? err.message : 'Push to Max failed' });
      get().addSyncLog({
        status: 'error',
        reason: 'manual-push',
        error: err instanceof Error ? err.message : 'Push to Max failed',
      });
      return false;
    }
  },

  submitRender: async (pathIndices) => {
    const { activeSceneId } = get();
    if (!activeSceneId) return false;
    try {
      const result = await api.submitRender(activeSceneId, pathIndices);
      get().addSyncLog({
        status: 'success',
        reason: `deadline-submit:${result.submitted}jobs`,
      });
      return true;
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Render submission failed' });
      get().addSyncLog({
        status: 'error',
        reason: 'deadline-submit',
        error: err instanceof Error ? err.message : 'Render submission failed',
      });
      return false;
    }
  },

  addSyncLog: (entry) => {
    const log: SyncLogEntry = {
      ...entry,
      id: `log_${Date.now()}_${syncLogCounter++}`,
      timestamp: new Date().toISOString(),
    };
    set((s) => ({ syncLog: [log, ...s.syncLog].slice(0, 50) }));
  },

  showToast: (message, level = 'info') => {
    set({ toast: { message, level } });
    setTimeout(() => {
      const current = get().toast;
      if (current?.message === message) set({ toast: null });
    }, 4000);
  },
  dismissToast: () => set({ toast: null }),
  clearMaxDebugLog: () => set({ maxDebugLog: [] }),
  dismissCameraMatchPrompt: () => set({ cameraMatchPrompt: null }),
}));
