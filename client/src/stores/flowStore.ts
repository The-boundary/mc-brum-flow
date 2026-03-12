import { create } from 'zustand';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Scene, Camera, StudioDefault, NodeConfig, FlowNode, FlowEdge, NodeType, MaxSyncState } from '@shared/types';
import { isValidConnection } from '@shared/types';

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

  // Loading
  loading: boolean;
  error: string | null;

  // Actions
  loadAll: () => Promise<void>;
  setActiveScene: (id: string) => Promise<void>;
  selectNode: (id: string | null) => void;
  addNode: (type: NodeType, position: { x: number; y: number }, configId?: string, cameraId?: string) => void;
  removeNode: (id: string) => void;
  addEdge: (source: string, target: string) => boolean;
  removeEdge: (id: string) => void;
  updateNodePosition: (id: string, position: { x: number; y: number }) => void;
  applyNodeLayout: (positions: Record<string, { x: number; y: number }>) => void;
  updateViewport: (viewport: { x: number; y: number; zoom: number }) => void;
  assignNodeConfig: (nodeId: string, configId?: string) => Promise<void>;
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
}

let nextNodeId = 1;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let persistNeedsResolve = false;

function genNodeId(): string {
  return `node_${Date.now()}_${nextNodeId++}`;
}

function scheduleStoreSave(
  saveGraph: () => Promise<void>,
  resolvePaths: () => Promise<void>,
  needsResolve = false,
) {
  persistNeedsResolve = persistNeedsResolve || needsResolve;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    const shouldResolve = persistNeedsResolve;
    persistNeedsResolve = false;
    void saveGraph().then(async () => {
      if (shouldResolve) {
        await resolvePaths();
      }
    });
  }, 400);
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
      const activeId = scenes[0]?.id ?? null;

      let cameras: Camera[] = [];
      let flowNodes: FlowNode[] = [];
      let flowEdges: FlowEdge[] = [];
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
          flowEdges = flowConfig.edges || [];
          viewport = flowConfig.viewport || viewport;
        }
        maxSyncState = syncState;
      }

      set({
        scenes,
        activeSceneId: activeId,
        cameras,
        studioDefaults: defaults,
        nodeConfigs: configs,
        flowNodes,
        flowEdges,
        viewport,
        maxSyncState,
        loading: false,
      });

      if (activeId) get().resolvePaths();
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
      set({
        cameras: cams,
        flowNodes: flowConfig?.nodes || [],
        flowEdges: flowConfig?.edges || [],
        viewport: flowConfig?.viewport || { x: 0, y: 0, zoom: 1 },
        maxSyncState,
        loading: false,
      });
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

  addEdge: (source, target) => {
    const { flowNodes, flowEdges } = get();
    const sourceNode = flowNodes.find((n) => n.id === source);
    const targetNode = flowNodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode) return false;
    if (!isValidConnection(sourceNode.type, targetNode.type)) return false;
    // Prevent duplicate edges
    if (flowEdges.some((e) => e.source === source && e.target === target)) return false;

    const edge: FlowEdge = {
      id: `edge_${source}_${target}`,
      source,
      target,
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
    scheduleStoreSave(get().saveGraph, get().resolvePaths);
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
    } catch {
      // Non-critical — paths will be empty
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
      get().resolvePaths();
    });

    socket.on('node-config:created', (row: NodeConfig) => {
      set((s) => ({ nodeConfigs: [...s.nodeConfigs.filter((c) => c.id !== row.id), row] }));
      get().resolvePaths();
    });
    socket.on('node-config:updated', (row: NodeConfig) => {
      set((s) => ({ nodeConfigs: s.nodeConfigs.map((c) => (c.id === row.id ? row : c)) }));
      get().resolvePaths();
    });
    socket.on('node-config:deleted', ({ id }: { id: string }) => {
      set((s) => ({ nodeConfigs: s.nodeConfigs.filter((c) => c.id !== id) }));
      get().resolvePaths();
    });

    socket.on('flow-config:updated', (row: any) => {
      const { activeSceneId } = get();
      if (row.scene_id === activeSceneId) {
        set({
          flowNodes: row.nodes || [],
          flowEdges: row.edges || [],
          viewport: row.viewport || { x: 0, y: 0, zoom: 1 },
        });
        get().resolvePaths();
      }
    });

    socket.on('max-sync:updated', (row: MaxSyncState) => {
      const { activeSceneId } = get();
      if (row.scene_id === activeSceneId) {
        set({ maxSyncState: row });
      }
    });
  },
}));
