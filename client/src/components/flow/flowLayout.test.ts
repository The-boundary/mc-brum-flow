import { describe, it, expect } from 'vitest';
import type { FlowNode, FlowEdge, NodeType } from '@shared/types';
import {
  buildEdgeMaps,
  getFlowHandleLayout,
  getAutoLayoutPositions,
  getSuggestedNextNodeTypes,
  getSuggestedExistingTargetNodes,
} from './flowLayout';

// ── Helpers ──

function makeNode(id: string, type: NodeType, label?: string, position?: { x: number; y: number }): FlowNode {
  return { id, type, label: label ?? id, position: position ?? { x: 0, y: 0 } };
}

function makeEdge(id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string): FlowEdge {
  return { id, source, target, source_handle: sourceHandle, target_handle: targetHandle };
}

// ── buildEdgeMaps ──

describe('buildEdgeMaps', () => {
  it('returns empty maps for empty inputs', () => {
    const result = buildEdgeMaps([], []);
    expect(result.nodesById.size).toBe(0);
    expect(result.incoming.size).toBe(0);
    expect(result.outgoing.size).toBe(0);
  });

  it('builds correct nodesById map', () => {
    const nodes = [makeNode('a', 'camera'), makeNode('b', 'group')];
    const result = buildEdgeMaps(nodes, []);
    expect(result.nodesById.get('a')).toEqual(nodes[0]);
    expect(result.nodesById.get('b')).toEqual(nodes[1]);
  });

  it('builds correct incoming and outgoing maps', () => {
    const nodes = [makeNode('a', 'camera'), makeNode('b', 'group'), makeNode('c', 'lightSetup')];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'c')];
    const result = buildEdgeMaps(nodes, edges);

    expect(result.outgoing.get('a')).toHaveLength(1);
    expect(result.outgoing.get('a')![0].id).toBe('e1');
    expect(result.incoming.get('b')).toHaveLength(1);
    expect(result.incoming.get('b')![0].id).toBe('e1');
    expect(result.outgoing.get('b')).toHaveLength(1);
    expect(result.incoming.get('c')).toHaveLength(1);
    // camera has no incoming
    expect(result.incoming.get('a')).toBeUndefined();
    // lightSetup has no outgoing
    expect(result.outgoing.get('c')).toBeUndefined();
  });

  it('handles multiple edges to the same target', () => {
    const nodes = [makeNode('a', 'camera'), makeNode('b', 'camera'), makeNode('c', 'group')];
    const edges = [makeEdge('e1', 'a', 'c'), makeEdge('e2', 'b', 'c')];
    const result = buildEdgeMaps(nodes, edges);

    expect(result.incoming.get('c')).toHaveLength(2);
  });
});

// ── getFlowHandleLayout ──

