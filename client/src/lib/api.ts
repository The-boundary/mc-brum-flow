const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any)?.error?.message || `Request failed: ${res.status}`);
  }
  const json = await res.json();
  return (json as any).data ?? json;
}

// Scene States
export const fetchSceneStates = () => request<any[]>('/scene-states');
export const createSceneState = (data: any) => request<any>('/scene-states', { method: 'POST', body: JSON.stringify(data) });
export const updateSceneState = (id: string, data: any) => request<any>(`/scene-states/${id}`, { method: 'PUT', body: JSON.stringify(data) });

// Cameras
export const fetchCameras = () => request<any[]>('/cameras');

// Containers
export const fetchContainers = () => request<any[]>('/containers');
export const createContainer = (data: any) => request<any>('/containers', { method: 'POST', body: JSON.stringify(data) });
export const updateContainer = (id: string, data: any) => request<any>(`/containers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteContainer = (id: string) => request<void>(`/containers/${id}`, { method: 'DELETE' });

// Shots
export const fetchShots = () => request<any[]>('/shots');
export const createShot = (data: any) => request<any>('/shots', { method: 'POST', body: JSON.stringify(data) });
export const updateShot = (id: string, data: any) => request<any>(`/shots/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteShot = (id: string) => request<void>(`/shots/${id}`, { method: 'DELETE' });

// Flow Config
export const fetchFlowConfig = () => request<any>('/flow-config');
export const saveFlowConfig = (data: { nodes: any[]; edges: any[]; viewport?: any }) =>
  request<void>('/flow-config', { method: 'POST', body: JSON.stringify(data) });
