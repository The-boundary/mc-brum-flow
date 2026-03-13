import net from 'node:net';

// ── Mocks — declared before the import that uses them ──
// vi.hoisted() ensures these are available when vi.mock factories run (they are hoisted)

const { mockEmitSocketEvent, mockDbQuery, mockConfig } = vi.hoisted(() => ({
  mockEmitSocketEvent: vi.fn(),
  mockDbQuery: vi.fn(),
  mockConfig: {
    maxTcpServerPort: 9999,
    nodeEnv: 'test',
    maxTcpAuthToken: '',
  } as Record<string, unknown>,
}));

vi.mock('./socket-events.js', () => ({
  emitSocketEvent: (...args: unknown[]) => mockEmitSocketEvent(...args),
}));

vi.mock('./supabase.js', () => ({
  dbQuery: (...args: unknown[]) => mockDbQuery(...args),
}));

vi.mock('../config.js', () => ({
  config: mockConfig,
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
// We need to access processMessage which is not exported.
// Instead we test via the public API: handleConnection receives data that calls processMessage.
// We'll drive it through the socket 'data' event handler set up by handleConnection.
// Since handleConnection is also private, we start the TCP server and connect to it,
// OR we can import the module and call startMaxTcpServer/stopMaxTcpServer.
//
// Better approach: test processMessage indirectly by importing the module and using
// the exported functions. Let's start a server and connect a mock client.

import {
  startMaxTcpServer,
  stopMaxTcpServer,
  getConnectedInstances,
  sendCommand,
  sendCommandToAny,
  invalidateEventHandlerCache,
} from './max-tcp-server.js';

// ── Helpers ──

function createTcpClient(port: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const client = new net.Socket();
    client.connect(port, '127.0.0.1', () => resolve(client));
    client.on('error', reject);
  });
}

function sendJson(client: net.Socket, data: Record<string, unknown>): Promise<void> {
  return new Promise((resolve, reject) => {
    client.write(JSON.stringify(data) + '\n', 'utf8', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

function waitMs(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Tests ──

describe('max-tcp-server', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDbQuery.mockResolvedValue({ rows: [] });
    mockConfig.maxTcpAuthToken = '';
  });

  afterEach(() => {
    stopMaxTcpServer();
  });

  describe('register message', () => {
    it('registers a new instance with provided fields', async () => {
      // We need to start the server on the TEST_PORT
      // Since config is mocked, startMaxTcpServer uses the mocked port.
      // But our static mock above uses 9999. Let's just use 9999.
      startMaxTcpServer();
      // Give the server a moment to start
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'test-inst-1',
          hostname: 'WORKSTATION-01',
          username: 'artist',
          pid: 12345,
          max_version: '2025.1',
          current_file: 'C:\\scenes\\test.max',
        });

        await waitMs(50);

        const instances = getConnectedInstances();
        expect(instances).toHaveLength(1);
        expect(instances[0].id).toBe('test-inst-1');
        expect(instances[0].hostname).toBe('WORKSTATION-01');
        expect(instances[0].username).toBe('artist');
        expect(instances[0].pid).toBe(12345);
        expect(instances[0].maxVersion).toBe('2025.1');
        expect(instances[0].currentFile).toBe('C:\\scenes\\test.max');

        // Should emit connected event and instances list
        expect(mockEmitSocketEvent).toHaveBeenCalledWith(
          'max-tcp:connected',
          expect.objectContaining({ id: 'test-inst-1', hostname: 'WORKSTATION-01' }),
        );
        expect(mockEmitSocketEvent).toHaveBeenCalledWith(
          'max-tcp:instances',
          expect.any(Array),
        );
      } finally {
        client.destroy();
      }
    });

    it('generates a fallback instance_id when not provided', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          hostname: 'WS-02',
        });

        await waitMs(50);

        const instances = getConnectedInstances();
        expect(instances).toHaveLength(1);
        expect(instances[0].id).toMatch(/^max_[0-9a-f]{12}$/);
        expect(instances[0].hostname).toBe('WS-02');
        expect(instances[0].username).toBe('unknown');
        expect(instances[0].pid).toBe(0);
      } finally {
        client.destroy();
      }
    });

    it('uses defaults for missing fields', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'minimal-inst',
        });

        await waitMs(50);

        const instances = getConnectedInstances();
        expect(instances).toHaveLength(1);
        expect(instances[0].hostname).toBe('unknown');
        expect(instances[0].username).toBe('unknown');
        expect(instances[0].pid).toBe(0);
        expect(instances[0].maxVersion).toBeUndefined();
        expect(instances[0].currentFile).toBe('');
      } finally {
        client.destroy();
      }
    });
  });

  describe('heartbeat message', () => {
    it('updates lastHeartbeat timestamp on heartbeat', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'hb-inst',
          hostname: 'WS-HB',
        });
        await waitMs(50);

        const beforeHb = getConnectedInstances()[0].lastHeartbeat;

        await waitMs(20); // ensure time passes
        await sendJson(client, { type: 'heartbeat' });
        await waitMs(50);

        const afterHb = getConnectedInstances()[0].lastHeartbeat;
        expect(new Date(afterHb).getTime()).toBeGreaterThanOrEqual(new Date(beforeHb).getTime());
      } finally {
        client.destroy();
      }
    });

    it('updates currentFile when heartbeat provides a new one', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'hb-file-inst',
          current_file: 'old.max',
        });
        await waitMs(50);

        await sendJson(client, {
          type: 'heartbeat',
          current_file: 'new.max',
        });
        await waitMs(50);

        expect(getConnectedInstances()[0].currentFile).toBe('new.max');
      } finally {
        client.destroy();
      }
    });

    it('does not update currentFile when heartbeat has same value', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'hb-same-file',
          current_file: 'scene.max',
        });
        await waitMs(50);

        await sendJson(client, {
          type: 'heartbeat',
          current_file: 'scene.max',
        });
        await waitMs(50);

        expect(getConnectedInstances()[0].currentFile).toBe('scene.max');
      } finally {
        client.destroy();
      }
    });
  });

  describe('eval_result message', () => {
    it('resolves a pending command when eval_result with success arrives', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'eval-inst',
        });
        await waitMs(50);

        // Set up a listener for the eval command sent to the client
        let receivedCommand: Record<string, unknown> | null = null;
        client.on('data', (data: Buffer) => {
          const line = data.toString().trim();
          if (line) receivedCommand = JSON.parse(line);
        });

        // Send a command and capture the promise
        const resultPromise = sendCommand('eval-inst', 'print "hello"', 5000);
        await waitMs(50);

        // The server should have sent an eval payload to our client
        expect(receivedCommand).not.toBeNull();
        expect(receivedCommand!.type).toBe('eval');
        expect(receivedCommand!.script).toBe('print "hello"');

        // Now respond with eval_result
        await sendJson(client, {
          type: 'eval_result',
          command_id: receivedCommand!.command_id,
          success: true,
          result: 'hello',
        });

        const result = await resultPromise;
        expect(result).toBe('hello');
      } finally {
        client.destroy();
      }
    });

    it('rejects a pending command when eval_result has success=false', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'eval-fail-inst',
        });
        await waitMs(50);

        let receivedCommand: Record<string, unknown> | null = null;
        client.on('data', (data: Buffer) => {
          const line = data.toString().trim();
          if (line) receivedCommand = JSON.parse(line);
        });

        const resultPromise = sendCommand('eval-fail-inst', 'bad script', 5000);
        await waitMs(50);

        await sendJson(client, {
          type: 'eval_result',
          command_id: receivedCommand!.command_id,
          success: false,
          error: 'Syntax error at line 1',
        });

        await expect(resultPromise).rejects.toThrow('Syntax error at line 1');
      } finally {
        client.destroy();
      }
    });

    it('uses fallback error message when error field is not a string', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'eval-noerr-inst',
        });
        await waitMs(50);

        let receivedCommand: Record<string, unknown> | null = null;
        client.on('data', (data: Buffer) => {
          const line = data.toString().trim();
          if (line) receivedCommand = JSON.parse(line);
        });

        const resultPromise = sendCommand('eval-noerr-inst', 'bad', 5000);
        await waitMs(50);

        await sendJson(client, {
          type: 'eval_result',
          command_id: receivedCommand!.command_id,
          success: false,
          // error field missing
        });

        await expect(resultPromise).rejects.toThrow('MaxScript evaluation failed');
      } finally {
        client.destroy();
      }
    });
  });

  describe('generic event handling (default case)', () => {
    it('emits socket event for file_opened and updates currentFile', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'event-inst',
          current_file: 'initial.max',
        });
        await waitMs(50);

        mockEmitSocketEvent.mockClear();

        await sendJson(client, {
          type: 'file_opened',
          filename: 'new_scene.max',
        });
        await waitMs(50);

        expect(getConnectedInstances()[0].currentFile).toBe('new_scene.max');

        expect(mockEmitSocketEvent).toHaveBeenCalledWith(
          'max-tcp:file_opened',
          expect.objectContaining({
            instanceId: 'event-inst',
            filename: 'new_scene.max',
          }),
        );
      } finally {
        client.destroy();
      }
    });

    it('resets currentFile on scene_reset event', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'reset-inst',
          current_file: 'some.max',
        });
        await waitMs(50);

        await sendJson(client, { type: 'scene_reset' });
        await waitMs(50);

        expect(getConnectedInstances()[0].currentFile).toBe('');
      } finally {
        client.destroy();
      }
    });

    it('does not update currentFile for file_saved event', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'save-inst',
          current_file: 'original.max',
        });
        await waitMs(50);

        await sendJson(client, {
          type: 'file_saved',
          filename: 'saved_as.max',
        });
        await waitMs(50);

        // file_saved should NOT update currentFile (only file_opened does)
        expect(getConnectedInstances()[0].currentFile).toBe('original.max');
      } finally {
        client.destroy();
      }
    });
  });

  describe('sendCommand', () => {
    it('throws when instance is not connected', async () => {
      startMaxTcpServer();
      await waitMs(50);

      await expect(sendCommand('nonexistent', 'test')).rejects.toThrow(
        'Instance nonexistent is not connected',
      );
    });

    it('times out when no response is received', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'timeout-inst',
        });
        await waitMs(50);

        // Send command with very short timeout, never respond
        await expect(sendCommand('timeout-inst', 'slow script', 100)).rejects.toThrow(
          'Command timed out after 100ms',
        );
      } finally {
        client.destroy();
      }
    });
  });

  describe('sendCommandToAny', () => {
    it('throws when no instances are connected', async () => {
      startMaxTcpServer();
      await waitMs(50);

      await expect(sendCommandToAny('test')).rejects.toThrow('No 3ds Max instance connected');
    });

    it('sends to the first connected instance', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'any-inst',
        });
        await waitMs(50);

        let receivedCommand: Record<string, unknown> | null = null;
        client.on('data', (data: Buffer) => {
          const line = data.toString().trim();
          if (line) receivedCommand = JSON.parse(line);
        });

        const resultPromise = sendCommandToAny('1+1', 5000);
        await waitMs(50);

        expect(receivedCommand).not.toBeNull();

        await sendJson(client, {
          type: 'eval_result',
          command_id: receivedCommand!.command_id,
          success: true,
          result: '2',
        });

        const result = await resultPromise;
        expect(result).toBe('2');
      } finally {
        client.destroy();
      }
    });
  });

  describe('disconnect handling', () => {
    it('removes instance and emits disconnect on socket close', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);

      await sendJson(client, {
        type: 'register',
        instance_id: 'disc-inst',
      });
      await waitMs(50);

      expect(getConnectedInstances()).toHaveLength(1);

      mockEmitSocketEvent.mockClear();
      client.destroy();
      await waitMs(100);

      expect(getConnectedInstances()).toHaveLength(0);
      expect(mockEmitSocketEvent).toHaveBeenCalledWith(
        'max-tcp:disconnected',
        { instanceId: 'disc-inst' },
      );
    });
  });

  describe('reconnection handling', () => {
    it('destroys the previous socket when re-registering with same instance_id', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client1 = await createTcpClient(9999);
      await sendJson(client1, {
        type: 'register',
        instance_id: 'reconnect-inst',
        hostname: 'WS-1',
      });
      await waitMs(50);

      expect(getConnectedInstances()).toHaveLength(1);
      expect(getConnectedInstances()[0].hostname).toBe('WS-1');

      // Track whether client1 gets destroyed
      let client1Closed = false;
      client1.on('close', () => { client1Closed = true; });

      // Second connection with same instance_id — the server will call
      // prevSocket.destroy() on client1. However, the close handler on
      // the first connection also runs and removes the instance from the map.
      // This is a known race in the current code. We verify the old socket
      // was destroyed.
      const client2 = await createTcpClient(9999);
      await sendJson(client2, {
        type: 'register',
        instance_id: 'reconnect-inst',
        hostname: 'WS-1-reconnected',
      });
      await waitMs(150);

      // The old socket should have been destroyed
      expect(client1Closed).toBe(true);

      client2.destroy();
      await waitMs(50);
    });
  });

  describe('stopMaxTcpServer', () => {
    it('clears all instances and sockets', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      await sendJson(client, {
        type: 'register',
        instance_id: 'stop-inst',
      });
      await waitMs(50);

      expect(getConnectedInstances()).toHaveLength(1);

      stopMaxTcpServer();
      await waitMs(50);

      expect(getConnectedInstances()).toHaveLength(0);
    });
  });

  describe('invalidateEventHandlerCache', () => {
    it('can be called without error', () => {
      expect(() => invalidateEventHandlerCache()).not.toThrow();
    });
  });

  describe('authentication', () => {
    it('rejects register without token when auth is configured', async () => {
      mockConfig.maxTcpAuthToken = 'secret-token-123';
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        // Collect data sent back from the server
        const received: string[] = [];
        client.on('data', (data: Buffer) => {
          received.push(data.toString());
        });

        await sendJson(client, {
          type: 'register',
          instance_id: 'unauth-inst',
          hostname: 'WS-UNAUTH',
        });
        await waitMs(100);

        // Should NOT have registered
        expect(getConnectedInstances()).toHaveLength(0);

        // Should have received an error response
        const combined = received.join('');
        const parsed = JSON.parse(combined.trim());
        expect(parsed.type).toBe('error');
        expect(parsed.message).toBe('Authentication failed');
      } finally {
        client.destroy();
      }
    });

    it('rejects register with wrong token when auth is configured', async () => {
      mockConfig.maxTcpAuthToken = 'secret-token-123';
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'wrong-token-inst',
          hostname: 'WS-WRONG',
          auth_token: 'wrong-token',
        });
        await waitMs(100);

        expect(getConnectedInstances()).toHaveLength(0);
      } finally {
        client.destroy();
      }
    });

    it('accepts register with correct token', async () => {
      mockConfig.maxTcpAuthToken = 'secret-token-123';
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'auth-inst',
          hostname: 'WS-AUTH',
          auth_token: 'secret-token-123',
        });
        await waitMs(50);

        const instances = getConnectedInstances();
        expect(instances).toHaveLength(1);
        expect(instances[0].id).toBe('auth-inst');
        expect(instances[0].hostname).toBe('WS-AUTH');
      } finally {
        client.destroy();
      }
    });

    it('accepts register without token when auth is not configured', async () => {
      mockConfig.maxTcpAuthToken = '';
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        await sendJson(client, {
          type: 'register',
          instance_id: 'noauth-inst',
          hostname: 'WS-NOAUTH',
        });
        await waitMs(50);

        const instances = getConnectedInstances();
        expect(instances).toHaveLength(1);
        expect(instances[0].id).toBe('noauth-inst');
      } finally {
        client.destroy();
      }
    });

    it('ignores heartbeat from unregistered connection', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        // Send heartbeat without registering first
        await sendJson(client, {
          type: 'heartbeat',
          current_file: 'test.max',
        });
        await waitMs(50);

        // No instances should exist
        expect(getConnectedInstances()).toHaveLength(0);
      } finally {
        client.destroy();
      }
    });
  });

  describe('invalid JSON handling', () => {
    it('does not crash on invalid JSON data', async () => {
      startMaxTcpServer();
      await waitMs(50);

      const client = await createTcpClient(9999);
      try {
        // Send garbage data
        client.write('this is not json\n');
        await waitMs(50);

        // Server should still be running and accepting connections
        const client2 = await createTcpClient(9999);
        await sendJson(client2, {
          type: 'register',
          instance_id: 'after-bad-json',
        });
        await waitMs(50);

        expect(getConnectedInstances()).toHaveLength(1);
        client2.destroy();
      } finally {
        client.destroy();
      }
    });
  });
});