describe('getFlowHandleLayout', () => {
  it('returns empty maps for empty inputs', () => {
    const result = getFlowHandleLayout([], []);
    expect(result.nodeHandles.size).toBe(0);
    expect(result.edgeHandles.size).toBe(0);
  });

  it('camera node gets only output handles (no input)', () => {
    const nodes = [makeNode('cam1', 'camera')];
    const result = getFlowHandleLayout(nodes, []);
    const handles = result.nodeHandles.get('cam1');
    expect(handles).toBeDefined();
    expect(handles!.inputHandleIds).toEqual([]);
    expect(handles!.outputHandleIds).toHaveLength(1);
    expect(handles!.outputHandleIds[0]).toBe('source-0');
  });

  it('output node gets only input handles (no output)', () => {
    const nodes = [makeNode('out1', 'output')];
    const result = getFlowHandleLayout(nodes, []);
    const handles = result.nodeHandles.get('out1');
    expect(handles).toBeDefined();
    expect(handles!.inputHandleIds).toHaveLength(1);
    expect(handles!.inputHandleIds[0]).toBe('target-0');
    expect(handles!.outputHandleIds).toEqual([]);
  });

  it('group node gets both input and output handles', () => {
    const nodes = [makeNode('g1', 'group')];
    const result = getFlowHandleLayout(nodes, []);
    const handles = result.nodeHandles.get('g1');
    expect(handles).toBeDefined();
    expect(handles!.inputHandleIds.length).toBeGreaterThan(0);
    expect(handles!.outputHandleIds.length).toBeGreaterThan(0);
  });

  it('scales handle count to max of incoming/outgoing edges', () => {
    const nodes = [
      makeNode('cam1', 'camera', 'Cam1', { x: 0, y: 0 }),
      makeNode('cam2', 'camera', 'Cam2', { x: 0, y: 100 }),
      makeNode('g1', 'group'),
    ];
    const edges = [makeEdge('e1', 'cam1', 'g1'), makeEdge('e2', 'cam2', 'g1')];
    const result = getFlowHandleLayout(nodes, edges);
    const groupHandles = result.nodeHandles.get('g1');
    // 2 incoming edges, so at least 2 input handles
    expect(groupHandles!.inputHandleIds.length).toBeGreaterThanOrEqual(2);
  });

  it('assigns edge handles correctly for a simple chain', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('grp', 'group'),
      makeNode('ls', 'lightSetup'),
    ];
    const edges = [makeEdge('e1', 'cam', 'grp'), makeEdge('e2', 'grp', 'ls')];
    const result = getFlowHandleLayout(nodes, edges);

    const e1Handles = result.edgeHandles.get('e1');
    expect(e1Handles).toBeDefined();
    expect(e1Handles!.sourceHandle).toBe('source-0');
    expect(e1Handles!.targetHandle).toBe('target-0');

    const e2Handles = result.edgeHandles.get('e2');
    expect(e2Handles).toBeDefined();
    expect(e2Handles!.sourceHandle).toBe('source-0');
    expect(e2Handles!.targetHandle).toBe('target-0');
  });

  it('respects explicit handle indices from edge data', () => {
    const nodes = [
      makeNode('cam1', 'camera', 'Cam1', { x: 0, y: 0 }),
      makeNode('cam2', 'camera', 'Cam2', { x: 0, y: 100 }),
      makeNode('g1', 'group'),
    ];
    // explicit target handle indices
    const edges = [
      makeEdge('e1', 'cam1', 'g1', undefined, 'target-1'),
      makeEdge('e2', 'cam2', 'g1', undefined, 'target-0'),
    ];
    const result = getFlowHandleLayout(nodes, edges);

    const e1 = result.edgeHandles.get('e1');
    const e2 = result.edgeHandles.get('e2');
    expect(e1!.targetHandle).toBe('target-1');
    expect(e2!.targetHandle).toBe('target-0');
  });
});

// ── getAutoLayoutPositions ──

