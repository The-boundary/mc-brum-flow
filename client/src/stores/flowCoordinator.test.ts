import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { useFlowStore } from './flowStore';
import {
  scheduleStoreSave,
  saveGraph,
  resolvePaths,
  loadAll,
  setActiveScene,
  initSocket,
  assignNodeConfig,
  assignNodeCamera,
  scaffoldPipeline,
} from './flowCoordinator';

// Mock the API module
vi.mock('@/lib/api', () => ({
  ApiError: class ApiError extends Error {
    status: number;
    code?: string;
    details?: Record<string, unknown>;
    constructor(message: string, options?: { status?: number; code?: string; details?: Record<string, unknown> }) {
      super(message);
      this.name = 'ApiError';
      this.status = options?.status ?? 500;
      this.code = options?.code;
      this.details = options?.details;
    }
  },
  fetchScenes: vi.fn(),
  fetchStudioDefaults: vi.fn(),
  fetchNodeConfigs: vi.fn(),
  fetchCameras: vi.fn(),
  fetchFlowConfig: vi.fn(),
  fetchMaxSyncState: vi.fn(),
  saveFlowConfig: vi.fn(),
  resolvePaths: vi.fn(),
}));

// Mock the socket module
const mockSocket = {
  removeAllListeners: vi.fn().mockReturnThis(),
  on: vi.fn().mockReturnThis(),
};

vi.mock('@/lib/socket', () => ({
  getSocket: () => mockSocket,
}));

// Import the mocked api after vi.mock
import * as api from '@/lib/api';

const mockedApi = api as unknown as {
  fetchScenes: ReturnType<typeof vi.fn>;
  fetchStudioDefaults: ReturnType<typeof vi.fn>;
  fetchNodeConfigs: ReturnType<typeof vi.fn>;
  fetchCameras: ReturnType<typeof vi.fn>;
  fetchFlowConfig: ReturnType<typeof vi.fn>;
  fetchMaxSyncState: ReturnType<typeof vi.fn>;
  saveFlowConfig: ReturnType<typeof vi.fn>;
  resolvePaths: ReturnType<typeof vi.fn>;
};

function resetStore() {
  useFlowStore.setState({
    scenes: [],
    activeSceneId: null,
    cameras: [],
    studioDefaults: [],
    nodeConfigs: [],
    flowNodes: [],
    flowEdges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,
    selectedNodeIds: [],
    resolvedPaths: [],
    pathCount: 0,
    pathResolutionError: false,
    maxSyncState: null,
    maxHealth: null,
    maxTcpInstances: [],
    cameraMatchPrompt: null,
    syncLog: [],
    maxDebugLog: [],
    toast: null,
    loading: false,
    error: null,
  });
}

