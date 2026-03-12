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

  return new Promise<MaxMcpResponse>((resolve, reject) => {
    const socket = net.createConnection({
      host,
      port,
    });

    let responseData = '';
    let settled = false;
    const startedAt = performance.now();

    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      socket.destroy();
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

    socket.on('connect', () => {
      socket.write(`${payload}\n`, 'utf8');
    });

    socket.on('data', (chunk) => {
      responseData += chunk.toString('utf8');
      if (!responseData.includes('\n')) {
        return;
      }

      finish(() => {
        const elapsed = Math.round(performance.now() - startedAt);
        const normalized = stripBom(responseData).trim();
        if (!normalized) {
          rejectWithLog(new Error('Empty response from 3ds Max MCP listener'));
          return;
        }

        let parsed: MaxMcpResponse;
        try {
          parsed = JSON.parse(normalized) as MaxMcpResponse;
        } catch (error) {
          rejectWithLog(new Error(`Invalid JSON from 3ds Max MCP listener: ${String(error)}`));
          return;
        }

        if (parsed.requestId && parsed.requestId !== requestId) {
          rejectWithLog(new Error(`Mismatched requestId from 3ds Max MCP listener: expected ${requestId}, got ${parsed.requestId}`));
          return;
        }

        parsed.requestId = requestId;
        parsed.meta = {
          ...(parsed.meta ?? {}),
          clientRoundTripMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
        };

        if (!parsed.success) {
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

        resolve(parsed);
      });
    });

    socket.on('timeout', () => {
      finish(() => {
        rejectWithLog(new Error(`3ds Max MCP listener timed out after ${timeoutMs}ms (${host}:${port})`));
      });
    });

    socket.on('error', (error) => {
      finish(() => {
        rejectWithLog(new Error(`3ds Max MCP connection failed: ${error.message}`));
      });
    });

    socket.on('end', () => {
      if (settled || responseData.includes('\n')) {
        return;
      }

      finish(() => {
        rejectWithLog(new Error('3ds Max MCP listener closed the connection without a response'));
      });
    });
  });
}

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
