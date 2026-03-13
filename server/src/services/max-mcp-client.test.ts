import net from 'node:net';

// ── Mocks ──

vi.mock('./socket-events.js', () => ({
  emitSocketEvent: vi.fn(),
}));

vi.mock('../config.js', () => ({
  config: {
    maxHost: '127.0.0.1',
    maxPort: 9999,
    nodeEnv: 'test',
  },
}));

// ── Import under test ──

import {
  acquireSocket,
  releaseSocket,
  drainPool,
  sendMaxMcpCommand,
  _getPoolSize,
} from './max-mcp-client.js';

// ── Mock TCP Server Helper ──

function createMockServer(): Promise<{ server: net.Server; port: number }> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let buffer = '';
      socket.setEncoding('utf8');
      socket.on('data', (chunk: string) => {
        buffer += chunk;
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx).trim();
          buffer = buffer.slice(idx + 1);
          if (!line) continue;

          let msg: Record<string, unknown>;
          try {
            msg = JSON.parse(line);
          } catch {
            continue;
          }

          const response = JSON.stringify({
            success: true,
            requestId: msg.requestId,
            result: 'ok',
            error: '',
          });
          socket.write(response + '\n');
        }
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

// ── Tests ──

describe('connection pool', () => {
  let mockServer: net.Server;
  let mockPort: number;

  beforeEach(async () => {
    const s = await createMockServer();
    mockServer = s.server;
    mockPort = s.port;
  });

  afterEach(async () => {
    drainPool();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('creates a new connection when pool is empty', async () => {
    const socket = await acquireSocket('127.0.0.1', mockPort);

    expect(socket).toBeDefined();
    expect(socket.destroyed).toBe(false);
    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(0);

    socket.destroy();
  });

  it('reuses an idle connection from the pool', async () => {
    const socket1 = await acquireSocket('127.0.0.1', mockPort);
    const localPort1 = socket1.localPort;

    // Return to pool
    releaseSocket(socket1, '127.0.0.1', mockPort);
    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(1);

    // Acquire again — should get the same socket back
    const socket2 = await acquireSocket('127.0.0.1', mockPort);
    expect(socket2.localPort).toBe(localPort1);
    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(0);

    socket2.destroy();
  });

  it('limits pool size to MAX_POOL_SIZE (3)', async () => {
    const sockets: net.Socket[] = [];
    for (let i = 0; i < 5; i++) {
      sockets.push(await acquireSocket('127.0.0.1', mockPort));
    }

    // Release all 5 — only 3 should be pooled, rest destroyed
    for (const s of sockets) {
      releaseSocket(s, '127.0.0.1', mockPort);
    }

    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(3);

    // The 4th and 5th sockets should have been destroyed
    const destroyedCount = sockets.filter((s) => s.destroyed).length;
    expect(destroyedCount).toBe(2);
  });

  it('expires idle connections after timeout', async () => {
    vi.useFakeTimers();

    const socket = await acquireSocket('127.0.0.1', mockPort);
    releaseSocket(socket, '127.0.0.1', mockPort);
    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(1);

    // Advance past idle timeout (30s)
    vi.advanceTimersByTime(31_000);

    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(0);
    expect(socket.destroyed).toBe(true);

    vi.useRealTimers();
  });

  it('removes errored connections from pool', async () => {
    const socket = await acquireSocket('127.0.0.1', mockPort);
    releaseSocket(socket, '127.0.0.1', mockPort);
    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(1);

    // Simulate an error on the pooled socket
    socket.emit('error', new Error('test error'));

    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(0);
    expect(socket.destroyed).toBe(true);
  });

  it('drainPool destroys all connections', async () => {
    const sockets: net.Socket[] = [];
    for (let i = 0; i < 3; i++) {
      sockets.push(await acquireSocket('127.0.0.1', mockPort));
    }
    for (const s of sockets) {
      releaseSocket(s, '127.0.0.1', mockPort);
    }
    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(3);

    drainPool();

    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(0);
    for (const s of sockets) {
      expect(s.destroyed).toBe(true);
    }
  });

  it('skips destroyed sockets when acquiring from pool', async () => {
    const socket1 = await acquireSocket('127.0.0.1', mockPort);
    releaseSocket(socket1, '127.0.0.1', mockPort);

    // Forcibly destroy the pooled socket to simulate a stale entry
    socket1.destroy();

    // Acquire should skip the destroyed socket and create a new one
    const socket2 = await acquireSocket('127.0.0.1', mockPort);
    expect(socket2).not.toBe(socket1);
    expect(socket2.destroyed).toBe(false);

    socket2.destroy();
  });
});

describe('sendMaxMcpCommand with pool', () => {
  let mockServer: net.Server;
  let mockPort: number;

  beforeEach(async () => {
    const s = await createMockServer();
    mockServer = s.server;
    mockPort = s.port;
  });

  afterEach(async () => {
    drainPool();
    await new Promise<void>((resolve) => mockServer.close(() => resolve()));
  });

  it('sends a command and returns a valid response', async () => {
    const response = await sendMaxMcpCommand('1+1', 'maxscript', 5_000, {
      host: '127.0.0.1',
      port: mockPort,
    });

    expect(response.success).toBe(true);
    expect(response.result).toBe('ok');
    expect(response.meta?.clientRoundTripMs).toBeDefined();
  });

  it('pools the socket after a clean response', async () => {
    await sendMaxMcpCommand('1+1', 'maxscript', 5_000, {
      host: '127.0.0.1',
      port: mockPort,
    });

    // Socket should be returned to the pool
    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(1);
  });

  it('reuses pooled socket on second command', async () => {
    await sendMaxMcpCommand('1+1', 'maxscript', 5_000, {
      host: '127.0.0.1',
      port: mockPort,
    });

    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(1);

    await sendMaxMcpCommand('2+2', 'maxscript', 5_000, {
      host: '127.0.0.1',
      port: mockPort,
    });

    // Should still have 1 pooled (reused, then returned)
    expect(_getPoolSize('127.0.0.1', mockPort)).toBe(1);
  });

  it('destroys socket with trailing bytes instead of pooling', async () => {
    // Create a server that sends trailing bytes after the response
    const trailingServer = await new Promise<{ server: net.Server; port: number }>((resolve) => {
      const server = net.createServer((socket) => {
        let buffer = '';
        socket.setEncoding('utf8');
        socket.on('data', (chunk: string) => {
          buffer += chunk;
          let idx: number;
          while ((idx = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, idx).trim();
            buffer = buffer.slice(idx + 1);
            if (!line) continue;

            let msg: Record<string, unknown>;
            try {
              msg = JSON.parse(line);
            } catch {
              continue;
            }

            const response = JSON.stringify({
              success: true,
              requestId: msg.requestId,
              result: 'ok',
              error: '',
            });
            // Send response + trailing bytes after the newline
            socket.write(response + '\ntrailing-garbage');
          }
        });
      });

      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo;
        resolve({ server, port: addr.port });
      });
    });

    try {
      const response = await sendMaxMcpCommand('test', 'maxscript', 5_000, {
        host: '127.0.0.1',
        port: trailingServer.port,
      });

      expect(response.success).toBe(true);
      // Socket should NOT be pooled because of trailing bytes
      expect(_getPoolSize('127.0.0.1', trailingServer.port)).toBe(0);
    } finally {
      await new Promise<void>((resolve) => trailingServer.server.close(() => resolve()));
    }
  });

  it('rejects and destroys socket on connection error', async () => {
    // Use a port where nothing is listening
    await expect(
      sendMaxMcpCommand('test', 'maxscript', 5_000, {
        host: '127.0.0.1',
        port: 1, // unlikely to be listening
      }),
    ).rejects.toThrow();

    expect(_getPoolSize('127.0.0.1', 1)).toBe(0);
  });

  it('rejects on timeout and destroys socket', { timeout: 10_000 }, async () => {
    // Create a server that accepts connections but never responds
    const silentServer = await new Promise<{ server: net.Server; port: number }>((resolve) => {
      const server = net.createServer((socket) => {
        // Read data to prevent backpressure, but never send a response
        socket.on('data', () => {});
      });
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as net.AddressInfo;
        resolve({ server, port: addr.port });
      });
    });

    try {
      await expect(
        sendMaxMcpCommand('test', 'maxscript', 500, {
          host: '127.0.0.1',
          port: silentServer.port,
        }),
      ).rejects.toThrow(/timed out/);

      expect(_getPoolSize('127.0.0.1', silentServer.port)).toBe(0);
    } finally {
      await new Promise<void>((resolve) => silentServer.server.close(() => resolve()));
    }
  });
});
