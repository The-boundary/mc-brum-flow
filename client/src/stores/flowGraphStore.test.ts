import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  useFlowGraphStore,
  genNodeId,
  areSerializedValuesEqual,
  normalizeFlowEdges,
  bindGraphStoreSave,
} from './flowGraphStore';

// Mock flowLayout to avoid pulling in React Flow dependencies
vi.mock('@/components/flow/flowLayout', () => ({
  getFlowHandleLayout: (_nodes: unknown[], _edges: unknown[]) => ({
    edgeHandles: new Map(),
  }),
}));

// Track scheduleSave calls via the bridge
const saveBridgeSpy = vi.fn<(needsResolve: boolean) => void>();

function resetGraphStore() {
  useFlowGraphStore.setState({
    flowNodes: [],
    flowEdges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
    selectedNodeId: null,
    selectedNodeIds: [],
  });
}

function seedNodes(nodes: Array<{ id: string; type: string }>) {
  useFlowGraphStore.setState({
    flowNodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as any,
      label: n.id,
      position: { x: 0, y: 0 },
    })),
    flowEdges: [],
  });
}

describe('flowGraphStore', () => {
  beforeEach(() => {
    resetGraphStore();
    saveBridgeSpy.mockClear();
    bindGraphStoreSave(saveBridgeSpy);
  });

  afterEach(() => {
    // Reset bridge to avoid leaking between test files
    bindGraphStoreSave(() => {});
  });

  // -----------------------------------------------------------------------
  // Helper functions
  // -----------------------------------------------------------------------

  describe('genNodeId', () => {
    it('returns unique IDs', () => {
      const id1 = genNodeId();
      const id2 = genNodeId();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^node_\d+_\d+$/);
    });
  });

  describe('areSerializedValuesEqual', () => {
    it('returns true for identical objects', () => {
      expect(areSerializedValuesEqual({ a: 1 }, { a: 1 })).toBe(true);
    });

    it('returns false for different objects', () => {
      expect(areSerializedValuesEqual({ a: 1 }, { a: 2 })).toBe(false);
    });

    it('returns true for identical arrays', () => {
      expect(areSerializedValuesEqual([1, 2], [1, 2])).toBe(true);
    });
  });

  describe('normalizeFlowEdges', () => {
    it('returns edges unchanged when layout provides no overrides', () => {
      const edges = [
        { id: 'e1', source: 'a', target: 'b', source_handle: 'source-0', target_handle: 'target-0' },
      ];
      const result = normalizeFlowEdges([], edges);
      expect(result).toEqual(edges);
    });
  });

  // -----------------------------------------------------------------------
  // Selection
  // -----------------------------------------------------------------------

  describe('selectNode', () => {
    it('sets selectedNodeId', () => {
      useFlowGraphStore.getState().selectNode('n1');
      expect(useFlowGraphStore.getState().selectedNodeId).toBe('n1');
    });

    it('clears selectedNodeId with null', () => {
      useFlowGraphStore.getState().selectNode('n1');
      useFlowGraphStore.getState().selectNode(null);
      expect(useFlowGraphStore.getState().selectedNodeId).toBeNull();
    });
  });

  describe('setSelectedNodeIds', () => {
    it('sets multiple selected node IDs', () => {
      useFlowGraphStore.getState().setSelectedNodeIds(['n1', 'n2']);
      expect(useFlowGraphStore.getState().selectedNodeIds).toEqual(['n1', 'n2']);
    });
  });

  // -----------------------------------------------------------------------
  // addNode
  // -----------------------------------------------------------------------

  describe('addNode', () => {
    it('adds a node with default label and selects it', () => {
      useFlowGraphStore.getState().addNode('camera', { x: 100, y: 200 });
      const { flowNodes, selectedNodeId } = useFlowGraphStore.getState();
      expect(flowNodes).toHaveLength(1);
      expect(flowNodes[0].type).toBe('camera');
      expect(flowNodes[0].label).toBe('Camera');
      expect(flowNodes[0].position).toEqual({ x: 100, y: 200 });
      expect(selectedNodeId).toBe(flowNodes[0].id);
    });

    it('sets config_id when provided', () => {
      useFlowGraphStore.getState().addNode('lightSetup', { x: 0, y: 0 }, 'cfg1');
      expect(useFlowGraphStore.getState().flowNodes[0].config_id).toBe('cfg1');
    });

    it('sets camera_id when provided', () => {
      useFlowGraphStore.getState().addNode('camera', { x: 0, y: 0 }, undefined, 'cam1');
      expect(useFlowGraphStore.getState().flowNodes[0].camera_id).toBe('cam1');
    });

    it('sets enabled=true for output nodes', () => {
      useFlowGraphStore.getState().addNode('output', { x: 0, y: 0 });
      expect(useFlowGraphStore.getState().flowNodes[0].enabled).toBe(true);
    });

    it('sets hide_previous=false for group nodes', () => {
      useFlowGraphStore.getState().addNode('group', { x: 0, y: 0 });
      expect(useFlowGraphStore.getState().flowNodes[0].hide_previous).toBe(false);
    });

    it('calls scheduleSave with needsResolve=true', () => {
      useFlowGraphStore.getState().addNode('camera', { x: 0, y: 0 });
      expect(saveBridgeSpy).toHaveBeenCalledWith(true);
    });
  });

  // -----------------------------------------------------------------------
  // removeNode
  // -----------------------------------------------------------------------

  describe('removeNode', () => {
    it('removes node and connected edges', () => {
      seedNodes([
        { id: 'a', type: 'camera' },
        { id: 'b', type: 'group' },
      ]);
      useFlowGraphStore.setState({
        flowEdges: [{ id: 'e1', source: 'a', target: 'b' }],
      });

      useFlowGraphStore.getState().removeNode('a');

      expect(useFlowGraphStore.getState().flowNodes).toHaveLength(1);
      expect(useFlowGraphStore.getState().flowNodes[0].id).toBe('b');
      expect(useFlowGraphStore.getState().flowEdges).toHaveLength(0);
    });

    it('clears selectedNodeId if removed node was selected', () => {
      seedNodes([{ id: 'a', type: 'camera' }]);
      useFlowGraphStore.setState({ selectedNodeId: 'a' });

      useFlowGraphStore.getState().removeNode('a');

      expect(useFlowGraphStore.getState().selectedNodeId).toBeNull();
    });

    it('calls scheduleSave with needsResolve=true', () => {
      seedNodes([{ id: 'a', type: 'camera' }]);
      useFlowGraphStore.getState().removeNode('a');
      expect(saveBridgeSpy).toHaveBeenCalledWith(true);
    });
  });

  // -----------------------------------------------------------------------
  // removeNodes
  // -----------------------------------------------------------------------

  describe('removeNodes', () => {
    it('removes multiple nodes and their edges', () => {
      seedNodes([
        { id: 'a', type: 'camera' },
        { id: 'b', type: 'group' },
        { id: 'c', type: 'lightSetup' },
      ]);
      useFlowGraphStore.setState({
        flowEdges: [
          { id: 'e1', source: 'a', target: 'b' },
          { id: 'e2', source: 'b', target: 'c' },
        ],
      });

      useFlowGraphStore.getState().removeNodes(['a', 'b']);

      expect(useFlowGraphStore.getState().flowNodes).toHaveLength(1);
      expect(useFlowGraphStore.getState().flowNodes[0].id).toBe('c');
      expect(useFlowGraphStore.getState().flowEdges).toHaveLength(0);
    });

    it('clears selectedNodeId if it was in the removed set', () => {
      seedNodes([{ id: 'a', type: 'camera' }, { id: 'b', type: 'group' }]);
      useFlowGraphStore.setState({ selectedNodeId: 'a', selectedNodeIds: ['a', 'b'] });

      useFlowGraphStore.getState().removeNodes(['a']);

      expect(useFlowGraphStore.getState().selectedNodeId).toBeNull();
      expect(useFlowGraphStore.getState().selectedNodeIds).toEqual(['b']);
    });
  });

  // -----------------------------------------------------------------------
  // addEdge
  // -----------------------------------------------------------------------

  describe('addEdge', () => {
    it('creates edge without handles (legacy behavior)', () => {
      seedNodes([
        { id: 'cam', type: 'camera' },
        { id: 'grp', type: 'group' },
      ]);
      const result = useFlowGraphStore.getState().addEdge('cam', 'grp', null, null);
      expect(result).toBe(true);
      const edges = useFlowGraphStore.getState().flowEdges;
      expect(edges).toHaveLength(1);
      expect(edges[0].source_handle).toBeUndefined();
      expect(edges[0].target_handle).toBeUndefined();
    });

    it('creates edge with explicit handles', () => {
      seedNodes([
        { id: 'cam', type: 'camera' },
        { id: 'grp', type: 'group' },
      ]);
      const result = useFlowGraphStore.getState().addEdge('cam', 'grp', 'source-0', 'target-1');
      expect(result).toBe(true);
      const edges = useFlowGraphStore.getState().flowEdges;
      expect(edges).toHaveLength(1);
      expect(edges[0].source_handle).toBe('source-0');
      expect(edges[0].target_handle).toBe('target-1');
    });

    it('prevents exact duplicate edge (same handles)', () => {
      seedNodes([
        { id: 'cam', type: 'camera' },
        { id: 'grp', type: 'group' },
      ]);
      useFlowGraphStore.getState().addEdge('cam', 'grp', 'source-0', 'target-0');
      const result = useFlowGraphStore.getState().addEdge('cam', 'grp', 'source-0', 'target-0');
      expect(result).toBe(false);
      expect(useFlowGraphStore.getState().flowEdges).toHaveLength(1);
    });

    it('allows multiple edges between same nodes on different handles', () => {
      seedNodes([
        { id: 'ly', type: 'layerSetup' },
        { id: 'ar', type: 'aspectRatio' },
      ]);
      const r1 = useFlowGraphStore.getState().addEdge('ly', 'ar', 'source-0', 'target-0');
      const r2 = useFlowGraphStore.getState().addEdge('ly', 'ar', 'source-1', 'target-1');
      expect(r1).toBe(true);
      expect(r2).toBe(true);
      expect(useFlowGraphStore.getState().flowEdges).toHaveLength(2);
    });

    it('prevents no-handle edge when handle-specific edge exists', () => {
      seedNodes([
        { id: 'cam', type: 'camera' },
        { id: 'grp', type: 'group' },
      ]);
      useFlowGraphStore.getState().addEdge('cam', 'grp', 'source-0', 'target-0');
      const result = useFlowGraphStore.getState().addEdge('cam', 'grp', null, null);
      expect(result).toBe(false);
      expect(useFlowGraphStore.getState().flowEdges).toHaveLength(1);
    });

    it('rejects invalid connections (camera → output)', () => {
      seedNodes([
        { id: 'cam', type: 'camera' },
        { id: 'out', type: 'output' },
      ]);
      const result = useFlowGraphStore.getState().addEdge('cam', 'out');
      expect(result).toBe(false);
    });

    it('rejects self-loops', () => {
      seedNodes([{ id: 'cam', type: 'camera' }]);
      const result = useFlowGraphStore.getState().addEdge('cam', 'cam');
      expect(result).toBe(false);
    });

    it('rejects edges with non-existent nodes', () => {
      seedNodes([{ id: 'cam', type: 'camera' }]);
      const result = useFlowGraphStore.getState().addEdge('cam', 'nonexistent');
      expect(result).toBe(false);
    });

    it('calls scheduleSave with needsResolve=true on success', () => {
      seedNodes([
        { id: 'cam', type: 'camera' },
        { id: 'grp', type: 'group' },
      ]);
      useFlowGraphStore.getState().addEdge('cam', 'grp');
      expect(saveBridgeSpy).toHaveBeenCalledWith(true);
    });
  });

  // -----------------------------------------------------------------------
  // Lane propagation through passthrough nodes
  // -----------------------------------------------------------------------

  describe('lane propagation through passthrough nodes', () => {
    it('auto-creates output edge when passthrough node gains a second input', () => {
      seedNodes([
        { id: 'tm1', type: 'toneMapping' },
        { id: 'tm2', type: 'toneMapping' },
        { id: 'ly', type: 'layerSetup' },
        { id: 'ar', type: 'aspectRatio' },
      ]);

      useFlowGraphStore.getState().addEdge('tm1', 'ly', 'source-0', 'target-0');
      useFlowGraphStore.getState().addEdge('ly', 'ar', 'source-0', 'target-0');
      expect(useFlowGraphStore.getState().flowEdges).toHaveLength(2);

      useFlowGraphStore.getState().addEdge('tm2', 'ly', 'source-0', 'target-1');

      const edges = useFlowGraphStore.getState().flowEdges;
      const lyOutgoing = edges.filter((e) => e.source === 'ly');
      expect(lyOutgoing).toHaveLength(2);
      expect(lyOutgoing[0].source_handle).toBe('source-0');
      expect(lyOutgoing[1].source_handle).toBe('source-1');
    });

    it('propagates lanes through multiple downstream nodes', () => {
      seedNodes([
        { id: 'tm1', type: 'toneMapping' },
        { id: 'tm2', type: 'toneMapping' },
        { id: 'ly', type: 'layerSetup' },
        { id: 'ar', type: 'aspectRatio' },
        { id: 'sr', type: 'stageRev' },
      ]);

      useFlowGraphStore.getState().addEdge('tm1', 'ly', 'source-0', 'target-0');
      useFlowGraphStore.getState().addEdge('ly', 'ar', 'source-0', 'target-0');
      useFlowGraphStore.getState().addEdge('ar', 'sr', 'source-0', 'target-0');

      useFlowGraphStore.getState().addEdge('tm2', 'ly', 'source-0', 'target-1');

      const edges = useFlowGraphStore.getState().flowEdges;
      expect(edges.filter((e) => e.source === 'ly')).toHaveLength(2);
      expect(edges.filter((e) => e.source === 'ar')).toHaveLength(2);
    });

    it('does not propagate through output nodes (sink)', () => {
      seedNodes([
        { id: 'dl1', type: 'deadline' },
        { id: 'dl2', type: 'deadline' },
        { id: 'out', type: 'output' },
      ]);

      useFlowGraphStore.getState().addEdge('dl1', 'out', 'source-0', 'target-0');
      useFlowGraphStore.getState().addEdge('dl2', 'out', 'source-0', 'target-1');

      const edges = useFlowGraphStore.getState().flowEdges;
      expect(edges).toHaveLength(2);
      const outOutgoing = edges.filter((e) => e.source === 'out');
      expect(outOutgoing).toHaveLength(0);
    });

    it('does not create output edges when node has no downstream', () => {
      seedNodes([
        { id: 'tm1', type: 'toneMapping' },
        { id: 'tm2', type: 'toneMapping' },
        { id: 'ly', type: 'layerSetup' },
      ]);

      useFlowGraphStore.getState().addEdge('tm1', 'ly', 'source-0', 'target-0');
      useFlowGraphStore.getState().addEdge('tm2', 'ly', 'source-0', 'target-1');

      const edges = useFlowGraphStore.getState().flowEdges;
      expect(edges).toHaveLength(2);
    });
  });

  // -----------------------------------------------------------------------
  // removeEdge
  // -----------------------------------------------------------------------

  describe('removeEdge', () => {
    it('removes edge by ID', () => {
      seedNodes([
        { id: 'cam', type: 'camera' },
        { id: 'grp', type: 'group' },
      ]);
      useFlowGraphStore.getState().addEdge('cam', 'grp', 'source-0', 'target-0');
      const edgeId = useFlowGraphStore.getState().flowEdges[0].id;

      useFlowGraphStore.getState().removeEdge(edgeId);

      expect(useFlowGraphStore.getState().flowEdges).toHaveLength(0);
    });

    it('calls scheduleSave with needsResolve=true', () => {
      seedNodes([
        { id: 'cam', type: 'camera' },
        { id: 'grp', type: 'group' },
      ]);
      useFlowGraphStore.getState().addEdge('cam', 'grp');
      saveBridgeSpy.mockClear();

      useFlowGraphStore.getState().removeEdge(useFlowGraphStore.getState().flowEdges[0].id);
      expect(saveBridgeSpy).toHaveBeenCalledWith(true);
    });
  });

  // -----------------------------------------------------------------------
  // updateNodePosition
  // -----------------------------------------------------------------------

  describe('updateNodePosition', () => {
    it('updates position of a node', () => {
      seedNodes([{ id: 'n1', type: 'camera' }]);

      useFlowGraphStore.getState().updateNodePosition('n1', { x: 50, y: 75 });

      expect(useFlowGraphStore.getState().flowNodes[0].position).toEqual({ x: 50, y: 75 });
    });

    it('calls scheduleSave without needsResolve', () => {
      seedNodes([{ id: 'n1', type: 'camera' }]);
      saveBridgeSpy.mockClear();

      useFlowGraphStore.getState().updateNodePosition('n1', { x: 50, y: 75 });

      expect(saveBridgeSpy).toHaveBeenCalledWith(false);
    });
  });

  // -----------------------------------------------------------------------
  // applyNodeLayout
  // -----------------------------------------------------------------------

  describe('applyNodeLayout', () => {
    it('updates positions for multiple nodes', () => {
      seedNodes([
        { id: 'a', type: 'camera' },
        { id: 'b', type: 'group' },
      ]);

      useFlowGraphStore.getState().applyNodeLayout({
        a: { x: 10, y: 20 },
        b: { x: 30, y: 40 },
      });

      const nodes = useFlowGraphStore.getState().flowNodes;
      expect(nodes[0].position).toEqual({ x: 10, y: 20 });
      expect(nodes[1].position).toEqual({ x: 30, y: 40 });
    });

    it('skips nodes not in the positions map', () => {
      seedNodes([
        { id: 'a', type: 'camera' },
        { id: 'b', type: 'group' },
      ]);

      useFlowGraphStore.getState().applyNodeLayout({ a: { x: 10, y: 20 } });

      expect(useFlowGraphStore.getState().flowNodes[1].position).toEqual({ x: 0, y: 0 });
    });
  });

  // -----------------------------------------------------------------------
  // updateViewport
  // -----------------------------------------------------------------------

  describe('updateViewport', () => {
    it('sets viewport', () => {
      useFlowGraphStore.getState().updateViewport({ x: 5, y: 10, zoom: 2 });
      expect(useFlowGraphStore.getState().viewport).toEqual({ x: 5, y: 10, zoom: 2 });
    });

    it('calls scheduleSave without needsResolve', () => {
      saveBridgeSpy.mockClear();
      useFlowGraphStore.getState().updateViewport({ x: 0, y: 0, zoom: 1 });
      expect(saveBridgeSpy).toHaveBeenCalledWith(false);
    });
  });

  // -----------------------------------------------------------------------
  // updateNodeLabel
  // -----------------------------------------------------------------------

  describe('updateNodeLabel', () => {
    it('updates label of a node', () => {
      seedNodes([{ id: 'n1', type: 'camera' }]);

      useFlowGraphStore.getState().updateNodeLabel('n1', 'My Camera');

      expect(useFlowGraphStore.getState().flowNodes[0].label).toBe('My Camera');
    });

    it('calls scheduleSave with needsResolve=true', () => {
      seedNodes([{ id: 'n1', type: 'camera' }]);
      saveBridgeSpy.mockClear();

      useFlowGraphStore.getState().updateNodeLabel('n1', 'New Label');
      expect(saveBridgeSpy).toHaveBeenCalledWith(true);
    });
  });

  // -----------------------------------------------------------------------
  // toggleHidePrevious
  // -----------------------------------------------------------------------

  describe('toggleHidePrevious', () => {
    it('toggles hide_previous on group nodes', () => {
      useFlowGraphStore.setState({
        flowNodes: [{
          id: 'g1',
          type: 'group',
          label: 'Group',
          position: { x: 0, y: 0 },
          hide_previous: false,
        }],
      });

      useFlowGraphStore.getState().toggleHidePrevious('g1');
      expect(useFlowGraphStore.getState().flowNodes[0].hide_previous).toBe(true);

      useFlowGraphStore.getState().toggleHidePrevious('g1');
      expect(useFlowGraphStore.getState().flowNodes[0].hide_previous).toBe(false);
    });

    it('does not toggle non-group nodes', () => {
      seedNodes([{ id: 'cam', type: 'camera' }]);

      useFlowGraphStore.getState().toggleHidePrevious('cam');
      expect(useFlowGraphStore.getState().flowNodes[0].hide_previous).toBeUndefined();
    });

    it('calls scheduleSave with needsResolve=true', () => {
      useFlowGraphStore.setState({
        flowNodes: [{
          id: 'g1',
          type: 'group',
          label: 'Group',
          position: { x: 0, y: 0 },
          hide_previous: false,
        }],
      });
      saveBridgeSpy.mockClear();

      useFlowGraphStore.getState().toggleHidePrevious('g1');
      expect(saveBridgeSpy).toHaveBeenCalledWith(true);
    });
  });
});
