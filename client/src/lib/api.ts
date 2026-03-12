const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error?.message || `API error: ${res.status}`);
  }
  const json = await res.json();
  if (json.success === false) throw new Error(json.error || 'Unknown error');
  return json.data;
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

// Flow Config
export const fetchFlowConfig = (sceneId: string) =>
  request<any | null>(`/flow-config?scene_id=${sceneId}`);
export const saveFlowConfig = (data: any) =>
  request<any>('/flow-config', { method: 'POST', body: JSON.stringify(data) });

// Max Sync
export const fetchMaxSyncState = (sceneId: string) =>
  request<any | null>(`/max-sync-state?scene_id=${sceneId}`);

// Path Resolution
export const resolvePaths = (sceneId: string) =>
  request<{ paths: any[]; count: number }>('/resolve-paths', { method: 'POST', body: JSON.stringify({ scene_id: sceneId }) });
