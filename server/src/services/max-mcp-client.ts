import net from 'node:net';
import { randomUUID } from 'node:crypto';

import { config } from '../config.js';

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
        const normalized = stripBom(responseData).trim();
        if (!normalized) {
          reject(new Error('Empty response from 3ds Max MCP listener'));
          return;
        }

        let parsed: MaxMcpResponse;
        try {
          parsed = JSON.parse(normalized) as MaxMcpResponse;
        } catch (error) {
          reject(new Error(`Invalid JSON from 3ds Max MCP listener: ${String(error)}`));
          return;
        }

        if (parsed.requestId && parsed.requestId !== requestId) {
          reject(new Error(`Mismatched requestId from 3ds Max MCP listener: expected ${requestId}, got ${parsed.requestId}`));
          return;
        }

        parsed.requestId = requestId;
        parsed.meta = {
          ...(parsed.meta ?? {}),
          clientRoundTripMs: Math.round((performance.now() - startedAt) * 1000) / 1000,
        };

        if (!parsed.success) {
          reject(new Error(parsed.error || 'Unknown 3ds Max MCP listener error'));
          return;
        }

        resolve(parsed);
      });
    });

    socket.on('timeout', () => {
      finish(() => {
        reject(new Error(`3ds Max MCP listener timed out after ${timeoutMs}ms (${host}:${port})`));
      });
    });

    socket.on('error', (error) => {
      finish(() => {
        reject(new Error(`3ds Max MCP connection failed: ${error.message}`));
      });
    });

    socket.on('end', () => {
      if (settled || responseData.includes('\n')) {
        return;
      }

      finish(() => {
        reject(new Error('3ds Max MCP listener closed the connection without a response'));
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
