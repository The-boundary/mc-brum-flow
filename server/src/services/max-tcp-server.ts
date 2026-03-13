import net from 'node:net';
import { randomUUID } from 'node:crypto';

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { emitSocketEvent } from './socket-events.js';
import { dbQuery } from './supabase.js';

// ── Types ──

export interface MaxInstance {
  id: string;
  hostname: string;
  username: string;
  pid: number;
  maxVersion?: string;
  currentFile: string;
  connectedAt: string;
  lastHeartbeat: string;
}

interface InboundMessage {
  type: string;
  [key: string]: unknown;
}

interface PendingCommand {
  resolve: (result: string) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface EventHandler {
  event_type: string;
  script: string;
  enabled: boolean;
}

// ── State ──

const instances = new Map<string, MaxInstance>();
const sockets = new Map<string, net.Socket>();
const pendingCommands = new Map<string, PendingCommand>();
let eventHandlerCache = new Map<string, EventHandler>();
let eventHandlerCacheAge = 0;
const EVENT_HANDLER_CACHE_TTL_MS = 30_000;

const HEARTBEAT_TIMEOUT_MS = 90_000;
const HEALTH_CHECK_INTERVAL_MS = 30_000;

let tcpServer: net.Server | null = null;
let healthCheckTimer: ReturnType<typeof setInterval> | null = null;

// ── Public API ──

export function startMaxTcpServer() {
  const port = config.maxTcpServerPort;

  tcpServer = net.createServer((socket) => handleConnection(socket));

  tcpServer.on('error', (err) => {
    logger.error({ err }, 'Max TCP server error');
  });

  tcpServer.listen(port, '0.0.0.0', () => {
    logger.info(`Max TCP server listening on port ${port}`);
    emitMaxLog('info', `TCP server listening on port ${port}`);
  });

  healthCheckTimer = setInterval(runHealthCheck, HEALTH_CHECK_INTERVAL_MS);
}

export function stopMaxTcpServer() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
  for (const socket of sockets.values()) {
    socket.destroy();
  }
  instances.clear();
  sockets.clear();
  tcpServer?.close();
  tcpServer = null;
}

export function getConnectedInstances(): MaxInstance[] {
  return Array.from(instances.values());
}

/**
 * Send a MaxScript command to a connected instance and wait for the result.
 * Returns the evaluated result string.
 */
