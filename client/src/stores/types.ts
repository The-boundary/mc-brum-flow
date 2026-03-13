import type { Camera } from '@shared/types';

export interface ResolvedPath {
  pathKey: string;
  nodeIds: string[];
  outputNodeId: string;
  cameraName: string;
  filename: string;
  resolvedConfig: Record<string, unknown>;
  enabled: boolean;
  stageLabels: Partial<Record<'lightSetup' | 'toneMapping' | 'layerSetup' | 'aspectRatio' | 'stageRev' | 'deadline' | 'override', string>>;
  warnings?: string[];
}

export type PushToMaxResult =
  | { ok: true }
  | { ok: false; reason: 'camera-match' | 'error'; message?: string };

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  status: 'success' | 'error' | 'syncing' | 'queued';
  reason: string;
  cameraName?: string;
  pathKey?: string;
  error?: string;
  durationMs?: number;
}

export interface CameraMatchPrompt {
  nodeId: string;
  pathKey?: string;
  requestedCameraName: string;
  availableCameras: Camera[];
}

export interface MaxTcpInstance {
  id: string;
  hostname: string;
  username: string;
  pid: number;
  maxVersion?: string;
  currentFile: string;
  connectedAt: string;
  lastHeartbeat: string;
}

export interface MaxDebugLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'error' | 'warn';
  direction: 'outgoing' | 'incoming' | 'system';
  summary: string;
  detail?: string;
  durationMs?: number;
  host?: string;
  port?: number;
}