describe('flowCoordinator', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // scheduleStoreSave
  // -----------------------------------------------------------------------
  describe('scheduleStoreSave', () => {
    it('calls saveGraph after 400ms debounce', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockResolve = vi.fn().mockResolvedValue(undefined);

      scheduleStoreSave(mockSave, mockResolve, false);

      expect(mockSave).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(400);
      expect(mockSave).toHaveBeenCalledOnce();
      expect(mockResolve).not.toHaveBeenCalled();
    });

    it('calls resolvePaths when needsResolve is true', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockResolve = vi.fn().mockResolvedValue(undefined);

      scheduleStoreSave(mockSave, mockResolve, true);

      await vi.advanceTimersByTimeAsync(400);
      expect(mockSave).toHaveBeenCalledOnce();
      expect(mockResolve).toHaveBeenCalledOnce();
    });

    it('coalesces multiple calls within the debounce window', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockResolve = vi.fn().mockResolvedValue(undefined);

      scheduleStoreSave(mockSave, mockResolve, false);
      scheduleStoreSave(mockSave, mockResolve, false);
      scheduleStoreSave(mockSave, mockResolve, false);

      await vi.advanceTimersByTimeAsync(400);
      expect(mockSave).toHaveBeenCalledOnce();
    });

    it('remembers needsResolve across coalesced calls', async () => {
      const mockSave = vi.fn().mockResolvedValue(undefined);
      const mockResolve = vi.fn().mockResolvedValue(undefined);

      // First call sets needsResolve, second call doesn't, but resolve should still happen
      scheduleStoreSave(mockSave, mockResolve, true);
      scheduleStoreSave(mockSave, mockResolve, false);

      await vi.advanceTimersByTimeAsync(400);
      expect(mockResolve).toHaveBeenCalledOnce();
    });
  });

  // -----------------------------------------------------------------------
  // saveGraph
  // -----------------------------------------------------------------------
  describe('saveGraph', () => {
    it('calls api.saveFlowConfig with current state', async () => {
      mockedApi.saveFlowConfig.mockResolvedValue(undefined);
      useFlowStore.setState({
        activeSceneId: 'scene-1',
        flowNodes: [{ id: 'n1', type: 'camera', label: 'Cam', position: { x: 0, y: 0 } }],
        flowEdges: [],
        viewport: { x: 10, y: 20, zoom: 1.5 },
      });

      await saveGraph();

      expect(mockedApi.saveFlowConfig).toHaveBeenCalledWith({
        scene_id: 'scene-1',
        nodes: [{ id: 'n1', type: 'camera', label: 'Cam', position: { x: 0, y: 0 } }],
        edges: [],
        viewport: { x: 10, y: 20, zoom: 1.5 },
      });
    });

    it('does nothing when no active scene', async () => {
      useFlowStore.setState({ activeSceneId: null });
      await saveGraph();
      expect(mockedApi.saveFlowConfig).not.toHaveBeenCalled();
    });

    it('sets error on failure', async () => {
      mockedApi.saveFlowConfig.mockRejectedValue(new Error('Network error'));
      useFlowStore.setState({ activeSceneId: 'scene-1' });

      await saveGraph();

      expect(useFlowStore.getState().error).toBe('Network error');
    });
  });

  // -----------------------------------------------------------------------
  // resolvePaths
  // -----------------------------------------------------------------------
  describe('resolvePaths', () => {
    it('calls api.resolvePaths and updates store', async () => {
      mockedApi.resolvePaths.mockResolvedValue({
        paths: [{ pathKey: 'pk1', nodeIds: [], outputNodeId: 'o1', cameraName: 'C1', filename: 'f.exr', resolvedConfig: {}, enabled: true, stageLabels: {} }],
        count: 1,
      });
      useFlowStore.setState({ activeSceneId: 'scene-1' });

      await resolvePaths();

      const state = useFlowStore.getState();
      expect(state.resolvedPaths).toHaveLength(1);
      expect(state.pathCount).toBe(1);
      expect(state.pathResolutionError).toBe(false);
    });

    it('does nothing when no active scene', async () => {
      useFlowStore.setState({ activeSceneId: null });
      await resolvePaths();
      expect(mockedApi.resolvePaths).not.toHaveBeenCalled();
    });

    it('sets pathResolutionError on failure', async () => {
      mockedApi.resolvePaths.mockRejectedValue(new Error('Resolve failed'));
      useFlowStore.setState({ activeSceneId: 'scene-1' });

      await resolvePaths();

      expect(useFlowStore.getState().pathResolutionError).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // loadAll
  // -----------------------------------------------------------------------
  describe('loadAll', () => {
    it('fetches scenes, defaults, configs and sets active scene', async () => {
      mockedApi.fetchScenes.mockResolvedValue([{ id: 's1', name: 'Scene 1' }]);
      mockedApi.fetchStudioDefaults.mockResolvedValue([]);
      mockedApi.fetchNodeConfigs.mockResolvedValue([]);
      mockedApi.fetchCameras.mockResolvedValue([]);
      mockedApi.fetchFlowConfig.mockResolvedValue(null);
      mockedApi.fetchMaxSyncState.mockResolvedValue(null);
      mockedApi.resolvePaths.mockResolvedValue({ paths: [], count: 0 });

      await loadAll();

      const state = useFlowStore.getState();
      expect(state.scenes).toEqual([{ id: 's1', name: 'Scene 1' }]);
      expect(state.activeSceneId).toBe('s1');
      expect(state.loading).toBe(false);
    });

    it('handles no scenes gracefully', async () => {
      mockedApi.fetchScenes.mockResolvedValue([]);
      mockedApi.fetchStudioDefaults.mockResolvedValue([]);
      mockedApi.fetchNodeConfigs.mockResolvedValue([]);

      await loadAll();

      const state = useFlowStore.getState();
      expect(state.scenes).toEqual([]);
      expect(state.activeSceneId).toBeNull();
      expect(state.loading).toBe(false);
    });

    it('sets error on failure', async () => {
      mockedApi.fetchScenes.mockRejectedValue(new Error('Connection failed'));

      await loadAll();

      const state = useFlowStore.getState();
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Connection failed');
    });

    it('loads flow config for active scene', async () => {
      mockedApi.fetchScenes.mockResolvedValue([{ id: 's1', name: 'Scene 1' }]);
      mockedApi.fetchStudioDefaults.mockResolvedValue([]);
      mockedApi.fetchNodeConfigs.mockResolvedValue([]);
      mockedApi.fetchCameras.mockResolvedValue([{ id: 'c1', name: 'Cam1', max_handle: 1, max_class: 'FreeCamera' }]);
      mockedApi.fetchFlowConfig.mockResolvedValue({
        scene_id: 's1',
        nodes: [{ id: 'n1', type: 'camera', label: 'Cam', position: { x: 0, y: 0 } }],
        edges: [],
        viewport: { x: 5, y: 5, zoom: 2 },
      });
      mockedApi.fetchMaxSyncState.mockResolvedValue(null);
      mockedApi.resolvePaths.mockResolvedValue({ paths: [], count: 0 });

      await loadAll();

      const state = useFlowStore.getState();
      expect(state.cameras).toHaveLength(1);
      expect(state.flowNodes).toHaveLength(1);
      expect(state.viewport).toEqual({ x: 5, y: 5, zoom: 2 });
    });
  });

  // -----------------------------------------------------------------------
  // setActiveScene
  // -----------------------------------------------------------------------
  describe('setActiveScene', () => {
    it('switches scene and loads its data', async () => {
      mockedApi.fetchCameras.mockResolvedValue([]);
      mockedApi.fetchFlowConfig.mockResolvedValue({
        scene_id: 's2',
        nodes: [{ id: 'n2', type: 'output', label: 'Out', position: { x: 100, y: 100 } }],
        edges: [],
        viewport: { x: 0, y: 0, zoom: 1 },
      });
      mockedApi.fetchMaxSyncState.mockResolvedValue(null);
      mockedApi.resolvePaths.mockResolvedValue({ paths: [], count: 0 });

      await setActiveScene('s2');

      const state = useFlowStore.getState();
      expect(state.activeSceneId).toBe('s2');
      expect(state.flowNodes).toHaveLength(1);
      expect(state.flowNodes[0].id).toBe('n2');
      expect(state.loading).toBe(false);
    });

    it('clears selected node on scene switch', async () => {
      useFlowStore.setState({ selectedNodeId: 'old-node' });
      mockedApi.fetchCameras.mockResolvedValue([]);
      mockedApi.fetchFlowConfig.mockResolvedValue(null);
      mockedApi.fetchMaxSyncState.mockResolvedValue(null);
      mockedApi.resolvePaths.mockResolvedValue({ paths: [], count: 0 });

      await setActiveScene('s2');

      expect(useFlowStore.getState().selectedNodeId).toBeNull();
    });

    it('sets error on failure', async () => {
      mockedApi.fetchCameras.mockRejectedValue(new Error('Scene load failed'));

      await setActiveScene('s2');

      expect(useFlowStore.getState().error).toBe('Scene load failed');
      expect(useFlowStore.getState().loading).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // initSocket
  // -----------------------------------------------------------------------
  describe('initSocket', () => {
    it('removes old listeners and registers new ones', () => {
      initSocket();

      // Should remove all listeners for known events
      const removedEvents = mockSocket.removeAllListeners.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(removedEvents).toContain('scene:created');
      expect(removedEvents).toContain('scene:deleted');
      expect(removedEvents).toContain('camera:upserted');
      expect(removedEvents).toContain('camera:deleted');
      expect(removedEvents).toContain('studio-defaults:updated');
      expect(removedEvents).toContain('node-config:created');
      expect(removedEvents).toContain('node-config:updated');
      expect(removedEvents).toContain('node-config:deleted');
      expect(removedEvents).toContain('flow-config:updated');
      expect(removedEvents).toContain('max-sync:updated');
      expect(removedEvents).toContain('max-tcp:connected');
      expect(removedEvents).toContain('max-tcp:disconnected');
      expect(removedEvents).toContain('max-tcp:instances');
      expect(removedEvents).toContain('max-tcp:file-opened');
      expect(removedEvents).toContain('max:log');

      // Should register handlers for all events
      const registeredEvents = mockSocket.on.mock.calls.map(
        (call: unknown[]) => call[0],
      );
      expect(registeredEvents).toContain('scene:created');
      expect(registeredEvents).toContain('scene:deleted');
      expect(registeredEvents).toContain('camera:upserted');
      expect(registeredEvents).toContain('camera:deleted');
      expect(registeredEvents).toContain('studio-defaults:updated');
      expect(registeredEvents).toContain('node-config:created');
      expect(registeredEvents).toContain('node-config:updated');
      expect(registeredEvents).toContain('node-config:deleted');
      expect(registeredEvents).toContain('flow-config:updated');
      expect(registeredEvents).toContain('max-sync:updated');
      expect(registeredEvents).toContain('max-tcp:connected');
      expect(registeredEvents).toContain('max-tcp:disconnected');
      expect(registeredEvents).toContain('max-tcp:instances');
      expect(registeredEvents).toContain('max-tcp:file-opened');
      expect(registeredEvents).toContain('max:log');
    });

    it('scene:created handler adds scene to store', () => {
      initSocket();
      const handler = mockSocket.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'scene:created',
      )?.[1] as (row: unknown) => void;

      useFlowStore.setState({ scenes: [] });
      handler({ id: 's1', name: 'New Scene' });

      expect(useFlowStore.getState().scenes).toEqual([{ id: 's1', name: 'New Scene' }]);
    });

    it('scene:deleted handler removes scene and switches active if needed', () => {
      initSocket();
      const handler = mockSocket.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'scene:deleted',
      )?.[1] as (payload: unknown) => void;

      useFlowStore.setState({
        scenes: [{ id: 's1', name: 'A' } as any, { id: 's2', name: 'B' } as any],
        activeSceneId: 's1',
      });
      handler({ id: 's1' });

      const state = useFlowStore.getState();
      expect(state.scenes).toHaveLength(1);
      expect(state.activeSceneId).toBe('s2');
    });

    it('camera:upserted handler upserts camera', () => {
      initSocket();
      const handler = mockSocket.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'camera:upserted',
      )?.[1] as (row: unknown) => void;

      useFlowStore.setState({ cameras: [{ id: 'c1', name: 'Old', max_handle: 1, max_class: 'Free' } as any] });
      handler({ id: 'c1', name: 'Updated', max_handle: 1, max_class: 'Free' });

      expect(useFlowStore.getState().cameras[0].name).toBe('Updated');
    });

    it('camera:upserted handler adds new camera', () => {
      initSocket();
      const handler = mockSocket.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'camera:upserted',
      )?.[1] as (row: unknown) => void;

      useFlowStore.setState({ cameras: [] });
      handler({ id: 'c2', name: 'New Cam', max_handle: 2, max_class: 'Target' });

      expect(useFlowStore.getState().cameras).toHaveLength(1);
      expect(useFlowStore.getState().cameras[0].id).toBe('c2');
    });

    it('max-tcp:instances handler updates instance list', () => {
      initSocket();
      const handler = mockSocket.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'max-tcp:instances',
      )?.[1] as (list: unknown) => void;

      const instances = [
        { id: 'i1', hostname: 'ws1', username: 'user', pid: 1234, currentFile: 'test.max', connectedAt: '', lastHeartbeat: '' },
      ];
      handler(instances);

      expect(useFlowStore.getState().maxTcpInstances).toEqual(instances);
    });

    it('max:log handler prepends to debug log', () => {
      initSocket();
      const handler = mockSocket.on.mock.calls.find(
        (call: unknown[]) => call[0] === 'max:log',
      )?.[1] as (entry: unknown) => void;

      useFlowStore.setState({ maxDebugLog: [] });
      handler({ id: 'log1', timestamp: '2024-01-01', level: 'info', direction: 'incoming', summary: 'Test' });

      expect(useFlowStore.getState().maxDebugLog).toHaveLength(1);
      expect(useFlowStore.getState().maxDebugLog[0].summary).toBe('Test');
    });
  });

  // -----------------------------------------------------------------------
  // assignNodeConfig
  // -----------------------------------------------------------------------
  describe('assignNodeConfig', () => {
    it('assigns config_id to node and updates label', async () => {
      mockedApi.saveFlowConfig.mockResolvedValue(undefined);
      mockedApi.resolvePaths.mockResolvedValue({ paths: [], count: 0 });

      useFlowStore.setState({
        activeSceneId: 'scene-1',
        flowNodes: [{ id: 'n1', type: 'lightSetup', label: 'Light Setup', position: { x: 0, y: 0 } }],
        flowEdges: [],
        nodeConfigs: [{ id: 'cfg1', node_type: 'lightSetup', label: 'Studio A', delta: {}, created_at: '', updated_at: '' }],
      });

      await assignNodeConfig('n1', 'cfg1');

      const node = useFlowStore.getState().flowNodes[0];
      expect(node.config_id).toBe('cfg1');
      expect(node.label).toBe('Studio A');
      expect(mockedApi.saveFlowConfig).toHaveBeenCalled();
      expect(mockedApi.resolvePaths).toHaveBeenCalled();
    });

    it('clears config when configId is undefined', async () => {
      mockedApi.saveFlowConfig.mockResolvedValue(undefined);
      mockedApi.resolvePaths.mockResolvedValue({ paths: [], count: 0 });

      useFlowStore.setState({
        activeSceneId: 'scene-1',
        flowNodes: [{ id: 'n1', type: 'lightSetup', label: 'Studio A', position: { x: 0, y: 0 }, config_id: 'cfg1' }],
        flowEdges: [],
        nodeConfigs: [],
      });

      await assignNodeConfig('n1', undefined);

      const node = useFlowStore.getState().flowNodes[0];
      expect(node.config_id).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // assignNodeCamera
  // -----------------------------------------------------------------------
  describe('assignNodeCamera', () => {
    it('assigns camera_id and updates label on camera node', async () => {
      mockedApi.saveFlowConfig.mockResolvedValue(undefined);
      mockedApi.resolvePaths.mockResolvedValue({ paths: [], count: 0 });

      useFlowStore.setState({
        activeSceneId: 'scene-1',
        flowNodes: [{ id: 'n1', type: 'camera', label: 'Camera', position: { x: 0, y: 0 } }],
        flowEdges: [],
        cameras: [{ id: 'cam1', name: 'Top View', max_handle: 1, max_class: 'FreeCamera', scene_id: 'scene-1', created_at: '', updated_at: '' }],
      });

      await assignNodeCamera('n1', 'cam1');

      const node = useFlowStore.getState().flowNodes[0];
      expect(node.camera_id).toBe('cam1');
      expect(node.label).toBe('Top View');
      expect(mockedApi.saveFlowConfig).toHaveBeenCalled();
      expect(mockedApi.resolvePaths).toHaveBeenCalled();
    });

    it('does nothing if camera not found', async () => {
      useFlowStore.setState({
        activeSceneId: 'scene-1',
        flowNodes: [{ id: 'n1', type: 'camera', label: 'Camera', position: { x: 0, y: 0 } }],
        flowEdges: [],
        cameras: [],
      });

      await assignNodeCamera('n1', 'nonexistent');

      expect(mockedApi.saveFlowConfig).not.toHaveBeenCalled();
    });
  });

  // -----------------------------------------------------------------------
  // scaffoldPipeline
  // -----------------------------------------------------------------------
  describe('scaffoldPipeline', () => {
    it('creates 9 pipeline nodes and 8 edges', async () => {
      mockedApi.saveFlowConfig.mockResolvedValue(undefined);
      mockedApi.resolvePaths.mockResolvedValue({ paths: [], count: 0 });

      useFlowStore.setState({
        activeSceneId: 'scene-1',
        flowNodes: [],
        flowEdges: [],
      });

      scaffoldPipeline();

      const state = useFlowStore.getState();
      expect(state.flowNodes).toHaveLength(9);
      expect(state.flowEdges).toHaveLength(8);

      // Verify pipeline order
      const types = state.flowNodes.map((n) => n.type);
      expect(types).toEqual([
        'camera', 'group', 'lightSetup', 'toneMapping',
        'layerSetup', 'aspectRatio', 'stageRev', 'deadline', 'output',
      ]);
    });

    it('appends to existing nodes/edges', () => {
      useFlowStore.setState({
        activeSceneId: 'scene-1',
        flowNodes: [{ id: 'existing', type: 'camera', label: 'Existing', position: { x: 0, y: 0 } }],
        flowEdges: [],
      });

      scaffoldPipeline();

      const state = useFlowStore.getState();
      // 1 existing + 9 new = 10
      expect(state.flowNodes).toHaveLength(10);
      expect(state.flowNodes[0].id).toBe('existing');
    });

    it('sets output node as enabled', () => {
      useFlowStore.setState({
        activeSceneId: 'scene-1',
        flowNodes: [],
        flowEdges: [],
      });

      scaffoldPipeline();

      const outputNode = useFlowStore.getState().flowNodes.find((n) => n.type === 'output');
      expect(outputNode?.enabled).toBe(true);
    });

    it('sets group node hide_previous to false', () => {
      useFlowStore.setState({
        activeSceneId: 'scene-1',
        flowNodes: [],
        flowEdges: [],
      });

      scaffoldPipeline();

      const groupNode = useFlowStore.getState().flowNodes.find((n) => n.type === 'group');
      expect(groupNode?.hide_previous).toBe(false);
    });

    it('shows toast after scaffolding', () => {
      useFlowStore.setState({
        activeSceneId: 'scene-1',
        flowNodes: [],
        flowEdges: [],
      });

      scaffoldPipeline();

      const toast = useFlowStore.getState().toast;
      expect(toast?.message).toBe('Scaffolded typical pipeline');
      expect(toast?.level).toBe('success');
    });
  });
});
