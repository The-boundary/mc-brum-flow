const BASE = '/api';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: Record<string, unknown>;

  constructor(message: string, options?: { status?: number; code?: string; details?: Record<string, unknown> }) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status ?? 500;
    this.code = options?.code;
    this.details = options?.details;
  }
}

function toApiError(body: unknown, status: number, fallbackMessage: string) {
  const payload = body as { error?: unknown } | null;
  const error = payload?.error;

  if (error && typeof error === 'object') {
    const details = error as Record<string, unknown>;
    return new ApiError(
      typeof details.message === 'string' ? details.message : fallbackMessage,
      {
        status,
        code: typeof details.code === 'string' ? details.code : undefined,
        details,
      },
    );
  }

  if (typeof error === 'string') {
    return new ApiError(error, { status });
  }

  return new ApiError(fallbackMessage, { status });
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const rawText = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      throw new ApiError(
        `API error: ${res.status} (response body not valid JSON)`,
        { status: res.status, details: { rawBody: rawText.slice(0, 500) } },
      );
    }
    throw toApiError(body, res.status, `API error: ${res.status}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`API error: invalid JSON response (${res.status})`);
  }
  const data = json as Record<string, unknown>;
  if (data.success !== true) throw toApiError(json, res.status, 'API error: unexpected response format');
  if (data.data === undefined) throw new Error('API error: response missing data field');
  return data.data as T;
}

async function requestVoid(url: string, options?: RequestInit): Promise<void> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const rawText = await res.text();
    let body: unknown;
    try {
      body = JSON.parse(rawText);
    } catch {
      throw new ApiError(
        `API error: ${res.status} (response body not valid JSON)`,
        { status: res.status, details: { rawBody: rawText.slice(0, 500) } },
      );
    }
    throw toApiError(body, res.status, `API error: ${res.status}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`API error: invalid JSON response (${res.status})`);
  }
  const data = json as Record<string, unknown>;
  if (data.success !== true) throw toApiError(json, res.status, 'API error: unexpected response format');
}

// Scenes
export const fetchScenes = () => request<any[]>('/scenes');
export const createScene = (data: any) => request<any>('/scenes', { method: 'POST', body: JSON.stringify(data) });
export const deleteScene = (id: string) => requestVoid(`/scenes/${id}`, { method: 'DELETE' });

// Studio Defaults
export const fetchStudioDefaults = () => request<any[]>('/studio-defaults');
export const updateStudioDefault = (category: string, settings: any) =>
  request<any>(`/studio-defaults/${category}`, { method: 'PUT', body: JSON.stringify({ settings }) });

// Node Configs
export const fetchNodeConfigs = (nodeType?: string) =>
  request<any[]>(`/node-configs${nodeType ? `?node_type=${nodeType}` : ''}`);
export const createNodeConfig = (data: any) =>
  request<any>('/node-configs', { method: 'POST', body: JSON.stringify(data) });
export const updateNodeConfig = (id: string, data: any) =>
  request<any>(`/node-configs/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteNodeConfig = (id: string) =>
  requestVoid(`/node-configs/${id}`, { method: 'DELETE' });

// Cameras
export const fetchCameras = (sceneId?: string) =>
  request<any[]>(`/cameras${sceneId ? `?scene_id=${sceneId}` : ''}`);
export const upsertCamera = (data: any) =>
  request<any>('/cameras', { method: 'POST', body: JSON.stringify(data) });
export const deleteCamera = (id: string) =>
  requestVoid(`/cameras/${id}`, { method: 'DELETE' });
export const importCamerasFromMax = (sceneId: string) =>
  request<{ imported: number; cameras: any[] }>('/cameras/import-from-max', { method: 'POST', body: JSON.stringify({ scene_id: sceneId }) });

// Flow Config
export const fetchFlowConfig = (sceneId: string) =>
  request<any | null>(`/flow-config?scene_id=${sceneId}`);
export const saveFlowConfig = (data: any) =>
  request<any>('/flow-config', { method: 'POST', body: JSON.stringify(data) });

// Max Sync
export const fetchMaxSyncState = (sceneId: string) =>
  request<any | null>(`/max-sync-state?scene_id=${sceneId}`);

export interface MaxHealthResult {
  connected: boolean;
  latencyMs?: number;
  error?: string;
  host: string;
  port: number;
}

// Max MCP Health
export const checkMaxHealth = () => request<MaxHealthResult>('/max-health');

// Max Instances
export const fetchMaxInstances = () => request<any[]>('/max-instances');
export const evalMaxScript = (instanceId: string, script: string) =>
  request<{ result: string }>(`/max-instances/${instanceId}/eval`, { method: 'POST', body: JSON.stringify({ script }) });

// Push to Max
export const pushToMax = (sceneId: string, pathKey?: string, pathIndex?: number) =>
  request<any>('/push-to-max', { method: 'POST', body: JSON.stringify({ scene_id: sceneId, path_key: pathKey, path_index: pathIndex }) });

// Submit Render
export const submitRender = (sceneId: string, pathIndices: number[]) =>
  request<{ submitted: number; jobs: { jobId: string }[] }>('/submit-render', { method: 'POST', body: JSON.stringify({ scene_id: sceneId, path_indices: pathIndices }) });

// Path Resolution
export const resolvePaths = (sceneId: string) =>
  request<{ paths: any[]; count: number }>('/resolve-paths', { method: 'POST', body: JSON.stringify({ scene_id: sceneId }) });
