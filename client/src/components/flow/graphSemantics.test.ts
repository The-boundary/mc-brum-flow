import { describe, it, expect } from 'vitest';
import type { FlowNode, FlowEdge, NodeType } from '@shared/types';
import { getFlowSemantics } from './graphSemantics';

// ── Helpers ──

function makeNode(id: string, type: NodeType, label?: string, position?: { x: number; y: number }): FlowNode {
  return { id, type, label: label ?? id, position: position ?? { x: 0, y: 0 } };
}

function makeEdge(id: string, source: string, target: string, sourceHandle?: string, targetHandle?: string): FlowEdge {
  return { id, source, target, source_handle: sourceHandle, target_handle: targetHandle };
}

// ── Empty and trivial inputs ──

describe('getFlowSemantics', () => {
  describe('empty inputs', () => {
    it('returns empty semantics for no nodes and no edges', () => {
      const result = getFlowSemantics([], [], null);
      expect(result.edgeCameraCounts.size).toBe(0);
      expect(result.edgeLabels.size).toBe(0);
      expect(result.outputHandleLabels.size).toBe(0);
      expect(result.highlightedEdgeIds.size).toBe(0);
      expect(result.highlightedNodeIds.size).toBe(0);
      expect(result.selectedCameraNodeId).toBeNull();
      expect(result.downstreamNodeIds.size).toBe(0);
      expect(result.upstreamNodeIds.size).toBe(0);
    });

    it('returns no highlights when selectedNodeId is null', () => {
      const nodes = [makeNode('cam', 'camera'), makeNode('g', 'group')];
      const edges = [makeEdge('e1', 'cam', 'g')];
      const result = getFlowSemantics(nodes, edges, null);
      expect(result.highlightedNodeIds.size).toBe(0);
      expect(result.highlightedEdgeIds.size).toBe(0);
    });
  });

  // ── Camera coverage / edgeCameraCounts ──

  describe('camera coverage', () => {
    it('counts camera paths through a simple chain', () => {
      const nodes = [
        makeNode('cam', 'camera'),
        makeNode('g', 'group'),
        makeNode('ls', 'lightSetup'),
      ];
      const edges = [
        makeEdge('e1', 'cam', 'g'),
        makeEdge('e2', 'g', 'ls'),
      ];
      const result = getFlowSemantics(nodes, edges, null);

      expect(result.edgeCameraCounts.get('e1')).toBe(1);
      expect(result.edgeCameraCounts.get('e2')).toBe(1);
    });

    it('counts multiple cameras merging into a shared node', () => {
      const nodes = [
        makeNode('cam1', 'camera', 'CamA'),
        makeNode('cam2', 'camera', 'CamB'),
        makeNode('g', 'group'),
        makeNode('ls', 'lightSetup'),
      ];
      const edges = [
        makeEdge('e1', 'cam1', 'g'),
        makeEdge('e2', 'cam2', 'g'),
        makeEdge('e3', 'g', 'ls'),
      ];
      const result = getFlowSemantics(nodes, edges, null);

      expect(result.edgeCameraCounts.get('e1')).toBe(1);
      expect(result.edgeCameraCounts.get('e2')).toBe(1);
      // e3 carries both cameras
      expect(result.edgeCameraCounts.get('e3')).toBe(2);
    });

    it('group node broadcasts all cameras to all output edges', () => {
      const nodes = [
        makeNode('cam1', 'camera', 'Cam1', { x: 0, y: 0 }),
        makeNode('cam2', 'camera', 'Cam2', { x: 0, y: 100 }),
        makeNode('g', 'group', 'Group'),
        makeNode('ls1', 'lightSetup', 'LS1', { x: 200, y: 0 }),
        makeNode('ls2', 'lightSetup', 'LS2', { x: 200, y: 100 }),
      ];
      const edges = [
        makeEdge('e1', 'cam1', 'g', undefined, 'target-0'),
        makeEdge('e2', 'cam2', 'g', undefined, 'target-1'),
        makeEdge('e3', 'g', 'ls1', 'source-0', 'target-0'),
        makeEdge('e4', 'g', 'ls2', 'source-1', 'target-0'),
      ];
      const result = getFlowSemantics(nodes, edges, null);

      // Both output edges from group should carry BOTH cameras (orange)
      expect(result.edgeCameraCounts.get('e3')).toBe(2);
      expect(result.edgeCameraCounts.get('e4')).toBe(2);
      // Input edges carry 1 camera each
      expect(result.edgeCameraCounts.get('e1')).toBe(1);
      expect(result.edgeCameraCounts.get('e2')).toBe(1);
    });

    it('group broadcast propagates correct counts through downstream processing chain', () => {
      const nodes = [
        makeNode('cam1', 'camera', 'Cam1', { x: 0, y: 0 }),
        makeNode('cam2', 'camera', 'Cam2', { x: 0, y: 100 }),
        makeNode('g', 'group', 'Group'),
        makeNode('ls1', 'lightSetup', 'LS1', { x: 200, y: 0 }),
        makeNode('ls2', 'lightSetup', 'LS2', { x: 200, y: 100 }),
        makeNode('tm', 'toneMapping', 'TM'),
      ];
      const edges = [
        makeEdge('e1', 'cam1', 'g', undefined, 'target-0'),
        makeEdge('e2', 'cam2', 'g', undefined, 'target-1'),
        makeEdge('e3', 'g', 'ls1', 'source-0', 'target-0'),
        makeEdge('e4', 'g', 'ls2', 'source-1', 'target-0'),
        makeEdge('e5', 'ls1', 'tm', 'source-0', 'target-0'),
        makeEdge('e6', 'ls2', 'tm', 'source-0', 'target-1'),
      ];
      const result = getFlowSemantics(nodes, edges, null);

      // Both LS output edges carry 2 cameras
      expect(result.edgeCameraCounts.get('e5')).toBe(2);
      expect(result.edgeCameraCounts.get('e6')).toBe(2);
    });

    it('returns 0 for edges not reachable from any camera', () => {
      const nodes = [
        makeNode('g', 'group'),
        makeNode('ls', 'lightSetup'),
      ];
      const edges = [makeEdge('e1', 'g', 'ls')];
      const result = getFlowSemantics(nodes, edges, null);

      expect(result.edgeCameraCounts.get('e1')).toBe(0);
    });
  });

  // ── Selected camera highlighting ──

  describe('camera selection highlighting', () => {
    it('highlights all nodes and edges on a camera path', () => {
      const nodes = [
        makeNode('cam', 'camera'),
        makeNode('g', 'group'),
        makeNode('ls', 'lightSetup'),
      ];
      const edges = [
        makeEdge('e1', 'cam', 'g'),
        makeEdge('e2', 'g', 'ls'),
      ];
      const result = getFlowSemantics(nodes, edges, 'cam');

      expect(result.selectedCameraNodeId).toBe('cam');
      expect(result.highlightedNodeIds.has('cam')).toBe(true);
      expect(result.highlightedNodeIds.has('g')).toBe(true);
      expect(result.highlightedNodeIds.has('ls')).toBe(true);
      expect(result.highlightedEdgeIds.has('e1')).toBe(true);
      expect(result.highlightedEdgeIds.has('e2')).toBe(true);
    });

    it('does not highlight nodes on a different camera path', () => {
      const nodes = [
        makeNode('cam1', 'camera', 'Cam1'),
        makeNode('cam2', 'camera', 'Cam2'),
        makeNode('g1', 'group', 'G1'),
        makeNode('g2', 'group', 'G2'),
      ];
      const edges = [
        makeEdge('e1', 'cam1', 'g1'),
        makeEdge('e2', 'cam2', 'g2'),
      ];
      const result = getFlowSemantics(nodes, edges, 'cam1');

      expect(result.highlightedNodeIds.has('cam1')).toBe(true);
      expect(result.highlightedNodeIds.has('g1')).toBe(true);
      expect(result.highlightedNodeIds.has('cam2')).toBe(false);
      expect(result.highlightedNodeIds.has('g2')).toBe(false);
      expect(result.highlightedEdgeIds.has('e1')).toBe(true);
      expect(result.highlightedEdgeIds.has('e2')).toBe(false);
    });
  });

  // ── Non-camera selection (upstream/downstream) ──

  describe('non-camera selection highlighting', () => {
    it('highlights upstream and downstream nodes for a non-camera selection', () => {
      const nodes = [
        makeNode('cam', 'camera'),
        makeNode('g', 'group'),
        makeNode('ls', 'lightSetup'),
        makeNode('tm', 'toneMapping'),
      ];
      const edges = [
        makeEdge('e1', 'cam', 'g'),
        makeEdge('e2', 'g', 'ls'),
        makeEdge('e3', 'ls', 'tm'),
      ];
      const result = getFlowSemantics(nodes, edges, 'ls');

      expect(result.selectedCameraNodeId).toBeNull();
      // ls itself is highlighted
      expect(result.highlightedNodeIds.has('ls')).toBe(true);
      // upstream: cam, g
      expect(result.upstreamNodeIds.has('cam')).toBe(true);
      expect(result.upstreamNodeIds.has('g')).toBe(true);
      expect(result.highlightedNodeIds.has('cam')).toBe(true);
      expect(result.highlightedNodeIds.has('g')).toBe(true);
      // downstream: tm
      expect(result.downstreamNodeIds.has('tm')).toBe(true);
      expect(result.highlightedNodeIds.has('tm')).toBe(true);
    });

    it('highlights edges between highlighted nodes', () => {
      const nodes = [
        makeNode('cam', 'camera'),
        makeNode('g', 'group'),
        makeNode('ls', 'lightSetup'),
      ];
      const edges = [
        makeEdge('e1', 'cam', 'g'),
        makeEdge('e2', 'g', 'ls'),
      ];
      const result = getFlowSemantics(nodes, edges, 'g');

      // All three nodes are highlighted (cam upstream, g selected, ls downstream)
      expect(result.highlightedEdgeIds.has('e1')).toBe(true);
      expect(result.highlightedEdgeIds.has('e2')).toBe(true);
    });

    it('does not include the selected node itself in upstream or downstream sets', () => {
      const nodes = [
        makeNode('cam', 'camera'),
        makeNode('g', 'group'),
      ];
      const edges = [makeEdge('e1', 'cam', 'g')];
      const result = getFlowSemantics(nodes, edges, 'g');

      expect(result.upstreamNodeIds.has('g')).toBe(false);
      expect(result.downstreamNodeIds.has('g')).toBe(false);
    });

    it('handles a node with no connections', () => {
      const nodes = [makeNode('solo', 'group')];
      const result = getFlowSemantics(nodes, [], 'solo');

      expect(result.highlightedNodeIds.has('solo')).toBe(true);
      expect(result.upstreamNodeIds.size).toBe(0);
      expect(result.downstreamNodeIds.size).toBe(0);
    });
  });

  // ── Edge labels ──

  describe('edge labels', () => {
    it('labels an edge with the upstream camera name', () => {
      const nodes = [
        makeNode('cam', 'camera', 'Hero_Cam'),
        makeNode('g', 'group', 'Main Group'),
      ];
      const edges = [makeEdge('e1', 'cam', 'g')];
      const result = getFlowSemantics(nodes, edges, null);

      const label = result.edgeLabels.get('e1');
      expect(label).toBeDefined();
      expect(label!.label).toBe('Hero_Cam');
      expect(label!.tone).toBe('camera');
    });

    it('labels an edge with group name when multiple cameras merge', () => {
      const nodes = [
        makeNode('cam1', 'camera', 'CamA'),
        makeNode('cam2', 'camera', 'CamB'),
        makeNode('g', 'group', 'Merge Group'),
        makeNode('ls', 'lightSetup', 'Light'),
      ];
      const edges = [
        makeEdge('e1', 'cam1', 'g'),
        makeEdge('e2', 'cam2', 'g'),
        makeEdge('e3', 'g', 'ls'),
      ];
      const result = getFlowSemantics(nodes, edges, null);

      // e3 has two cameras merging through a group: should use group tone
      const e3Label = result.edgeLabels.get('e3');
      expect(e3Label).toBeDefined();
      expect(e3Label!.tone).toBe('group');
      expect(e3Label!.label).toBe('Merge Group');
    });

    it('uses mixed tone for single camera with group', () => {
      const nodes = [
        makeNode('cam', 'camera', 'MyCam'),
        makeNode('g', 'group', 'MyGroup'),
        makeNode('ls', 'lightSetup'),
      ];
      const edges = [
        makeEdge('e1', 'cam', 'g'),
        makeEdge('e2', 'g', 'ls'),
      ];
      const result = getFlowSemantics(nodes, edges, null);

      const e2Label = result.edgeLabels.get('e2');
      expect(e2Label).toBeDefined();
      expect(e2Label!.tone).toBe('mixed');
      expect(e2Label!.label).toContain('MyCam');
      expect(e2Label!.label).toContain('MyGroup');
    });

    it('returns path tone for edge with no camera or group upstream', () => {
      const nodes = [
        makeNode('ls', 'lightSetup', 'Light'),
        makeNode('tm', 'toneMapping', 'Tone'),
      ];
      const edges = [makeEdge('e1', 'ls', 'tm')];
      const result = getFlowSemantics(nodes, edges, null);

      const label = result.edgeLabels.get('e1');
      expect(label).toBeDefined();
      expect(label!.tone).toBe('path');
      expect(label!.label).toBe('Path');
    });
  });

  // ── Output handle labels ──

  describe('outputHandleLabels', () => {
    it('populates output handle labels when source_handle is present', () => {
      const nodes = [
        makeNode('cam', 'camera', 'MyCam'),
        makeNode('g', 'group'),
      ];
      const edges = [makeEdge('e1', 'cam', 'g', 'source-0', undefined)];
      const result = getFlowSemantics(nodes, edges, null);

      const handleLabels = result.outputHandleLabels.get('cam');
      expect(handleLabels).toBeDefined();
      expect(handleLabels!['source-0']).toBeDefined();
      expect(handleLabels!['source-0'].label).toBe('MyCam');
    });

    it('does not populate output handle labels when no source_handle', () => {
      const nodes = [
        makeNode('cam', 'camera', 'MyCam'),
        makeNode('g', 'group'),
      ];
      const edges = [makeEdge('e1', 'cam', 'g')];
      const result = getFlowSemantics(nodes, edges, null);

      // No source_handle on the edge, so no outputHandleLabels entry
      expect(result.outputHandleLabels.has('cam')).toBe(false);
    });
  });

  // ── Cycles ──

  describe('cycle handling', () => {
    it('does not infinite loop on a cycle in the graph', () => {
      const nodes = [
        makeNode('a', 'group', 'A'),
        makeNode('b', 'group', 'B'),
      ];
      const edges = [
        makeEdge('e1', 'a', 'b'),
        makeEdge('e2', 'b', 'a'),
      ];
      // Should complete without hanging
      const result = getFlowSemantics(nodes, edges, 'a');
      expect(result).toBeDefined();
      expect(result.highlightedNodeIds.has('a')).toBe(true);
      expect(result.highlightedNodeIds.has('b')).toBe(true);
    });
  });

  // ── Disconnected graph ──

  describe('disconnected graph', () => {
    it('handles disconnected subgraphs correctly', () => {
      const nodes = [
        makeNode('cam1', 'camera', 'Cam1'),
        makeNode('g1', 'group', 'G1'),
        makeNode('cam2', 'camera', 'Cam2'),
        makeNode('g2', 'group', 'G2'),
      ];
      const edges = [
        makeEdge('e1', 'cam1', 'g1'),
        makeEdge('e2', 'cam2', 'g2'),
      ];
      const result = getFlowSemantics(nodes, edges, 'g1');

      // Selecting g1: upstream = cam1, downstream = none
      expect(result.upstreamNodeIds.has('cam1')).toBe(true);
      expect(result.upstreamNodeIds.has('cam2')).toBe(false);
      expect(result.downstreamNodeIds.size).toBe(0);

      // cam2 and g2 should not be highlighted
      expect(result.highlightedNodeIds.has('cam2')).toBe(false);
      expect(result.highlightedNodeIds.has('g2')).toBe(false);
    });
  });

  // ── Selecting a nonexistent node ──

  describe('nonexistent selection', () => {
    it('returns empty highlights for a selectedNodeId not in nodes', () => {
      const nodes = [makeNode('cam', 'camera')];
      const result = getFlowSemantics(nodes, [], 'nonexistent');

      // selectedCameraNodeId should be null (node not found)
      expect(result.selectedCameraNodeId).toBeNull();
      // No nodes or edges highlighted because the nonexistent node is not connected to anything
      // The BFS will run but find no connections
      expect(result.downstreamNodeIds.size).toBe(0);
      expect(result.upstreamNodeIds.size).toBe(0);
    });
  });
});
