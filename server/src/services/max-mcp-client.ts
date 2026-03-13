import net from 'node:net';
import { randomUUID } from 'node:crypto';

import { config } from '../config.js';
import { emitSocketEvent } from './socket-events.js';

export type MaxMcpCommandType = 'maxscript' | 'ping' | 'python';

export interface MaxMcpResponse {
  success: boolean;
  requestId: string;
  result: string;
  error: string;
  meta?: Record<string, unknown>;
}

interface MaxMcpConnectionOptions {
  host?: string;
  port?: number;
}

// ── Connection Pool ──

const MAX_POOL_SIZE = 3;
const IDLE_TIMEOUT_MS = 30_000;

interface PoolEntry {
  socket: net.Socket;
  idleTimer: ReturnType<typeof setTimeout>;
}

/** Pool keyed by "host:port" → array of idle entries */
const pool = new Map<string, PoolEntry[]>();

function poolKey(host: string, port: number): string {
  return `${host}:${port}`;
}

/**
 * Acquire a connected socket — returns one from the pool if available,
 * otherwise creates and connects a fresh one.
 */
export function acquireSocket(host: string, port: number): Promise<net.Socket> {
  const key = poolKey(host, port);
  const entries = pool.get(key);

  // Try to reuse an idle socket
  while (entries && entries.length > 0) {
    const entry = entries.pop()!;
    clearTimeout(entry.idleTimer);

    if (!entry.socket.destroyed && entry.socket.writable) {
      return Promise.resolve(entry.socket);
    }
    // Socket became unusable while idle — discard it
    entry.socket.destroy();
  }

  // Create a fresh connection
  return new Promise<net.Socket>((resolve, reject) => {
    const socket = net.createConnection({ host, port });

    const onError = (err: Error) => {
      socket.removeListener('connect', onConnect);
      reject(err);
    };

    const onConnect = () => {
      socket.removeListener('error', onError);
      resolve(socket);
    };

    socket.once('connect', onConnect);
    socket.once('error', onError);
  });
}

/**
 * Return a socket to the pool for reuse.
 * If the pool for that key is full, the socket is destroyed instead.
 */
export function releaseSocket(socket: net.Socket, host: string, port: number): void {
  if (socket.destroyed || !socket.writable) {
    socket.destroy();
    return;
  }

  const key = poolKey(host, port);
  let entries = pool.get(key);
  if (!entries) {
    entries = [];
    pool.set(key, entries);
  }

  if (entries.length >= MAX_POOL_SIZE) {
    socket.destroy();
    return;
  }

  // Remove all per-request listeners so they don't fire on pooled sockets
  socket.removeAllListeners('data');
  socket.removeAllListeners('timeout');
  socket.removeAllListeners('end');

  // Set up idle expiry and error cleanup
  const idleTimer = setTimeout(() => {
    removeFromPool(key, socket);
    socket.destroy();
  }, IDLE_TIMEOUT_MS);

  // If the socket errors while idle, remove it from the pool
  socket.once('error', () => {
    removeFromPool(key, socket);
    socket.destroy();
  });

  entries.push({ socket, idleTimer });
}

function removeFromPool(key: string, socket: net.Socket): void {
  const entries = pool.get(key);
  if (!entries) return;

  const idx = entries.findIndex((e) => e.socket === socket);
  if (idx !== -1) {
    clearTimeout(entries[idx].idleTimer);
    entries.splice(idx, 1);
  }
  if (entries.length === 0) {
    pool.delete(key);
  }
}

/**
 * Destroy all pooled connections. Call on process shutdown.
 */
export function drainPool(): void {
  for (const [, entries] of pool) {
    for (const entry of entries) {
      clearTimeout(entry.idleTimer);
      entry.socket.destroy();
    }
  }
  pool.clear();
}

/** Expose pool size for testing. */
export function _getPoolSize(host: string, port: number): number {
  const entries = pool.get(poolKey(host, port));
  return entries ? entries.length : 0;
}

// ── Logging ──

