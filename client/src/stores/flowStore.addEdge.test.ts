import { describe, it, expect, beforeEach } from 'vitest';
import { useFlowStore } from './flowStore';

// Helper: set minimal store state with nodes already in place
function seedStore(nodes: Array<{ id: string; type: string }>) {
  useFlowStore.setState({
    flowNodes: nodes.map((n) => ({
      id: n.id,
      type: n.type as any,
      label: n.id,
      position: { x: 0, y: 0 },
    })),
    flowEdges: [],
    activeSceneId: 'test-scene',
  });
}

describe('addEdge handle-aware behavior', () => {
  beforeEach(() => {
    useFlowStore.setState({
      flowNodes: [],
      flowEdges: [],
      activeSceneId: null,
    });
  });

  it('creates edge without handles (legacy behavior)', () => {
    seedStore([
      { id: 'cam', type: 'camera' },
      { id: 'grp', type: 'group' },
    ]);
    const result = useFlowStore.getState().addEdge('cam', 'grp', null, null);
    expect(result).toBe(true);
    const edges = useFlowStore.getState().flowEdges;
    expect(edges).toHaveLength(1);
    expect(edges[0].source_handle).toBeUndefined();
    expect(edges[0].target_handle).toBeUndefined();
  });

  it('creates edge with explicit handles', () => {
    seedStore([
      { id: 'cam', type: 'camera' },
      { id: 'grp', type: 'group' },
    ]);
    const result = useFlowStore.getState().addEdge('cam', 'grp', 'source-0', 'target-1');
    expect(result).toBe(true);
    const edges = useFlowStore.getState().flowEdges;
    expect(edges).toHaveLength(1);
    expect(edges[0].source_handle).toBe('source-0');
    expect(edges[0].target_handle).toBe('target-1');
  });

  it('prevents exact duplicate edge (same handles)', () => {
    seedStore([
      { id: 'cam', type: 'camera' },
      { id: 'grp', type: 'group' },
    ]);
    useFlowStore.getState().addEdge('cam', 'grp', 'source-0', 'target-0');
    const result = useFlowStore.getState().addEdge('cam', 'grp', 'source-0', 'target-0');
    expect(result).toBe(false);
    expect(useFlowStore.getState().flowEdges).toHaveLength(1);
  });

  it('allows multiple edges between same nodes on different handles', () => {
    seedStore([
      { id: 'ly', type: 'layerSetup' },
      { id: 'ar', type: 'aspectRatio' },
    ]);
    const r1 = useFlowStore.getState().addEdge('ly', 'ar', 'source-0', 'target-0');
    const r2 = useFlowStore.getState().addEdge('ly', 'ar', 'source-1', 'target-1');
    expect(r1).toBe(true);
    expect(r2).toBe(true);
    expect(useFlowStore.getState().flowEdges).toHaveLength(2);
  });

  it('prevents no-handle edge when handle-specific edge exists', () => {
    seedStore([
      { id: 'cam', type: 'camera' },
      { id: 'grp', type: 'group' },
    ]);
    useFlowStore.getState().addEdge('cam', 'grp', 'source-0', 'target-0');
    const result = useFlowStore.getState().addEdge('cam', 'grp', null, null);
    expect(result).toBe(false);
    expect(useFlowStore.getState().flowEdges).toHaveLength(1);
  });
});