export async function sendCommand(
  instanceId: string,
  script: string,
  timeoutMs = 30_000,
): Promise<string> {
  const socket = sockets.get(instanceId);
  if (!socket || socket.destroyed) {
    throw new Error(`Instance ${instanceId} is not connected`);
  }

  const commandId = randomUUID().replace(/-/g, '');

  return new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => {
      pendingCommands.delete(commandId);
      reject(new Error(`Command timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    pendingCommands.set(commandId, { resolve, reject, timer });

    const payload = JSON.stringify({ type: 'eval', command_id: commandId, script }) + '\n';
    socket.write(payload, 'utf8');
  });
}

/**
 * Send a MaxScript command to the first connected instance (convenience).
 */
export async function sendCommandToAny(script: string, timeoutMs = 30_000): Promise<string> {
  const firstId = instances.keys().next().value as string | undefined;
  if (!firstId) {
    throw new Error('No 3ds Max instance connected');
  }
  return sendCommand(firstId, script, timeoutMs);
}

// ── Connection Handling ──

function handleConnection(socket: net.Socket) {
  const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
  let instanceId: string | null = null;
  let buffer = '';

  logger.info(`Max TCP: new connection from ${remoteAddr}`);

  socket.setEncoding('utf8');
  socket.setTimeout(HEARTBEAT_TIMEOUT_MS);

  socket.on('data', (chunk: string) => {
    buffer += chunk;
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      if (!line) continue;

      let msg: InboundMessage;
      try {
        msg = JSON.parse(line);
      } catch {
        logger.warn({ raw: line.slice(0, 200) }, 'Max TCP: invalid JSON from client');
        continue;
      }

      instanceId = processMessage(msg, socket, instanceId);
    }
  });

  socket.on('timeout', () => {
    logger.warn(`Max TCP: timeout for ${instanceId ?? remoteAddr}`);
    socket.destroy();
  });

  socket.on('error', (err) => {
    logger.warn({ err }, `Max TCP: socket error for ${instanceId ?? remoteAddr}`);
  });

  socket.on('close', () => {
    if (instanceId) {
      logger.info(`Max TCP: instance ${instanceId} disconnected`);
      instances.delete(instanceId);
      sockets.delete(instanceId);
      emitSocketEvent('max-tcp:disconnected', { instanceId });
      emitMaxLog('warn', `Instance disconnected: ${instanceId}`);
      broadcastInstanceList();
    }
  });
}

function processMessage(
  msg: InboundMessage,
  socket: net.Socket,
  currentInstanceId: string | null,
): string | null {
  let instanceId = currentInstanceId;

  switch (msg.type) {
    case 'register': {
      const authToken = config.maxTcpAuthToken;
      if (authToken && msg.auth_token !== authToken) {
        const errorPayload = JSON.stringify({ type: 'error', message: 'Authentication failed' }) + '\n';
        socket.end(errorPayload, 'utf8');
        logger.warn({ remoteAddr: `${socket.remoteAddress}:${socket.remotePort}` }, 'Max TCP: rejected unauthenticated register');
        return null;
      }

      if (typeof msg.instance_id === 'string') {
        instanceId = msg.instance_id;
      } else {
        instanceId = `max_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
        logger.warn({ instanceId }, 'Max TCP: register message missing instance_id, generated fallback');
      }

      // Clean up previous socket for this instance if reconnecting
      const prevSocket = sockets.get(instanceId);
      if (prevSocket && prevSocket !== socket) {
        prevSocket.destroy();
      }

      const instance: MaxInstance = {
        id: instanceId,
        hostname: typeof msg.hostname === 'string' ? msg.hostname : 'unknown',
        username: typeof msg.username === 'string' ? msg.username : 'unknown',
        pid: typeof msg.pid === 'number' ? msg.pid : 0,
        maxVersion: typeof msg.max_version === 'string' ? msg.max_version : undefined,
        currentFile: typeof msg.current_file === 'string' ? msg.current_file : '',
        connectedAt: new Date().toISOString(),
        lastHeartbeat: new Date().toISOString(),
      };

      if (typeof msg.pid !== 'number') {
        logger.debug({ instanceId }, 'Max TCP: register message missing PID');
      }

      instances.set(instanceId, instance);
      sockets.set(instanceId, socket);

      logger.info({ instanceId, hostname: instance.hostname, file: instance.currentFile }, 'Max TCP: instance registered');
      emitSocketEvent('max-tcp:connected', instance);
      emitMaxLog('info', `Instance registered: ${instance.hostname} (${instance.username})`, `File: ${instance.currentFile}\nPID: ${instance.pid}\nMax: ${instance.maxVersion ?? 'unknown'}`);
      broadcastInstanceList();
      break;
    }

    case 'heartbeat': {
      if (!currentInstanceId) {
        logger.warn({ remoteAddr: `${socket.remoteAddress}:${socket.remotePort}` }, 'Max TCP: heartbeat from unregistered connection, ignoring');
        return null;
      }
      if (instanceId) {
        const instance = instances.get(instanceId);
        if (instance) {
          instance.lastHeartbeat = new Date().toISOString();
          if (typeof msg.current_file === 'string' && msg.current_file !== instance.currentFile) {
            instance.currentFile = msg.current_file;
          }
        }
      }
      break;
    }

    case 'eval_result': {
      if (!currentInstanceId) {
        logger.warn({ remoteAddr: `${socket.remoteAddress}:${socket.remotePort}` }, 'Max TCP: eval_result from unregistered connection, ignoring');
        return null;
      }
      const commandId = typeof msg.command_id === 'string' ? msg.command_id : '';
      const pending = pendingCommands.get(commandId);
      if (pending) {
        pendingCommands.delete(commandId);
        clearTimeout(pending.timer);

        if (msg.success === false) {
          pending.reject(new Error(typeof msg.error === 'string' ? msg.error : 'MaxScript evaluation failed'));
        } else {
          const resultValue = typeof msg.result === 'string' ? msg.result : '';
          if (typeof msg.result !== 'string') {
            logger.debug({ commandId }, 'Max TCP: eval_result has non-string result, defaulting to empty');
          }
          pending.resolve(resultValue);
        }
      }
      break;
    }

    default: {
      // Generic event handler: forward to frontend, look up DB handler
      if (instanceId && msg.type) {
        const eventType = msg.type as string;

        // Update instance state for file-related events
        if (eventType === 'file_opened' || eventType === 'file_saved' || eventType === 'file_merged') {
          const filename = typeof msg.filename === 'string' ? msg.filename : '';
          const instance = instances.get(instanceId);
          if (instance && eventType === 'file_opened') {
            instance.currentFile = filename;
          }
        }
        if (eventType === 'scene_reset') {
          const instance = instances.get(instanceId);
          if (instance) instance.currentFile = '';
        }

        // Broadcast event to frontend
        const { type: _type, ...eventData } = msg;
        emitSocketEvent(`max-tcp:${eventType}`, { instanceId, ...eventData });
        emitMaxLog('info', `${eventType}`, typeof msg.filename === 'string' ? msg.filename : instanceId);

        // Look up and dispatch event handler from DB
        void dispatchEventHandler(instanceId, eventType);
      }
    }
  }

  return instanceId;
}