function emitMaxLog(entry: {
  level: 'info' | 'error' | 'warn';
  direction: 'outgoing' | 'incoming' | 'system';
  summary: string;
  detail?: string;
  durationMs?: number;
  host?: string;
  port?: number;
}) {
  emitSocketEvent('max:log', {
    id: `mlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
  });
}

// ── Core Command ──

export async function sendMaxMcpCommand(
  command: string,
  type: MaxMcpCommandType = 'maxscript',
  timeoutMs = 120_000,
  options: MaxMcpConnectionOptions = {},
): Promise<MaxMcpResponse> {
  const requestId = randomUUID().replace(/-/g, '');
  const host = options.host || config.maxHost;
  const port = options.port || config.maxPort;
  const payload = JSON.stringify({
    command,
    type,
    requestId,
    protocolVersion: 2,
  });

  emitMaxLog({
    level: 'info',
    direction: 'outgoing',
    summary: `${type} → ${host}:${port}`,
    detail: command || undefined,
    host,
    port,
  });

  const socket = await acquireSocket(host, port);
  const startedAt = performance.now();

  return new Promise<MaxMcpResponse>((resolve, reject) => {
    let responseData = '';
    let settled = false;

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      // Remove per-request listeners before releasing or destroying
      socket.removeAllListeners('data');
      socket.removeAllListeners('timeout');
      socket.removeAllListeners('end');
      socket.removeAllListeners('error');
      fn();
    };

    const rejectWithLog = (error: Error) => {
      const elapsed = Math.round(performance.now() - startedAt);
      emitMaxLog({
        level: 'error',
        direction: 'incoming',
        summary: `${type} ✗ ${error.message.slice(0, 120)}`,
        detail: error.message,
        durationMs: elapsed,
        host,
        port,
      });
      reject(error);
    };

    socket.setTimeout(timeoutMs);

    socket.on('data', (chunk) => {
      responseData += chunk.toString('utf8');
      if (!responseData.includes('\n')) {
        return;
      }

      finish(() => {
        const elapsed = Math.round(performance.now() - startedAt);

        // Split at first newline — anything after is trailing bytes
        const newlineIdx = responseData.indexOf('\n');
        const firstLine = responseData.slice(0, newlineIdx);
        const hasTrailingBytes = responseData.length > newlineIdx + 1;

        const normalized = stripBom(firstLine).trim();
        if (!normalized) {
          socket.destroy();
          rejectWithLog(new Error('Empty response from 3ds Max MCP listener'));
          return;
        }

        let parsed: MaxMcpResponse;
        try {
          parsed = JSON.parse(normalized) as MaxMcpResponse;
        } catch (error) {
          socket.destroy();
          rejectWithLog(new Error(`Invalid JSON from 3ds Max MCP listener: ${String(error)}`));
          return;
        }

        if (parsed.requestId && parsed.requestId !== requestId) {
          socket.destroy();
          rejectWithLog(new Error(`Mismatched requestId from 3ds Max MCP listener: expected ${requestId}, got ${parsed.requestId}`));
          return;
        }

        parsed.requestId = requestId;
        parsed.meta = {
          ...(parsed.meta ?? {}),
          clientRoundTripMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
        };

        if (!parsed.success) {
          socket.destroy();
          rejectWithLog(new Error(parsed.error || 'Unknown 3ds Max MCP listener error'));
          return;
        }

        emitMaxLog({
          level: 'info',
          direction: 'incoming',
          summary: `${type} ✓ ${elapsed}ms`,
          detail: parsed.result || undefined,
          durationMs: elapsed,
          host,
          port,
        });

        // Only pool sockets with a clean read — no trailing bytes
        if (hasTrailingBytes) {
          socket.destroy();
        } else {
          releaseSocket(socket, host, port);
        }

        resolve(parsed);
      });
    });

    socket.on('timeout', () => {
      finish(() => {
        socket.destroy();
        rejectWithLog(new Error(`3ds Max MCP listener timed out after ${timeoutMs}ms (${host}:${port})`));
      });
    });

    socket.on('error', (error) => {
      finish(() => {
        socket.destroy();
        rejectWithLog(new Error(`3ds Max MCP connection failed: ${error.message}`));
      });
    });

    socket.on('end', () => {
      if (settled || responseData.includes('\n')) {
        return;
      }

      finish(() => {
        socket.destroy();
        rejectWithLog(new Error('3ds Max MCP listener closed the connection without a response'));
      });
    });

    // Socket is already connected — write immediately
    socket.write(`${payload}\n`, 'utf8');
  });
}

// ── Convenience Wrappers ──

export async function executeMaxMcpScript(command: string, timeoutMs?: number, options?: MaxMcpConnectionOptions) {
  return sendMaxMcpCommand(command, 'maxscript', timeoutMs, options);
}

export async function pingMaxMcp(timeoutMs = 5_000, options?: MaxMcpConnectionOptions) {
  return sendMaxMcpCommand('', 'ping', timeoutMs, options);
}

export async function probeMaxMcp(timeoutMs = 5_000, options?: MaxMcpConnectionOptions) {
  try {
    return await pingMaxMcp(timeoutMs, options);
  } catch {
    return executeMaxMcpScript('1+1', timeoutMs, options);
  }
}

function stripBom(input: string) {
  return input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
}
