// ── Mocks — declared before the import that uses them ──

const mockEmitSocketEvent = vi.fn();
const mockDbQuery = vi.fn();
const mockExecuteMaxMcpScript = vi.fn();

vi.mock('./socket-events.js', () => ({
  emitSocketEvent: (...args: unknown[]) => mockEmitSocketEvent(...args),
}));

vi.mock('./supabase.js', () => ({
  dbQuery: (...args: unknown[]) => mockDbQuery(...args),
}));

vi.mock('./max-mcp-client.js', () => ({
  executeMaxMcpScript: (...args: unknown[]) => mockExecuteMaxMcpScript(...args),
}));

vi.mock('../config.js', () => ({
  config: {
    maxSyncDebounceMs: 100,
    nodeEnv: 'test',
  },
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ── Import under test ──

import { resolveTargetPath } from './max-sync.js';
import type { ResolvedFlowPath } from './flowResolver.js';
import type { MaxSyncState } from '../../../shared/types/index.js';
import { logger } from '../utils/logger.js';

// ── Helpers ──

function makePath(overrides: Partial<ResolvedFlowPath> = {}): ResolvedFlowPath {
  return {
    pathKey: overrides.pathKey ?? 'cam1>out1',
    nodeIds: overrides.nodeIds ?? ['cam1', 'out1'],
    outputNodeId: overrides.outputNodeId ?? 'out1',
    cameraName: overrides.cameraName ?? 'Camera001',
    filename: overrides.filename ?? 'Camera001.exr',
    resolvedConfig: overrides.resolvedConfig ?? {},
    enabled: overrides.enabled ?? true,
    stageLabels: overrides.stageLabels ?? {},
    warnings: overrides.warnings ?? [],
  };
}

function makeSyncState(overrides: Partial<MaxSyncState> = {}): MaxSyncState {
  return {
    scene_id: overrides.scene_id ?? 'scene-1',
    status: overrides.status ?? 'idle',
    active_path_key: overrides.active_path_key ?? null,
    active_camera_name: overrides.active_camera_name ?? null,
    last_synced_config: overrides.last_synced_config ?? {},
    last_request_id: overrides.last_request_id ?? null,
    last_reason: overrides.last_reason ?? 'test',
    last_error: overrides.last_error ?? null,
    last_synced_at: overrides.last_synced_at ?? null,
    updated_at: overrides.updated_at ?? new Date().toISOString(),
  };
}

// ── Tests ──

describe('resolveTargetPath', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves via preferredPathKey when it matches', () => {
    const pathA = makePath({ pathKey: 'cam1>ls1>out1' });
    const pathB = makePath({ pathKey: 'cam1>ls2>out2' });

    const result = resolveTargetPath(
      [pathA, pathB],
      null,
      { sceneId: 's1', reason: 'test', preferredPathKey: 'cam1>ls2>out2' },
    );

    expect(result).not.toBeNull();
    expect(result!.path.pathKey).toBe('cam1>ls2>out2');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedVia: 'preferredPathKey' }),
      expect.any(String),
    );
  });

  it('falls back to preferredPathIndex when preferredPathKey does not match', () => {
    const pathA = makePath({ pathKey: 'cam1>out1' });
    const pathB = makePath({ pathKey: 'cam1>out2' });

    const result = resolveTargetPath(
      [pathA, pathB],
      null,
      { sceneId: 's1', reason: 'test', preferredPathKey: 'nonexistent', preferredPathIndex: 1 },
    );

    expect(result).not.toBeNull();
    expect(result!.path.pathKey).toBe('cam1>out2');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedVia: 'preferredPathIndex' }),
      expect.any(String),
    );
  });

  it('falls back to syncState.active_path_key when preferred options miss', () => {
    const pathA = makePath({ pathKey: 'cam1>out1' });
    const pathB = makePath({ pathKey: 'cam1>out2' });
    const syncState = makeSyncState({ active_path_key: 'cam1>out2' });

    const result = resolveTargetPath(
      [pathA, pathB],
      syncState,
      { sceneId: 's1', reason: 'test' },
    );

    expect(result).not.toBeNull();
    expect(result!.path.pathKey).toBe('cam1>out2');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedVia: 'syncState.active_path_key' }),
      expect.any(String),
    );
  });

  it('falls back to first enabled path when no preferred or syncState match', () => {
    const pathA = makePath({ pathKey: 'cam1>out1', enabled: false });
    const pathB = makePath({ pathKey: 'cam1>out2', enabled: true });

    const result = resolveTargetPath(
      [pathA, pathB],
      null,
      { sceneId: 's1', reason: 'test' },
    );

    expect(result).not.toBeNull();
    expect(result!.path.pathKey).toBe('cam1>out2');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedVia: 'firstEnabled' }),
      expect.any(String),
    );
  });

  it('substitutes disabled path with first enabled when force=false', () => {
    const disabledPath = makePath({ pathKey: 'cam1>out1', enabled: false });
    const enabledPath = makePath({ pathKey: 'cam1>out2', enabled: true });

    const result = resolveTargetPath(
      [disabledPath, enabledPath],
      null,
      { sceneId: 's1', reason: 'test', preferredPathKey: 'cam1>out1' },
    );

    expect(result).not.toBeNull();
    expect(result!.path.pathKey).toBe('cam1>out2');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedVia: 'substituted(was:preferredPathKey)' }),
      expect.any(String),
    );
    // Should also emit a max:log warning
    expect(mockEmitSocketEvent).toHaveBeenCalledWith('max:log', expect.objectContaining({
      level: 'warn',
      summary: expect.stringContaining('sync:path-substituted'),
    }));
  });

  it('does NOT substitute disabled path when force=true', () => {
    const disabledPath = makePath({ pathKey: 'cam1>out1', enabled: false });
    const enabledPath = makePath({ pathKey: 'cam1>out2', enabled: true });

    const result = resolveTargetPath(
      [disabledPath, enabledPath],
      null,
      { sceneId: 's1', reason: 'test', preferredPathKey: 'cam1>out1', force: true },
    );

    expect(result).not.toBeNull();
    expect(result!.path.pathKey).toBe('cam1>out1');
    expect(result!.path.enabled).toBe(false);
  });

  it('returns null when no paths at all', () => {
    const result = resolveTargetPath(
      [],
      null,
      { sceneId: 's1', reason: 'test' },
    );

    expect(result).toBeNull();
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ pathCount: 0 }),
      expect.stringContaining('no viable path found'),
    );
  });

  it('returns null when all paths are disabled and force=false', () => {
    const pathA = makePath({ pathKey: 'cam1>out1', enabled: false });
    const pathB = makePath({ pathKey: 'cam1>out2', enabled: false });

    const result = resolveTargetPath(
      [pathA, pathB],
      null,
      { sceneId: 's1', reason: 'test' },
    );

    // The cascade reaches "firstEnabled" but finds none, so returns null
    expect(result).toBeNull();
  });

  it('returns null when resolved path is disabled and no enabled alternative exists', () => {
    const disabledPath = makePath({ pathKey: 'cam1>out1', enabled: false });

    const result = resolveTargetPath(
      [disabledPath],
      null,
      { sceneId: 's1', reason: 'test', preferredPathKey: 'cam1>out1' },
    );

    // preferredPathKey matches but path is disabled. Substitution looks for
    // an enabled alternative but finds none, so path becomes undefined -> null.
    expect(result).toBeNull();
  });

  it('uses preferredPathIndex without preferredPathKey', () => {
    const pathA = makePath({ pathKey: 'cam1>out1' });
    const pathB = makePath({ pathKey: 'cam1>out2' });

    const result = resolveTargetPath(
      [pathA, pathB],
      null,
      { sceneId: 's1', reason: 'test', preferredPathIndex: 0 },
    );

    expect(result).not.toBeNull();
    expect(result!.path.pathKey).toBe('cam1>out1');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.objectContaining({ resolvedVia: 'preferredPathIndex' }),
      expect.any(String),
    );
  });
});