describe('getAutoLayoutPositions', () => {
  it('returns empty object for empty node list', () => {
    expect(getAutoLayoutPositions([], [])).toEqual({});
  });

  it('returns a position for every node', () => {
    const nodes = [makeNode('a', 'camera'), makeNode('b', 'group'), makeNode('c', 'lightSetup')];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'c')];
    const positions = getAutoLayoutPositions(nodes, edges);

    expect(Object.keys(positions)).toHaveLength(3);
    expect(positions['a']).toHaveProperty('x');
    expect(positions['a']).toHaveProperty('y');
    expect(positions['b']).toHaveProperty('x');
    expect(positions['c']).toHaveProperty('x');
  });

  it('lays out a chain left-to-right (source x < target x)', () => {
    const nodes = [makeNode('a', 'camera'), makeNode('b', 'group'), makeNode('c', 'lightSetup')];
    const edges = [makeEdge('e1', 'a', 'b'), makeEdge('e2', 'b', 'c')];
    const positions = getAutoLayoutPositions(nodes, edges);

    expect(positions['a'].x).toBeLessThan(positions['b'].x);
    expect(positions['b'].x).toBeLessThan(positions['c'].x);
  });

  it('handles a single node', () => {
    const nodes = [makeNode('solo', 'camera')];
    const positions = getAutoLayoutPositions(nodes, []);
    expect(Object.keys(positions)).toHaveLength(1);
    expect(positions['solo']).toHaveProperty('x');
    expect(positions['solo']).toHaveProperty('y');
  });

  it('handles disconnected nodes', () => {
    const nodes = [makeNode('a', 'camera'), makeNode('b', 'output')];
    const positions = getAutoLayoutPositions(nodes, []);
    expect(Object.keys(positions)).toHaveLength(2);
    // Both should have valid positions
    expect(typeof positions['a'].x).toBe('number');
    expect(typeof positions['b'].x).toBe('number');
  });

  it('handles branching graph', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('g1', 'group'),
      makeNode('g2', 'group'),
    ];
    const edges = [makeEdge('e1', 'cam', 'g1'), makeEdge('e2', 'cam', 'g2')];
    const positions = getAutoLayoutPositions(nodes, edges);

    // Both branches should be to the right of camera
    expect(positions['g1'].x).toBeGreaterThan(positions['cam'].x);
    expect(positions['g2'].x).toBeGreaterThan(positions['cam'].x);
    // The two branches should have different y positions
    expect(positions['g1'].y).not.toBe(positions['g2'].y);
  });
});

// ── getSuggestedNextNodeTypes ──

describe('getSuggestedNextNodeTypes', () => {
  it('returns empty for unknown source node id', () => {
    const result = getSuggestedNextNodeTypes([], [], 'nonexistent');
    expect(result).toEqual([]);
  });

  it('camera can connect to group and lightSetup', () => {
    const nodes = [makeNode('cam', 'camera')];
    const result = getSuggestedNextNodeTypes(nodes, [], 'cam');
    expect(result).toEqual(['group', 'lightSetup']);
  });

  it('group can connect to group and lightSetup', () => {
    const nodes = [makeNode('g', 'group')];
    const result = getSuggestedNextNodeTypes(nodes, [], 'g');
    expect(result).toEqual(['group', 'lightSetup']);
  });

  it('lightSetup can connect to override and toneMapping', () => {
    const nodes = [makeNode('ls', 'lightSetup')];
    const result = getSuggestedNextNodeTypes(nodes, [], 'ls');
    expect(result).toEqual(['override', 'toneMapping']);
  });

  it('toneMapping can connect to override and layerSetup', () => {
    const nodes = [makeNode('tm', 'toneMapping')];
    const result = getSuggestedNextNodeTypes(nodes, [], 'tm');
    expect(result).toEqual(['override', 'layerSetup']);
  });

  it('deadline can connect to output', () => {
    const nodes = [makeNode('dl', 'deadline')];
    const result = getSuggestedNextNodeTypes(nodes, [], 'dl');
    expect(result).toEqual(['output']);
  });

  it('output cannot connect to anything', () => {
    const nodes = [makeNode('out', 'output')];
    const result = getSuggestedNextNodeTypes(nodes, [], 'out');
    expect(result).toEqual([]);
  });

  it('override with single upstream lightSetup suggests toneMapping', () => {
    const nodes = [
      makeNode('ls', 'lightSetup'),
      makeNode('ovr', 'override'),
    ];
    const edges = [makeEdge('e1', 'ls', 'ovr')];
    const result = getSuggestedNextNodeTypes(nodes, edges, 'ovr');
    expect(result).toEqual(['toneMapping']);
  });

  it('override with single upstream toneMapping suggests layerSetup', () => {
    const nodes = [
      makeNode('tm', 'toneMapping'),
      makeNode('ovr', 'override'),
    ];
    const edges = [makeEdge('e1', 'tm', 'ovr')];
    const result = getSuggestedNextNodeTypes(nodes, edges, 'ovr');
    expect(result).toEqual(['layerSetup']);
  });

  it('override with chained overrides resolves to original upstream type', () => {
    const nodes = [
      makeNode('ls', 'lightSetup'),
      makeNode('ovr1', 'override'),
      makeNode('ovr2', 'override'),
    ];
    const edges = [
      makeEdge('e1', 'ls', 'ovr1'),
      makeEdge('e2', 'ovr1', 'ovr2'),
    ];
    const result = getSuggestedNextNodeTypes(nodes, edges, 'ovr2');
    expect(result).toEqual(['toneMapping']);
  });

  it('override with conflicting upstream types returns empty', () => {
    const nodes = [
      makeNode('ls', 'lightSetup'),
      makeNode('tm', 'toneMapping'),
      makeNode('ovr', 'override'),
    ];
    const edges = [
      makeEdge('e1', 'ls', 'ovr'),
      makeEdge('e2', 'tm', 'ovr'),
    ];
    const result = getSuggestedNextNodeTypes(nodes, edges, 'ovr');
    // lightSetup -> toneMapping, toneMapping -> layerSetup: conflicting
    expect(result).toEqual([]);
  });

  it('override with no upstream returns empty', () => {
    const nodes = [makeNode('ovr', 'override')];
    const result = getSuggestedNextNodeTypes(nodes, [], 'ovr');
    expect(result).toEqual([]);
  });

  it('override with non-overridable upstream (camera) returns empty', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('ovr', 'override'),
    ];
    const edges = [makeEdge('e1', 'cam', 'ovr')];
    const result = getSuggestedNextNodeTypes(nodes, edges, 'ovr');
    expect(result).toEqual([]);
  });
});

