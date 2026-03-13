// Mock all external dependencies before importing the module under test.
// The routes/index.ts imports many heavy modules (express, db, auth, etc.)
// so we mock everything that touches infrastructure.

vi.mock('../services/supabase.js', () => ({
  dbQuery: vi.fn(),
}));

vi.mock('../middleware/auth.js', () => ({
  requireAuth: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

vi.mock('../services/deadline.js', () => ({
  submitDeadlineJob: vi.fn(),
}));

vi.mock('../services/flowResolver.js', () => ({
  resolveFlowPaths: vi.fn(() => []),
}));

vi.mock('../config.js', () => ({
  config: {
    maxHost: '127.0.0.1',
    maxPort: 8765,
    maxTcpServerPort: 8766,
    nodeEnv: 'test',
  },
}));

vi.mock('../services/max-mcp-client.js', () => ({
  executeMaxMcpScript: vi.fn(),
  probeMaxMcp: vi.fn(),
}));

vi.mock('../services/max-sync.js', () => ({
  getMaxSyncState: vi.fn(),
  MaxCameraNotFoundError: class MaxCameraNotFoundError extends Error {
    code = 'CAMERA_NOT_FOUND';
    requestedCameraName = '';
    availableCameras: string[] = [];
  },
  queueAllScenesSync: vi.fn(async () => {}),
  queueSceneSync: vi.fn(async () => {}),
  queueScenesUsingNodeConfig: vi.fn(async () => {}),
  syncSceneToMaxNow: vi.fn(),
}));

vi.mock('../services/max-tcp-server.js', () => ({
  getConnectedInstances: vi.fn(() => []),
  sendCommand: vi.fn(),
  invalidateEventHandlerCache: vi.fn(),
}));

vi.mock('../utils/logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import http from 'node:http';
import express from 'express';
import { buildImportCamerasScript, areSerializedValuesEqual } from './index.js';
import router from './index.js';
import { executeMaxMcpScript } from '../services/max-mcp-client.js';
import { dbQuery } from '../services/supabase.js';
import { logger } from '../utils/logger.js';

const mockExecuteMaxMcpScript = executeMaxMcpScript as ReturnType<typeof vi.fn>;
const mockDbQuery = dbQuery as ReturnType<typeof vi.fn>;
const mockLogger = logger as { info: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn>; debug: ReturnType<typeof vi.fn> };

// ── Helpers for route integration tests ──

function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', router);
  return app;
}

function requestJson(
  server: http.Server,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, `http://127.0.0.1:${(server.address() as { port: number }).port}`);
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
      },
    }, (res) => {
      let data = '';
      res.on('data', (chunk: string) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(data) });
        } catch {
          reject(new Error(`Failed to parse response: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// ── Tests ──

describe('buildImportCamerasScript', () => {
  it('returns a non-empty string', () => {
    const script = buildImportCamerasScript();
    expect(typeof script).toBe('string');
    expect(script.length).toBeGreaterThan(0);
  });

  it('contains the JSON escape helper function', () => {
    const script = buildImportCamerasScript();
    expect(script).toContain('bfEscJson');
  });

  it('iterates over cameras with superClassOf check', () => {
    const script = buildImportCamerasScript();
    expect(script).toContain('for cam in cameras');
    expect(script).toContain('superClassOf cam == camera');
  });

  it('extracts camera name, handle, and class', () => {
    const script = buildImportCamerasScript();
    expect(script).toContain('cam.name');
    expect(script).toContain('getHandleByAnim');
    expect(script).toContain('classOf cam');
  });

  it('produces JSON array output with name, max_handle, and max_class fields', () => {
    const script = buildImportCamerasScript();
    // The script builds JSON objects with escaped keys (MaxScript string escaping)
    // At runtime, the backslash-escaped quotes become literal quotes in the JSON
    expect(script).toContain('\\"name\\"');
    expect(script).toContain('\\"max_handle\\"');
    expect(script).toContain('\\"max_class\\"');
  });

  it('wraps the result in square brackets for a JSON array', () => {
    const script = buildImportCamerasScript();
    // The final line builds "[" + joined + "]"
    expect(script).toContain('"[" + joined + "]"');
  });

  it('joins array entries with commas', () => {
    const script = buildImportCamerasScript();
    expect(script).toContain('joined += ","');
  });

  it('is wrapped in parentheses for MaxScript expression evaluation', () => {
    const script = buildImportCamerasScript();
    expect(script.trimStart().startsWith('(')).toBe(true);
    expect(script.trimEnd().endsWith(')')).toBe(true);
  });

  it('handles JSON escape sequences for backslash, quote, newline, return, tab', () => {
    const script = buildImportCamerasScript();
    // The escape helper handles these characters
    expect(script).toContain('"\\\\"'); // backslash handling
    expect(script).toContain('"\\n"');  // newline handling
    expect(script).toContain('"\\r"');  // carriage return handling
    expect(script).toContain('"\\t"');  // tab handling
  });
});

describe('areSerializedValuesEqual', () => {
  it('returns true for identical primitive values', () => {
    expect(areSerializedValuesEqual(42, 42)).toBe(true);
    expect(areSerializedValuesEqual('hello', 'hello')).toBe(true);
    expect(areSerializedValuesEqual(true, true)).toBe(true);
    expect(areSerializedValuesEqual(null, null)).toBe(true);
  });

  it('returns false for different primitive values', () => {
    expect(areSerializedValuesEqual(42, 43)).toBe(false);
    expect(areSerializedValuesEqual('hello', 'world')).toBe(false);
    expect(areSerializedValuesEqual(true, false)).toBe(false);
  });

  it('returns true for deeply equal objects', () => {
    expect(areSerializedValuesEqual(
      { a: 1, b: { c: 2 } },
      { a: 1, b: { c: 2 } },
    )).toBe(true);
  });

  it('returns false for objects with different values', () => {
    expect(areSerializedValuesEqual(
      { a: 1, b: { c: 2 } },
      { a: 1, b: { c: 3 } },
    )).toBe(false);
  });

  it('returns false for objects with different key order (JSON.stringify is order-sensitive)', () => {
    // JSON.stringify produces different output for different key orders
    expect(areSerializedValuesEqual(
      { a: 1, b: 2 },
      { b: 2, a: 1 },
    )).toBe(false);
  });

  it('returns true for identical arrays', () => {
    expect(areSerializedValuesEqual([1, 2, 3], [1, 2, 3])).toBe(true);
  });

  it('returns false for arrays with different order', () => {
    expect(areSerializedValuesEqual([1, 2, 3], [3, 2, 1])).toBe(false);
  });

  it('returns true for empty arrays', () => {
    expect(areSerializedValuesEqual([], [])).toBe(true);
  });

  it('returns true for empty objects', () => {
    expect(areSerializedValuesEqual({}, {})).toBe(true);
  });

  it('returns false for undefined vs null', () => {
    // JSON.stringify(undefined) = undefined, JSON.stringify(null) = "null"
    expect(areSerializedValuesEqual(undefined, null)).toBe(false);
  });

  it('returns true for both undefined', () => {
    expect(areSerializedValuesEqual(undefined, undefined)).toBe(true);
  });

  it('returns true for nested arrays with objects', () => {
    expect(areSerializedValuesEqual(
      [{ id: 'a', nodes: [1, 2] }],
      [{ id: 'a', nodes: [1, 2] }],
    )).toBe(true);
  });

  it('returns false when one side has extra keys', () => {
    expect(areSerializedValuesEqual(
      { a: 1 },
      { a: 1, b: 2 },
    )).toBe(false);
  });
});

describe('POST /cameras/import-from-max', () => {
  let server: http.Server;

  beforeEach(() => {
    vi.clearAllMocks();
    const app = createTestApp();
    server = app.listen(0);
  });

  afterEach(() => {
    server.close();
  });

  it('reports dropped cameras when parsed payload contains invalid entries', async () => {
    // Mock scene lookup
    mockDbQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT instance_host')) {
        return { rows: [{ instance_host: '10.0.0.1' }] };
      }
      if (sql.includes('INSERT INTO cameras')) {
        return { rows: [{ id: 'cam-1', name: 'PhysCamera001', max_handle: 1, max_class: 'Physical' }] };
      }
      return { rows: [] };
    });

    // Return a mix of valid and invalid cameras from Max
    mockExecuteMaxMcpScript.mockResolvedValue({
      result: JSON.stringify([
        { name: 'PhysCamera001', max_handle: 1, max_class: 'Physical' },
        { name: '', max_handle: 2 },           // empty name — invalid
        { max_handle: 3 },                      // missing name — invalid
        { name: 'NoCam', max_handle: 'bad' },   // non-number handle — invalid
      ]),
    });

    const res = await requestJson(server, 'POST', '/api/cameras/import-from-max', { scene_id: 'scene-1' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const data = res.body.data as Record<string, unknown>;
    expect(data.imported).toBe(1);
    expect(data.dropped).toBe(3);
    expect(mockLogger.warn).toHaveBeenCalledWith(
      { droppedCount: 3, totalParsed: 4 },
      'Dropped invalid camera records during Max import',
    );
  });

  it('returns dropped: 0 when all cameras are valid', async () => {
    mockDbQuery.mockImplementation((sql: string) => {
      if (sql.includes('SELECT instance_host')) {
        return { rows: [{ instance_host: '10.0.0.1' }] };
      }
      if (sql.includes('INSERT INTO cameras')) {
        return { rows: [{ id: 'cam-1', name: 'Cam1', max_handle: 1, max_class: '' }] };
      }
      return { rows: [] };
    });

    mockExecuteMaxMcpScript.mockResolvedValue({
      result: JSON.stringify([
        { name: 'Cam1', max_handle: 1 },
      ]),
    });

    const res = await requestJson(server, 'POST', '/api/cameras/import-from-max', { scene_id: 'scene-1' });

    expect(res.status).toBe(200);
    const data = res.body.data as Record<string, unknown>;
    expect(data.imported).toBe(1);
    expect(data.dropped).toBe(0);
    expect(mockLogger.warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ droppedCount: expect.any(Number) }),
      expect.any(String),
    );
  });
});