describe('lane propagation through passthrough nodes', () => {
  beforeEach(() => {
    useFlowStore.setState({
      flowNodes: [],
      flowEdges: [],
      activeSceneId: 'test-scene',
    });
  });

  it('auto-creates output edge when passthrough node gains a second input', () => {
    seedStore([
      { id: 'tm1', type: 'toneMapping' },
      { id: 'tm2', type: 'toneMapping' },
      { id: 'ly', type: 'layerSetup' },
      { id: 'ar', type: 'aspectRatio' },
    ]);

    // Wire first pipeline: tm1 → ly → ar
    useFlowStore.getState().addEdge('tm1', 'ly', 'source-0', 'target-0');
    useFlowStore.getState().addEdge('ly', 'ar', 'source-0', 'target-0');
    expect(useFlowStore.getState().flowEdges).toHaveLength(2);

    // Wire second tone mapping into layer setup
    useFlowStore.getState().addEdge('tm2', 'ly', 'source-0', 'target-1');

    // Layer setup should now have auto-created a second output edge to ar
    const edges = useFlowStore.getState().flowEdges;
    const lyOutgoing = edges.filter((e) => e.source === 'ly');
    expect(lyOutgoing).toHaveLength(2);
    expect(lyOutgoing[0].source_handle).toBe('source-0');
    expect(lyOutgoing[1].source_handle).toBe('source-1');
  });

  it('propagates lanes through multiple downstream nodes', () => {
    seedStore([
      { id: 'tm1', type: 'toneMapping' },
      { id: 'tm2', type: 'toneMapping' },
      { id: 'ly', type: 'layerSetup' },
      { id: 'ar', type: 'aspectRatio' },
      { id: 'sr', type: 'stageRev' },
    ]);

    // Wire: tm1 → ly → ar → sr
    useFlowStore.getState().addEdge('tm1', 'ly', 'source-0', 'target-0');
    useFlowStore.getState().addEdge('ly', 'ar', 'source-0', 'target-0');
    useFlowStore.getState().addEdge('ar', 'sr', 'source-0', 'target-0');

    // Add second input to ly
    useFlowStore.getState().addEdge('tm2', 'ly', 'source-0', 'target-1');

    const edges = useFlowStore.getState().flowEdges;
    // ly should have 2 outputs to ar
    expect(edges.filter((e) => e.source === 'ly')).toHaveLength(2);
    // ar should have 2 outputs to sr (cascaded)
    expect(edges.filter((e) => e.source === 'ar')).toHaveLength(2);
  });

  it('does not propagate through output nodes (sink)', () => {
    seedStore([
      { id: 'dl1', type: 'deadline' },
      { id: 'dl2', type: 'deadline' },
      { id: 'out', type: 'output' },
    ]);

    useFlowStore.getState().addEdge('dl1', 'out', 'source-0', 'target-0');
    useFlowStore.getState().addEdge('dl2', 'out', 'source-0', 'target-1');

    // Output node is a sink, so no propagation needed
    const edges = useFlowStore.getState().flowEdges;
    expect(edges).toHaveLength(2);
    const outOutgoing = edges.filter((e) => e.source === 'out');
    expect(outOutgoing).toHaveLength(0);
  });

  it('does not create output edges when node has no downstream', () => {
    seedStore([
      { id: 'tm1', type: 'toneMapping' },
      { id: 'tm2', type: 'toneMapping' },
      { id: 'ly', type: 'layerSetup' },
    ]);

    useFlowStore.getState().addEdge('tm1', 'ly', 'source-0', 'target-0');
    // No downstream from ly
    useFlowStore.getState().addEdge('tm2', 'ly', 'source-0', 'target-1');

    const edges = useFlowStore.getState().flowEdges;
    expect(edges).toHaveLength(2); // Just the 2 input edges, no output created
  });
});

describe('scaffoldPipeline', () => {
  beforeEach(() => {
    useFlowStore.setState({
      flowNodes: [],
      flowEdges: [],
      activeSceneId: 'test-scene',
    });
  });

  it('creates a full pipeline of 9 nodes and 8 edges', () => {
    useFlowStore.getState().scaffoldPipeline();
    const { flowNodes, flowEdges } = useFlowStore.getState();
    expect(flowNodes).toHaveLength(9);
    expect(flowEdges).toHaveLength(8);
  });

  it('creates the correct node types in pipeline order', () => {
    useFlowStore.getState().scaffoldPipeline();
    const types = useFlowStore.getState().flowNodes.map((n) => n.type);
    expect(types).toEqual([
      'camera', 'group', 'lightSetup', 'toneMapping',
      'layerSetup', 'aspectRatio', 'stageRev', 'deadline', 'output',
    ]);
  });

  it('wires each node to the next with source-0 → target-0', () => {
    useFlowStore.getState().scaffoldPipeline();
    const { flowNodes, flowEdges } = useFlowStore.getState();
    for (let i = 0; i < flowEdges.length; i++) {
      expect(flowEdges[i].source).toBe(flowNodes[i].id);
      expect(flowEdges[i].target).toBe(flowNodes[i + 1].id);
      expect(flowEdges[i].source_handle).toBe('source-0');
      expect(flowEdges[i].target_handle).toBe('target-0');
    }
  });

  it('appends to existing nodes (does not replace)', () => {
    seedStore([{ id: 'existing', type: 'camera' }]);
    useFlowStore.getState().scaffoldPipeline();
    const { flowNodes } = useFlowStore.getState();
    expect(flowNodes).toHaveLength(10); // 1 existing + 9 new
    expect(flowNodes[0].id).toBe('existing');
  });
});
