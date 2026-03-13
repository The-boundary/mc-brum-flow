import { resolveFlowPaths, type ResolvedFlowPath } from './flowResolver.js';

// ── Helpers ──

function makeNode(id: string, type: string, extra: Record<string, unknown> = {}) {
  return { id, type, label: extra.label ?? id, ...extra };
}

function makeEdge(source: string, target: string, extra: Record<string, unknown> = {}) {
  return { source, target, ...extra };
}

// ── Tests ──

describe('resolveFlowPaths', () => {
  describe('basic path resolution', () => {
    it('returns empty array when there are no nodes', () => {
      const result = resolveFlowPaths({
        flow: { nodes: [], edges: [] },
        configs: {},
        cameras: {},
        defaults: {},
      });
      expect(result).toEqual([]);
    });

    it('returns empty array when there are no camera nodes', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [makeNode('n1', 'output')],
          edges: [],
        },
        configs: {},
        cameras: {},
        defaults: {},
      });
      expect(result).toEqual([]);
    });

    it('returns empty array when camera is not connected to output', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output'),
          ],
          edges: [], // no edge connecting them
        },
        configs: {},
        cameras: { c1: { name: 'Camera001' } },
        defaults: {},
      });
      expect(result).toEqual([]);
    });

    it('resolves a single camera -> output path', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output'),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: { c1: { name: 'Camera001' } },
        defaults: {},
      });

      expect(result).toHaveLength(1);
      expect(result[0].pathKey).toBe('cam1>out1');
      expect(result[0].nodeIds).toEqual(['cam1', 'out1']);
      expect(result[0].outputNodeId).toBe('out1');
      expect(result[0].cameraName).toBe('Camera001');
      expect(result[0].enabled).toBe(true);
    });

    it('resolves a multi-node path camera -> stage -> output', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('ls1', 'lightSetup', { label: 'HDRI Interior' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'ls1'),
            makeEdge('ls1', 'out1'),
          ],
        },
        configs: {},
        cameras: { c1: { name: 'Camera001' } },
        defaults: {},
      });

      expect(result).toHaveLength(1);
      expect(result[0].pathKey).toBe('cam1>ls1>out1');
      expect(result[0].stageLabels.lightSetup).toBe('HDRI Interior');
    });
  });

  describe('branching paths', () => {
    it('resolves multiple paths from one camera through different branches', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('ls1', 'lightSetup', { label: 'Day' }),
            makeNode('ls2', 'lightSetup', { label: 'Night' }),
            makeNode('out1', 'output'),
            makeNode('out2', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'ls1'),
            makeEdge('cam1', 'ls2'),
            makeEdge('ls1', 'out1'),
            makeEdge('ls2', 'out2'),
          ],
        },
        configs: {},
        cameras: { c1: { name: 'Camera001' } },
        defaults: {},
      });

      expect(result).toHaveLength(2);
      const pathKeys = result.map((p) => p.pathKey);
      expect(pathKeys).toContain('cam1>ls1>out1');
      expect(pathKeys).toContain('cam1>ls2>out2');
    });

    it('resolves paths from multiple cameras', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('cam2', 'camera', { camera_id: 'c2' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'out1'),
            makeEdge('cam2', 'out1'),
          ],
        },
        configs: {},
        cameras: {
          c1: { name: 'CamA' },
          c2: { name: 'CamB' },
        },
        defaults: {},
      });

      expect(result).toHaveLength(2);
      expect(result.map((p) => p.cameraName).sort()).toEqual(['CamA', 'CamB']);
    });
  });

  describe('cycle detection', () => {
    it('does not infinite-loop on a cycle in the graph', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('a', 'lightSetup', { label: 'A' }),
            makeNode('b', 'lightSetup', { label: 'B' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'a'),
            makeEdge('a', 'b'),
            makeEdge('b', 'a'), // cycle
            makeEdge('b', 'out1'),
          ],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      expect(result).toHaveLength(1);
      expect(result[0].pathKey).toBe('cam1>a>b>out1');
    });
  });

  describe('config merging and defaults', () => {
    it('flattens default settings into resolvedConfig', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output'),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {
          rendering: {
            parameters: {
              renderWidth: { default: 1920 },
              renderHeight: { default: 1080 },
            },
          },
        },
      });

      expect(result[0].resolvedConfig.renderWidth).toBe(1920);
      expect(result[0].resolvedConfig.renderHeight).toBe(1080);
    });

    it('merges node config deltas on top of defaults', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('ls1', 'lightSetup', { label: 'Day', config_id: 'cfg1' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'ls1'),
            makeEdge('ls1', 'out1'),
          ],
        },
        configs: {
          cfg1: { delta: { exposure: 5.0, renderWidth: 3840 } },
        },
        cameras: { c1: { name: 'Cam1' } },
        defaults: {
          rendering: {
            parameters: {
              renderWidth: { default: 1920 },
              renderHeight: { default: 1080 },
              exposure: { default: 1.0 },
            },
          },
        },
      });

      // Node config overrides defaults
      expect(result[0].resolvedConfig.renderWidth).toBe(3840);
      expect(result[0].resolvedConfig.renderHeight).toBe(1080);
      expect(result[0].resolvedConfig.exposure).toBe(5.0);
    });

    it('later node configs override earlier ones', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('n1', 'lightSetup', { label: 'L1', config_id: 'cfg1' }),
            makeNode('n2', 'toneMapping', { label: 'T1', config_id: 'cfg2' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'n1'),
            makeEdge('n1', 'n2'),
            makeEdge('n2', 'out1'),
          ],
        },
        configs: {
          cfg1: { delta: { exposure: 5.0 } },
          cfg2: { delta: { exposure: 10.0 } },
        },
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      expect(result[0].resolvedConfig.exposure).toBe(10.0);
    });

    it('skips nodes with config_id that have no matching config', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('n1', 'lightSetup', { label: 'L1', config_id: 'nonexistent' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'n1'),
            makeEdge('n1', 'out1'),
          ],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {
          rendering: { parameters: { exposure: { default: 1.0 } } },
        },
      });

      expect(result[0].resolvedConfig.exposure).toBe(1.0);
    });
  });

  describe('output resolution normalization (longest_edge + ratio)', () => {
    it('computes width/height from longest_edge and landscape ratio', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('ar1', 'aspectRatio', { label: '16:9', config_id: 'cfg_ar' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'ar1'),
            makeEdge('ar1', 'out1'),
          ],
        },
        configs: {
          cfg_ar: { delta: { longest_edge: 3840, ratio: '16:9' } },
        },
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      // 16:9 landscape: width = 3840, height = 3840 / (16/9) = 2160
      expect(result[0].resolvedConfig.renderWidth).toBe(3840);
      expect(result[0].resolvedConfig.renderHeight).toBe(2160);
      // longest_edge and ratio should be removed
      expect(result[0].resolvedConfig.longest_edge).toBeUndefined();
      expect(result[0].resolvedConfig.ratio).toBeUndefined();
    });

    it('computes width/height from longest_edge and portrait ratio', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('ar1', 'aspectRatio', { label: '9:16', config_id: 'cfg_ar' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'ar1'),
            makeEdge('ar1', 'out1'),
          ],
        },
        configs: {
          cfg_ar: { delta: { longest_edge: 3840, ratio: '9:16' } },
        },
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      // 9:16 portrait (ratio < 1): height = 3840, width = 3840 * (9/16) = 2160
      expect(result[0].resolvedConfig.renderWidth).toBe(2160);
      expect(result[0].resolvedConfig.renderHeight).toBe(3840);
    });

    it('uses slash notation for ratio', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('n1', 'aspectRatio', { label: '2/1', config_id: 'cfg1' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'n1'),
            makeEdge('n1', 'out1'),
          ],
        },
        configs: {
          cfg1: { delta: { longest_edge: 4000, ratio: '2/1' } },
        },
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      // 2:1 landscape: width=4000, height=2000
      expect(result[0].resolvedConfig.renderWidth).toBe(4000);
      expect(result[0].resolvedConfig.renderHeight).toBe(2000);
    });

    it('uses numeric ratio value', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('n1', 'aspectRatio', { label: '1.5', config_id: 'cfg1' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'n1'),
            makeEdge('n1', 'out1'),
          ],
        },
        configs: {
          cfg1: { delta: { longest_edge: 3000, ratio: 1.5 } },
        },
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      // 1.5 landscape: width=3000, height=3000/1.5=2000
      expect(result[0].resolvedConfig.renderWidth).toBe(3000);
      expect(result[0].resolvedConfig.renderHeight).toBe(2000);
    });

    it('falls back to existing renderWidth/renderHeight ratio when no ratio specified', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('n1', 'lightSetup', { label: 'L1', config_id: 'cfg1' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'n1'),
            makeEdge('n1', 'out1'),
          ],
        },
        configs: {
          cfg1: { delta: { longest_edge: 6000 } },
        },
        cameras: { c1: { name: 'Cam1' } },
        defaults: {
          rendering: {
            parameters: {
              renderWidth: { default: 1920 },
              renderHeight: { default: 1080 },
            },
          },
        },
      });

      // fallback ratio = 1920/1080 ≈ 1.778, landscape
      // width=6000, height=6000/(1920/1080)=3375
      expect(result[0].resolvedConfig.renderWidth).toBe(6000);
      expect(result[0].resolvedConfig.renderHeight).toBe(3375);
    });

    it('removes longest_edge and ratio even when no resolution is computed', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output'),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {
          rendering: {
            parameters: {
              longest_edge: { default: 0 },
              ratio: { default: 'invalid' },
            },
          },
        },
      });

      expect(result[0].resolvedConfig.longest_edge).toBeUndefined();
      expect(result[0].resolvedConfig.ratio).toBeUndefined();
    });
  });

  describe('filename construction', () => {
    it('builds filename from group labels, camera name, and rev label', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('g1', 'group', { label: 'LivingRoom' }),
            makeNode('rev1', 'stageRev', { label: 'v02' }),
            makeNode('out1', 'output', { config_id: 'cfg_out' }),
          ],
          edges: [
            makeEdge('cam1', 'g1'),
            makeEdge('g1', 'rev1'),
            makeEdge('rev1', 'out1'),
          ],
        },
        configs: {
          cfg_out: { delta: { format: 'PNG' } },
        },
        cameras: { c1: { name: 'Camera001' } },
        defaults: {},
      });

      expect(result[0].filename).toBe('LivingRoom - Camera001 - v02.png');
    });

    it('defaults to EXR format when output has no config', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output'),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: { c1: { name: 'Camera001' } },
        defaults: {},
      });

      expect(result[0].filename).toBe('Camera001.exr');
    });

    it('uses camera node label as fallback when camera_id is not in cameras map', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'missing', label: 'FallbackCam' }),
            makeNode('out1', 'output'),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: {},
        defaults: {},
      });

      expect(result[0].cameraName).toBe('FallbackCam');
      expect(result[0].filename).toBe('FallbackCam.exr');
    });

    it('omits empty parts from filename', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output'),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      // No group label, no rev label — just camera + format
      expect(result[0].filename).toBe('Cam1.exr');
    });
  });

  describe('enabled/disabled paths', () => {
    it('uses output node enabled property', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output', { enabled: false }),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      expect(result[0].enabled).toBe(false);
    });

    it('uses path_states override when present on output node', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output', {
              enabled: true,
              path_states: { 'cam1>out1': false },
            }),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      expect(result[0].enabled).toBe(false);
    });

    it('falls back to enabled=true when output node enabled is not explicitly false', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output'),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      expect(result[0].enabled).toBe(true);
    });
  });

  describe('stage labels', () => {
    it('collects stage labels from all STAGE_LABEL_TYPES nodes in path', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('ls1', 'lightSetup', { label: 'HDRI' }),
            makeNode('tm1', 'toneMapping', { label: 'ACES' }),
            makeNode('ly1', 'layerSetup', { label: 'Beauty' }),
            makeNode('ar1', 'aspectRatio', { label: '16:9' }),
            makeNode('rev1', 'stageRev', { label: 'v01' }),
            makeNode('dl1', 'deadline', { label: 'Priority' }),
            makeNode('ov1', 'override', { label: 'Draft' }),
            makeNode('out1', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'ls1'),
            makeEdge('ls1', 'tm1'),
            makeEdge('tm1', 'ly1'),
            makeEdge('ly1', 'ar1'),
            makeEdge('ar1', 'rev1'),
            makeEdge('rev1', 'dl1'),
            makeEdge('dl1', 'ov1'),
            makeEdge('ov1', 'out1'),
          ],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      expect(result[0].stageLabels).toEqual({
        lightSetup: 'HDRI',
        toneMapping: 'ACES',
        layerSetup: 'Beauty',
        aspectRatio: '16:9',
        stageRev: 'v01',
        deadline: 'Priority',
        override: 'Draft',
      });
    });
  });

  describe('handle-based lane routing', () => {
    it('routes edges based on source_handle index', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output'),
            makeNode('out2', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'out1', { source_handle: 'handle-0' }),
            makeEdge('cam1', 'out2', { source_handle: 'handle-1' }),
          ],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {},
      });

      // Both outputs should be reached
      expect(result).toHaveLength(2);
    });

    it('group node broadcasts camera to all output edges regardless of lane', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('cam2', 'camera', { camera_id: 'c2' }),
            makeNode('g', 'group', { label: 'Room' }),
            makeNode('ls1', 'lightSetup', { label: 'Day' }),
            makeNode('ls2', 'lightSetup', { label: 'Night' }),
            makeNode('out1', 'output'),
            makeNode('out2', 'output'),
          ],
          edges: [
            makeEdge('cam1', 'g', { target_handle: 'target-0' }),
            makeEdge('cam2', 'g', { target_handle: 'target-1' }),
            makeEdge('g', 'ls1', { source_handle: 'source-0', target_handle: 'target-0' }),
            makeEdge('g', 'ls2', { source_handle: 'source-1', target_handle: 'target-0' }),
            makeEdge('ls1', 'out1', { source_handle: 'source-0', target_handle: 'target-0' }),
            makeEdge('ls2', 'out2', { source_handle: 'source-0', target_handle: 'target-0' }),
          ],
        },
        configs: {},
        cameras: { c1: { name: 'CamA' }, c2: { name: 'CamB' } },
        defaults: {},
      });

      // Each camera should produce a path through BOTH light setups (4 total paths)
      expect(result).toHaveLength(4);
      const pathKeys = result.map((p) => p.pathKey).sort();
      expect(pathKeys).toContain('cam1>g>ls1>out1');
      expect(pathKeys).toContain('cam1>g>ls2>out2');
      expect(pathKeys).toContain('cam2>g>ls1>out1');
      expect(pathKeys).toContain('cam2>g>ls2>out2');
    });
  });

  describe('null/undefined safety', () => {
    it('handles flow with null nodes and edges', () => {
      const result = resolveFlowPaths({
        flow: { nodes: null as any, edges: null as any },
        configs: {},
        cameras: {},
        defaults: {},
      });
      expect(result).toEqual([]);
    });

    it('handles defaults with non-record groups', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output'),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {
          badGroup: 'not an object',
          nullGroup: null,
          arrayGroup: [1, 2, 3],
        },
      });

      expect(result).toHaveLength(1);
      // No crash, resolvedConfig is just empty
      expect(result[0].resolvedConfig).toEqual({});
    });

    it('handles defaults group where parameters has no default key', () => {
      const result = resolveFlowPaths({
        flow: {
          nodes: [
            makeNode('cam1', 'camera', { camera_id: 'c1' }),
            makeNode('out1', 'output'),
          ],
          edges: [makeEdge('cam1', 'out1')],
        },
        configs: {},
        cameras: { c1: { name: 'Cam1' } },
        defaults: {
          rendering: {
            parameters: {
              someParam: { label: 'No default key here' },
            },
          },
        },
      });

      expect(result[0].resolvedConfig).toEqual({});
    });
  });
});