// ── getSuggestedExistingTargetNodes ──

describe('getSuggestedExistingTargetNodes', () => {
  it('returns empty when no nodes match valid types', () => {
    const nodes = [makeNode('cam', 'camera'), makeNode('out', 'output')];
    const result = getSuggestedExistingTargetNodes(nodes, [], 'cam', ['lightSetup']);
    expect(result).toEqual([]);
  });

  it('returns matching nodes of valid types', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('g1', 'group', 'Alpha Group'),
      makeNode('g2', 'group', 'Beta Group'),
      makeNode('ls', 'lightSetup', 'Light'),
    ];
    const result = getSuggestedExistingTargetNodes(nodes, [], 'cam', ['group', 'lightSetup']);
    expect(result).toHaveLength(3);
    // Should contain g1, g2, and ls
    const ids = result.map((n) => n.id);
    expect(ids).toContain('g1');
    expect(ids).toContain('g2');
    expect(ids).toContain('ls');
  });

  it('excludes the source node itself', () => {
    const nodes = [makeNode('g1', 'group', 'Group A'), makeNode('g2', 'group', 'Group B')];
    const result = getSuggestedExistingTargetNodes(nodes, [], 'g1', ['group']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('g2');
  });

  it('excludes nodes already connected as targets', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('g1', 'group', 'Group A'),
      makeNode('g2', 'group', 'Group B'),
    ];
    const edges = [makeEdge('e1', 'cam', 'g1')];
    const result = getSuggestedExistingTargetNodes(nodes, edges, 'cam', ['group']);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('g2');
  });

  it('sorts by pipeline stage, then type name, then label', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('g2', 'group', 'Zeta'),
      makeNode('g1', 'group', 'Alpha'),
      makeNode('ls', 'lightSetup', 'Light'),
    ];
    const result = getSuggestedExistingTargetNodes(nodes, [], 'cam', ['group', 'lightSetup']);
    // group (pipeline index 1) < lightSetup (pipeline index 2)
    // Within group: Alpha < Zeta
    expect(result[0].id).toBe('g1');
    expect(result[1].id).toBe('g2');
    expect(result[2].id).toBe('ls');
  });

  it('returns empty for empty valid types', () => {
    const nodes = [makeNode('cam', 'camera'), makeNode('g', 'group')];
    const result = getSuggestedExistingTargetNodes(nodes, [], 'cam', []);
    expect(result).toEqual([]);
  });
});
