import { create } from 'zustand';
import * as api from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Scene, Camera, StudioDefault, NodeConfig, FlowNode, FlowEdge, NodeType } from '@shared/types';
import { isValidConnection } from '@shared/types';

export interface ResolvedPath {
  nodeIds: string[];
  cameraName: string;
  filename: string;
  resolvedConfig: Record<string, unknown>;
  enabled: boolean;
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
  updateNodeLabel: (id: string, label: string) => void;
  toggleHidePrevious: (id: string) => void;
  toggleOutputEnabled: (nodeId: string) => void;
  saveGraph: () => Promise<void>;
  resolvePaths: () => Promise<void>;
  createNodeConfig: (nodeType: NodeType, label: string, delta: Record<string, unknown>) => Promise<void>;
  updateNodeConfig: (id: string, updates: { label?: string; delta?: Record<string, unknown> }) => Promise<void>;
  deleteNodeConfig: (id: string) => Promise<void>;
  initSocket: () => void;
}

let nextNodeId = 1;
function genNodeId(): string {
  return `node_${Date.now()}_${nextNodeId++}`;
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

      if (activeId) {
        const [cams, flowConfig] = await Promise.all([
          api.fetchCameras(activeId),
          api.fetchFlowConfig(activeId),
        ]);
        cameras = cams;
        if (flowConfig) {
          flowNodes = flowConfig.nodes || [];
          flowEdges = flowConfig.edges || [];
          viewport = flowConfig.viewport || viewport;
        }
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
      const [cams, flowConfig] = await Promise.all([
        api.fetchCameras(id),
        api.fetchFlowConfig(id),
      ]);
      set({
        cameras: cams,
        flowNodes: flowConfig?.nodes || [],
        flowEdges: flowConfig?.edges || [],
        viewport: flowConfig?.viewport || { x: 0, y: 0, zoom: 1 },
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
  },

  removeNode: (id) => {
    set((s) => ({
      flowNodes: s.flowNodes.filter((n) => n.id !== id),
      flowEdges: s.flowEdges.filter((e) => e.source !== id && e.target !== id),
      selectedNodeId: s.selectedNodeId === id ? null : s.selectedNodeId,
    }));
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
    return true;
  },

  removeEdge: (id) => {
    set((s) => ({ flowEdges: s.flowEdges.filter((e) => e.id !== id) }));
  },

  updateNodePosition: (id, position) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((n) => (n.id === id ? { ...n, position } : n)),
    }));
  },

  updateNodeLabel: (id, label) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((n) => (n.id === id ? { ...n, label } : n)),
    }));
  },

  toggleHidePrevious: (id) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((n) =>
        n.id === id && n.type === 'group' ? { ...n, hide_previous: !n.hide_previous } : n
      ),
    }));
  },

  toggleOutputEnabled: (nodeId) => {
    set((s) => ({
      flowNodes: s.flowNodes.map((n) =>
        n.id === nodeId && n.type === 'output' ? { ...n, enabled: !n.enabled } : n
      ),
    }));
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
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to create preset' });
    }
  },

  updateNodeConfig: async (id, updates) => {
    try {
      const config = await api.updateNodeConfig(id, updates);
      set((s) => ({ nodeConfigs: s.nodeConfigs.map((c) => (c.id === id ? config : c)) }));
    } catch (err) {
      set({ error: err instanceof Error ? err.message : 'Failed to update preset' });
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
    });

    socket.on('node-config:created', (row: NodeConfig) => {
      set((s) => ({ nodeConfigs: [...s.nodeConfigs.filter((c) => c.id !== row.id), row] }));
    });
    socket.on('node-config:updated', (row: NodeConfig) => {
      set((s) => ({ nodeConfigs: s.nodeConfigs.map((c) => (c.id === row.id ? row : c)) }));
    });
    socket.on('node-config:deleted', ({ id }: { id: string }) => {
      set((s) => ({ nodeConfigs: s.nodeConfigs.filter((c) => c.id !== id) }));
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
  },
}));
