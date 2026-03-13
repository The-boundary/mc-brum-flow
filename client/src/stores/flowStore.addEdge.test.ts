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