// ── Health Check ──

function runHealthCheck() {
  const now = Date.now();
  for (const [id, instance] of instances) {
    const lastSeen = new Date(instance.lastHeartbeat).getTime();
    if (now - lastSeen > HEARTBEAT_TIMEOUT_MS) {
      logger.warn(`Max TCP: instance ${id} timed out (no heartbeat)`);
      const socket = sockets.get(id);
      socket?.destroy();
      instances.delete(id);
      sockets.delete(id);
      emitSocketEvent('max-tcp:disconnected', { instanceId: id });
      broadcastInstanceList();
    }
  }
}

function broadcastInstanceList() {
  emitSocketEvent('max-tcp:instances', getConnectedInstances());
}

function emitMaxLog(level: 'info' | 'warn' | 'error', summary: string, detail?: string) {
  emitSocketEvent('max:log', {
    id: `mlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    level,
    direction: 'incoming' as const,
    summary: `[TCP] ${summary}`,
    detail,
  });
}

// ── Event Handler Dispatch ──

async function refreshEventHandlerCache() {
  const now = Date.now();
  if (now - eventHandlerCacheAge < EVENT_HANDLER_CACHE_TTL_MS && eventHandlerCache.size > 0) {
    return;
  }

  try {
    const { rows } = await dbQuery<EventHandler>('SELECT event_type, script, enabled FROM event_handlers');
    const cache = new Map<string, EventHandler>();
    for (const row of rows) {
      cache.set(row.event_type, row);
    }
    eventHandlerCache = cache;
    eventHandlerCacheAge = now;
  } catch (err) {
    logger.warn({ err }, 'Max TCP: failed to refresh event handler cache');
  }
}

async function dispatchEventHandler(instanceId: string, eventType: string) {
  await refreshEventHandlerCache();

  const handler = eventHandlerCache.get(eventType);
  if (!handler?.enabled || !handler.script.trim()) {
    return; // No handler configured or disabled
  }

  try {
    const result = await sendCommand(instanceId, handler.script, 30_000);
    emitMaxLog('info', `handler:${eventType} executed`, result.slice(0, 500) || undefined);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    emitMaxLog('error', `handler:${eventType} failed`, message);
  }
}

/**
 * Invalidate the event handler cache. Call this when handlers are updated via API.
 */
export function invalidateEventHandlerCache() {
  eventHandlerCacheAge = 0;
}
