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
    const body = await res.json().catch(() => ({}));
    throw toApiError(body, res.status, `API error: ${res.status}`);
  }
  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new Error(`API error: invalid JSON response (${res.status})`);
  }
  const data = json as Record<string, unknown>;
  if (data.success === false) throw toApiError(json, res.status, 'Unknown error');
  if (data.data === undefined) throw new Error('API error: response missing data field');
  return data.data as T;
}

// Scenes
export const fetchScenes = () => request<any[]>('/scenes');
export const createScene = (data: any) => request<any>('/scenes', { method: 'POST', body: JSON.stringify(data) });
export const deleteScene = (id: string) => request<void>(`/scenes/${id}`, { method: 'DELETE' });

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
  request<void>(`/node-configs/${id}`, { method: 'DELETE' });

// Cameras
export const fetchCameras = (sceneId?: string) =>
  request<any[]>(`/cameras${sceneId ? `?scene_id=${sceneId}` : ''}`);
export const upsertCamera = (data: any) =>
  request<any>('/cameras', { method: 'POST', body: JSON.stringify(data) });
export const deleteCamera = (id: string) =>
  request<void>(`/cameras/${id}`, { method: 'DELETE' });
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

// Push to Max
export const pushToMax = (sceneId: string, pathKey?: string, pathIndex?: number) =>
  request<any>('/push-to-max', { method: 'POST', body: JSON.stringify({ scene_id: sceneId, path_key: pathKey, path_index: pathIndex }) });

// Submit Render
export const submitRender = (sceneId: string, pathIndices: number[]) =>
  request<{ submitted: number; jobs: { jobId: string }[] }>('/submit-render', { method: 'POST', body: JSON.stringify({ scene_id: sceneId, path_indices: pathIndices }) });

// Path Resolution
export const resolvePaths = (sceneId: string) =>
  request<{ paths: any[]; count: number }>('/resolve-paths', { method: 'POST', body: JSON.stringify({ scene_id: sceneId }) });
