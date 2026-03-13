import { describe, it, expect } from 'vitest';
import type { FlowNode, FlowEdge, NodeType } from '@shared/types';
import { getHiddenPreviousNodeIds } from './NodeFlowView';

// ── Helpers (same pattern as flowLayout.test.ts) ──

function makeNode(id: string, type: NodeType, overrides?: Partial<FlowNode>): FlowNode {
  return { id, type, label: id, position: { x: 0, y: 0 }, ...overrides };
}

function makeEdge(id: string, source: string, target: string): FlowEdge {
  return { id, source, target };
}

describe('getHiddenPreviousNodeIds', () => {
  it('returns empty set when there are no group nodes', () => {
    const nodes = [makeNode('cam', 'camera'), makeNode('ls', 'lightSetup')];
    const edges = [makeEdge('e1', 'cam', 'ls')];
    const result = getHiddenPreviousNodeIds(nodes, edges);
    expect(result.size).toBe(0);
  });

  it('returns empty set when group exists but hide_previous is false/undefined', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('grp', 'group'),
    ];
    const edges = [makeEdge('e1', 'cam', 'grp')];
    const result = getHiddenPreviousNodeIds(nodes, edges);
    expect(result.size).toBe(0);
  });

  it('returns empty set when group has hide_previous=false explicitly', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('grp', 'group', { hide_previous: false }),
    ];
    const edges = [makeEdge('e1', 'cam', 'grp')];
    const result = getHiddenPreviousNodeIds(nodes, edges);
    expect(result.size).toBe(0);
  });

  it('hides single upstream node when group has hide_previous', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('grp', 'group', { hide_previous: true }),
    ];
    const edges = [makeEdge('e1', 'cam', 'grp')];
    const result = getHiddenPreviousNodeIds(nodes, edges);
    expect(result.size).toBe(1);
    expect(result.has('cam')).toBe(true);
  });

  it('hides chain of upstream nodes', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('ls', 'lightSetup'),
      makeNode('grp', 'group', { hide_previous: true }),
    ];
    const edges = [
      makeEdge('e1', 'cam', 'ls'),
      makeEdge('e2', 'ls', 'grp'),
    ];
    const result = getHiddenPreviousNodeIds(nodes, edges);
    expect(result.size).toBe(2);
    expect(result.has('cam')).toBe(true);
    expect(result.has('ls')).toBe(true);
  });

  it('hides diamond-shaped upstream nodes', () => {
    const nodes = [
      makeNode('cam1', 'camera'),
      makeNode('cam2', 'camera'),
      makeNode('grp', 'group', { hide_previous: true }),
    ];
    const edges = [
      makeEdge('e1', 'cam1', 'grp'),
      makeEdge('e2', 'cam2', 'grp'),
    ];
    const result = getHiddenPreviousNodeIds(nodes, edges);
    expect(result.size).toBe(2);
    expect(result.has('cam1')).toBe(true);
    expect(result.has('cam2')).toBe(true);
  });

  it('only hides upstream of the group that has hide_previous', () => {
    const nodes = [
      makeNode('cam1', 'camera'),
      makeNode('cam2', 'camera'),
      makeNode('grp1', 'group', { hide_previous: true }),
      makeNode('grp2', 'group'),
    ];
    const edges = [
      makeEdge('e1', 'cam1', 'grp1'),
      makeEdge('e2', 'cam2', 'grp2'),
    ];
    const result = getHiddenPreviousNodeIds(nodes, edges);
    expect(result.size).toBe(1);
    expect(result.has('cam1')).toBe(true);
    expect(result.has('cam2')).toBe(false);
  });

  it('does not hide downstream nodes', () => {
    const nodes = [
      makeNode('cam', 'camera'),
      makeNode('grp', 'group', { hide_previous: true }),
      makeNode('ls', 'lightSetup'),
    ];
    const edges = [
      makeEdge('e1', 'cam', 'grp'),
      makeEdge('e2', 'grp', 'ls'),
    ];
    const result = getHiddenPreviousNodeIds(nodes, edges);
    expect(result.size).toBe(1);
    expect(result.has('cam')).toBe(true);
    expect(result.has('ls')).toBe(false);
    expect(result.has('grp')).toBe(false);
  });

  it('returns empty set for empty inputs', () => {
    const result = getHiddenPreviousNodeIds([], []);
    expect(result.size).toBe(0);
  });
});
