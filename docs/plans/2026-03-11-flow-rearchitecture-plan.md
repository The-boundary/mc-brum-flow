# Flow Re-Architecture Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the shot-centric flow model with a camera-first pipeline using group-based routing, delta settings, and auto-generated output naming.

**Architecture:** Strict left-to-right pipeline (Camera > Group > Light Setup > Tone Mapping > Layer Setup > Aspect Ratio > Stage Rev > Deadline/Local > Output). Groups are reference-based collector nodes at any stage. Each processing node stores only a delta against pre-populated studio defaults. Output filenames auto-build from group names along the path.

**Tech Stack:** React 19, Vite 6, Tailwind v4, @xyflow/react 12, Zustand 4, Express 4, PostgreSQL (brum_flow schema), Socket.IO 4

**Design doc:** `docs/plans/2026-03-11-flow-rearchitecture-design.md`

---

## Phase 1: Database Schema

### Task 1: Create migration 003 — new brum_flow tables

**Files:**
- Create: `db/migrations/003_rearchitecture.sql`

**Step 1: Write the migration**

```sql
-- 003_rearchitecture.sql
-- Re-architecture: camera-first pipeline with groups and deltas

-- Drop old tables (order matters for FK constraints)
DROP TABLE IF EXISTS shots CASCADE;
DROP TABLE IF EXISTS containers CASCADE;
DROP TABLE IF EXISTS scene_states CASCADE;

-- Recreate scenes (keep existing, add columns if needed)
-- scenes table already exists from 001/002, no changes needed

-- Recreate cameras with max_handle
DROP TABLE IF EXISTS cameras CASCADE;
CREATE TABLE cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  max_handle INTEGER NOT NULL,
  max_class TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(scene_id, max_handle)
);
CREATE INDEX idx_cameras_scene ON cameras(scene_id);

-- Studio defaults: pre-populated canonical settings
CREATE TABLE studio_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL UNIQUE,
  settings JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed studio default categories (settings will be populated from max-parameters.json)
INSERT INTO studio_defaults (category, settings) VALUES
  ('corona_renderer', '{}'),
  ('tone_mapping', '{}'),
  ('scene_output', '{}'),
  ('environment', '{}'),
  ('gamma_color', '{}'),
  ('physical_camera', '{}'),
  ('free_camera', '{}'),
  ('target_camera', '{}'),
  ('corona_camera_mod', '{}'),
  ('layers', '{}')
ON CONFLICT (category) DO NOTHING;

-- Node configs: named delta presets per node type
CREATE TABLE node_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type TEXT NOT NULL,
  label TEXT NOT NULL,
  delta JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_node_configs_type ON node_configs(node_type);

-- Recreate flow_configs with proper UUID PK
DROP TABLE IF EXISTS flow_configs CASCADE;
CREATE TABLE flow_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene_id UUID NOT NULL REFERENCES scenes(id) ON DELETE CASCADE UNIQUE,
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  viewport JSONB NOT NULL DEFAULT '{"x":0,"y":0,"zoom":1}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_flow_configs_scene ON flow_configs(scene_id);
```

**Step 2: Run migration against local DB**

```bash
PGPASSWORD='<password>' psql -h 192.168.0.74 -p 5433 -U supabase_admin -d postgres \
  -c "SET search_path TO brum_flow;" \
  -f db/migrations/003_rearchitecture.sql
```

Expected: Tables created, no errors.

**Step 3: Verify tables exist**

```bash
PGPASSWORD='<password>' psql -h 192.168.0.74 -p 5433 -U supabase_admin -d postgres \
  -c "SET search_path TO brum_flow; \dt;"
```

Expected: `scenes`, `cameras`, `studio_defaults`, `node_configs`, `flow_configs`

**Step 4: Commit**

```bash
git add db/migrations/003_rearchitecture.sql
git commit -m "db: add migration 003 for flow re-architecture"
```

---

## Phase 2: Shared Types

### Task 2: Rewrite shared types for new data model

**Files:**
- Modify: `shared/types/index.ts`

**Step 1: Replace shared types**

```typescript
// shared/types/index.ts

// ── Database row types (snake_case, matching Postgres) ──

export interface Scene {
  id: string;
  name: string;
  file_path: string;
  instance_host: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Camera {
  id: string;
  scene_id: string;
  name: string;
  max_handle: number;
  max_class: string;
  created_at: string;
  updated_at: string;
}

export interface StudioDefault {
  id: string;
  category: string;
  settings: Record<string, unknown>;
  updated_at: string;
}

export type NodeType =
  | 'camera'
  | 'group'
  | 'lightSetup'
  | 'toneMapping'
  | 'layerSetup'
  | 'aspectRatio'
  | 'stageRev'
  | 'override'
  | 'deadline'
  | 'output';

export interface NodeConfig {
  id: string;
  node_type: NodeType;
  label: string;
  delta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FlowNode {
  id: string;
  type: NodeType;
  label: string;
  position: { x: number; y: number };
  config_id?: string;      // FK to node_configs.id (null for camera/group)
  camera_id?: string;      // FK to cameras.id (only for camera nodes)
  hide_previous?: boolean;  // only for group nodes
  enabled?: boolean;        // only for output nodes (enable/disable path)
}

export interface FlowEdge {
  id: string;
  source: string;        // FlowNode.id
  target: string;        // FlowNode.id
  source_handle?: string;
  target_handle?: string;
}

export interface FlowConfig {
  id: string;
  scene_id: string;
  nodes: FlowNode[];
  edges: FlowEdge[];
  viewport: { x: number; y: number; zoom: number };
  updated_at: string;
}

// ── Pipeline order (strict, all required) ──

export const PIPELINE_ORDER: NodeType[] = [
  'camera',
  'group',
  'lightSetup',
  'toneMapping',
  'layerSetup',
  'aspectRatio',
  'stageRev',
  'deadline',
  'output',
];

// Override can appear after any processing node
export const OVERRIDE_TYPE: NodeType = 'override';

// Returns the pipeline stage index for a node type (-1 for override)
export function pipelineIndex(type: NodeType): number {
  if (type === 'override') return -1;
  return PIPELINE_ORDER.indexOf(type);
}

// Check if a connection from sourceType to targetType is valid
export function isValidConnection(sourceType: NodeType, targetType: NodeType): boolean {
  if (targetType === 'override') return true; // override can follow anything
  if (sourceType === 'override') {
    // override outputs to the next stage after whatever it overrides
    return true; // validation happens contextually
  }
  const si = pipelineIndex(sourceType);
  const ti = pipelineIndex(targetType);
  if (si < 0 || ti < 0) return false;
  // group can connect to group (same stage) or next stages
  if (sourceType === 'group' && targetType === 'group') return true;
  return ti > si;
}
```

**Step 2: Commit**

```bash
git add shared/types/index.ts
git commit -m "types: rewrite shared types for flow re-architecture"
```

---

## Phase 3: Server API

### Task 3: Rewrite server routes

**Files:**
- Modify: `server/src/routes/index.ts`

**Step 1: Replace routes with new API**

The new routes serve:
- `GET/PUT /studio-defaults` — list all / update one category
- `GET/POST/PUT/DELETE /node-configs` — preset CRUD
- `GET/POST/PUT/DELETE /cameras` — camera CRUD with max_handle
- `GET/POST /flow-config` — graph persistence (same as before but new structure)
- `GET /scenes`, `POST /scenes`, `DELETE /scenes/:id` — keep existing
- `POST /resolve-paths` — compute all output paths from graph

```typescript
// server/src/routes/index.ts
import { Router } from 'express';
import { pool } from '../services/supabase';
import { isValidConnection, PIPELINE_ORDER } from '@shared/types';

const router = Router();
const SCHEMA = 'brum_flow';

// Helper: query with schema
async function query(text: string, params?: unknown[]) {
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${SCHEMA}`);
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// ── Scenes (keep existing pattern) ──

router.get('/scenes', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM scenes ORDER BY created_at');
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/scenes', async (req, res, next) => {
  try {
    const { name, file_path = '', instance_host = '' } = req.body;
    const { rows } = await query(
      'INSERT INTO scenes (name, file_path, instance_host) VALUES ($1, $2, $3) RETURNING *',
      [name, file_path, instance_host]
    );
    req.app.get('io')?.emit('scene:created', rows[0]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/scenes/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM scenes WHERE id = $1', [req.params.id]);
    req.app.get('io')?.emit('scene:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Studio Defaults ──

router.get('/studio-defaults', async (_req, res, next) => {
  try {
    const { rows } = await query('SELECT * FROM studio_defaults ORDER BY category');
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.put('/studio-defaults/:category', async (req, res, next) => {
  try {
    const { settings } = req.body;
    const { rows } = await query(
      'UPDATE studio_defaults SET settings = $1, updated_at = NOW() WHERE category = $2 RETURNING *',
      [JSON.stringify(settings), req.params.category]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Category not found' });
    req.app.get('io')?.emit('studio-defaults:updated', rows[0]);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

// ── Node Configs (presets) ──

router.get('/node-configs', async (req, res, next) => {
  try {
    const { node_type } = req.query;
    const where = node_type ? 'WHERE node_type = $1' : '';
    const params = node_type ? [node_type] : [];
    const { rows } = await query(`SELECT * FROM node_configs ${where} ORDER BY node_type, label`, params);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/node-configs', async (req, res, next) => {
  try {
    const { node_type, label, delta = {} } = req.body;
    const { rows } = await query(
      'INSERT INTO node_configs (node_type, label, delta) VALUES ($1, $2, $3) RETURNING *',
      [node_type, label, JSON.stringify(delta)]
    );
    req.app.get('io')?.emit('node-config:created', rows[0]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.put('/node-configs/:id', async (req, res, next) => {
  try {
    const { label, delta } = req.body;
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (label !== undefined) { sets.push(`label = $${i++}`); params.push(label); }
    if (delta !== undefined) { sets.push(`delta = $${i++}`); params.push(JSON.stringify(delta)); }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const { rows } = await query(
      `UPDATE node_configs SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    req.app.get('io')?.emit('node-config:updated', rows[0]);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/node-configs/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM node_configs WHERE id = $1', [req.params.id]);
    req.app.get('io')?.emit('node-config:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Cameras ──

router.get('/cameras', async (req, res, next) => {
  try {
    const { scene_id } = req.query;
    const where = scene_id ? 'WHERE scene_id = $1' : '';
    const params = scene_id ? [scene_id] : [];
    const { rows } = await query(`SELECT * FROM cameras ${where} ORDER BY name`, params);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/cameras', async (req, res, next) => {
  try {
    const { scene_id, name, max_handle, max_class = '' } = req.body;
    const { rows } = await query(
      `INSERT INTO cameras (scene_id, name, max_handle, max_class)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scene_id, max_handle) DO UPDATE SET name = $2, max_class = $4, updated_at = NOW()
       RETURNING *`,
      [scene_id, name, max_handle, max_class]
    );
    req.app.get('io')?.emit('camera:upserted', rows[0]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/cameras/:id', async (req, res, next) => {
  try {
    await query('DELETE FROM cameras WHERE id = $1', [req.params.id]);
    req.app.get('io')?.emit('camera:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Flow Config ──

router.get('/flow-config', async (req, res, next) => {
  try {
    const { scene_id } = req.query;
    if (!scene_id) return res.status(400).json({ success: false, error: 'scene_id required' });
    const { rows } = await query('SELECT * FROM flow_configs WHERE scene_id = $1', [scene_id]);
    res.json({ success: true, data: rows[0] ?? null });
  } catch (e) { next(e); }
});

router.post('/flow-config', async (req, res, next) => {
  try {
    const { scene_id, nodes, edges, viewport } = req.body;
    const { rows } = await query(
      `INSERT INTO flow_configs (scene_id, nodes, edges, viewport)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (scene_id) DO UPDATE SET nodes = $2, edges = $3, viewport = $4, updated_at = NOW()
       RETURNING *`,
      [scene_id, JSON.stringify(nodes), JSON.stringify(edges), JSON.stringify(viewport)]
    );
    req.app.get('io')?.emit('flow-config:updated', rows[0]);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

// ── Path Resolution Engine ──

router.post('/resolve-paths', async (req, res, next) => {
  try {
    const { scene_id } = req.body;
    if (!scene_id) return res.status(400).json({ success: false, error: 'scene_id required' });

    // Fetch graph + configs
    const [flowResult, configsResult, camerasResult, defaultsResult] = await Promise.all([
      query('SELECT * FROM flow_configs WHERE scene_id = $1', [scene_id]),
      query('SELECT * FROM node_configs'),
      query('SELECT * FROM cameras WHERE scene_id = $1', [scene_id]),
      query('SELECT * FROM studio_defaults'),
    ]);

    const flow = flowResult.rows[0];
    if (!flow) return res.json({ success: true, data: { paths: [], count: 0 } });

    const nodes: Record<string, any> = {};
    for (const n of flow.nodes) nodes[n.id] = n;

    const configs: Record<string, any> = {};
    for (const c of configsResult.rows) configs[c.id] = c;

    const cameras: Record<string, any> = {};
    for (const c of camerasResult.rows) cameras[c.id] = c;

    const defaults: Record<string, any> = {};
    for (const d of defaultsResult.rows) defaults[d.category] = d.settings;

    // Build adjacency list
    const adj: Record<string, string[]> = {};
    for (const edge of flow.edges) {
      if (!adj[edge.source]) adj[edge.source] = [];
      adj[edge.source].push(edge.target);
    }

    // Find all camera nodes
    const cameraNodes = flow.nodes.filter((n: any) => n.type === 'camera');

    // DFS from each camera to find all paths to output nodes
    const paths: any[] = [];

    function dfs(nodeId: string, path: string[]) {
      const node = nodes[nodeId];
      if (!node) return;
      path.push(nodeId);

      if (node.type === 'output') {
        // Build resolved path
        const segments: string[] = [];
        let cameraName = '';
        let revLabel = '';
        const resolvedConfig = { ...defaults };

        for (const nid of path) {
          const n = nodes[nid];
          if (n.type === 'camera' && n.camera_id) {
            cameraName = cameras[n.camera_id]?.name ?? n.label;
          }
          if (n.type === 'group') {
            segments.push(n.label);
          }
          if (n.type === 'stageRev') {
            revLabel = n.label;
          }
          // Apply delta
          if (n.config_id && configs[n.config_id]) {
            Object.assign(resolvedConfig, configs[n.config_id].delta);
          }
        }

        const outputConfig = nodes[path[path.length - 1]];
        const format = outputConfig?.config_id ? (configs[outputConfig.config_id]?.delta?.format ?? 'EXR') : 'EXR';

        const filename = [...segments, cameraName, revLabel].filter(Boolean).join(' - ') + '.' + format.toLowerCase();

        paths.push({
          nodeIds: [...path],
          cameraName,
          filename,
          resolvedConfig,
          enabled: outputConfig?.enabled !== false,
        });
      }

      const neighbors = adj[nodeId] ?? [];
      for (const next of neighbors) {
        dfs(next, [...path]);
      }
    }

    for (const cam of cameraNodes) {
      dfs(cam.id, []);
    }

    res.json({ success: true, data: { paths, count: paths.length } });
  } catch (e) { next(e); }
});

// ── Health ──

router.get('/health', async (_req, res, next) => {
  try {
    await query('SELECT 1');
    res.json({ success: true, status: 'healthy' });
  } catch (e) { next(e); }
});

export default router;
```

**Step 2: Commit**

```bash
git add server/src/routes/index.ts
git commit -m "api: rewrite server routes for flow re-architecture"
```

---

## Phase 4: Client API Layer

### Task 4: Rewrite client API functions

**Files:**
- Modify: `client/src/lib/api.ts`

**Step 1: Replace API client**

```typescript
// client/src/lib/api.ts
const BASE = '/api';

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Unknown error');
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

// Path Resolution
export const resolvePaths = (sceneId: string) =>
  request<{ paths: any[]; count: number }>('/resolve-paths', { method: 'POST', body: JSON.stringify({ scene_id: sceneId }) });
```

**Step 2: Commit**

```bash
git add client/src/lib/api.ts
git commit -m "api: rewrite client API for flow re-architecture"
```

---

## Phase 5: Client Store

### Task 5: Rewrite Zustand flow store

**Files:**
- Modify: `client/src/stores/flowStore.ts`
- Modify: `client/src/stores/uiStore.ts`

**Step 1: Rewrite flowStore.ts**

The new store manages: scenes, cameras, studio defaults, node configs, flow graph (nodes/edges), selection, and resolved output paths.

Key state:
```typescript
interface FlowState {
  // Data
  scenes: Scene[];
  activeSceneId: string | null;
  cameras: Camera[];
  studioDefaults: StudioDefault[];
  nodeConfigs: NodeConfig[];
  flowNodes: FlowNode[];
  flowEdges: FlowEdge[];
  viewport: { x: number; y: number; zoom: number };

  // Selection
  selectedNodeId: string | null;

  // Output preview
  resolvedPaths: ResolvedPath[];
  pathCount: number;

  // Loading
  loading: boolean;
  error: string | null;
}
```

Key actions:
- `loadAll()` — fetch scenes, then scene-specific data + studio defaults + node configs
- `setActiveScene(id)` — switch scene, reload cameras + flow config + resolve paths
- `selectNode(id)` — select a node on the canvas
- `addNode(type, position, configId?, cameraId?)` — add node to graph
- `removeNode(id)` — remove node + connected edges
- `addEdge(source, target)` — add edge (with validation)
- `removeEdge(id)` — remove edge
- `updateNodePosition(id, pos)` — drag handler
- `updateNodeLabel(id, label)` — rename node
- `toggleHidePrevious(id)` — toggle group visibility
- `toggleOutputEnabled(nodeId)` — enable/disable output path
- `saveGraph()` — persist nodes/edges/viewport to server
- `resolvePaths()` — call server to compute all output paths
- `createNodeConfig(type, label, delta)` — create a new preset
- `updateNodeConfig(id, updates)` — update preset delta
- `initSocket()` — listen for real-time updates

**Step 2: Update uiStore.ts**

Add to existing store:
- `outputPanelOpen: boolean` — toggle output preview panel
- `presetLibraryOpen: boolean` — toggle preset library modal
- Keep existing: `viewMode`, `detailPanelOpen`, sidebar state

**Step 3: Commit**

```bash
git add client/src/stores/flowStore.ts client/src/stores/uiStore.ts
git commit -m "stores: rewrite Zustand stores for flow re-architecture"
```

---

## Phase 6: Flow Node Components

### Task 6: Create new node components

**Files:**
- Delete all existing: `client/src/components/flow/nodes/*.tsx`
- Create: `client/src/components/flow/nodes/CameraFlowNode.tsx`
- Create: `client/src/components/flow/nodes/GroupFlowNode.tsx`
- Create: `client/src/components/flow/nodes/ProcessingFlowNode.tsx` (shared for Light/ToneMap/Layer/AspectRatio/StageRev/Deadline)
- Create: `client/src/components/flow/nodes/OverrideFlowNode.tsx`
- Create: `client/src/components/flow/nodes/OutputFlowNode.tsx`
- Create: `client/src/components/flow/nodes/index.ts` (nodeTypes registry)

**Design for each node:**

**CameraFlowNode** — Green accent. Shows camera name + max_class badge. Source handle only (right side, green). Click to select. Shows warning icon if camera was deleted from Max.

**GroupFlowNode** — Orange accent. Shows label + path count badge "(5)". Target handles (left: green + orange). Source handle (right: orange). Eye icon toggle for "hide previous". Click to select.

**ProcessingFlowNode** — Color varies by type (amber/blue/cyan/teal/green/purple). Shows label + node type badge. Target handles (left: passes through green + orange). Source handles (right: passes through green + orange). Shows delta summary (e.g., "2 overrides" or key values). Click to select → detail panel shows delta editor.

**OverrideFlowNode** — Red accent, red border. Shows label + "OVERRIDE" badge. Same handle pattern as processing nodes. Warning styling to stand out.

**OutputFlowNode** — Pink/purple accent. Shows filename preview (computed from upstream groups). Target handles (left: green + orange). Enable/disable toggle. No source handles (terminal).

**Node type config:**

```typescript
// client/src/components/flow/nodes/index.ts
import type { NodeTypes } from '@xyflow/react';
import { CameraFlowNode } from './CameraFlowNode';
import { GroupFlowNode } from './GroupFlowNode';
import { ProcessingFlowNode } from './ProcessingFlowNode';
import { OverrideFlowNode } from './OverrideFlowNode';
import { OutputFlowNode } from './OutputFlowNode';

export const nodeTypes: NodeTypes = {
  camera: CameraFlowNode,
  group: GroupFlowNode,
  lightSetup: ProcessingFlowNode,
  toneMapping: ProcessingFlowNode,
  layerSetup: ProcessingFlowNode,
  aspectRatio: ProcessingFlowNode,
  stageRev: ProcessingFlowNode,
  deadline: ProcessingFlowNode,
  override: OverrideFlowNode,
  output: OutputFlowNode,
};
```

Each `ProcessingFlowNode` reads its `type` from the React Flow node data to determine color + icon:

```typescript
const NODE_STYLES: Record<string, { color: string; icon: LucideIcon; label: string }> = {
  lightSetup:  { color: 'amber',  icon: Sun,       label: 'Light Setup' },
  toneMapping: { color: 'blue',   icon: Contrast,  label: 'Tone Mapping' },
  layerSetup:  { color: 'cyan',   icon: Layers,    label: 'Layer Setup' },
  aspectRatio: { color: 'teal',   icon: RectangleHorizontal, label: 'Aspect Ratio' },
  stageRev:    { color: 'green',  icon: Gauge,     label: 'Stage Rev' },
  deadline:    { color: 'purple', icon: Server,    label: 'Deadline/Local' },
};
```

**Step 1: Implement all node components**

Build each component as a `memo()` wrapped function component. Use the existing pattern from the old nodes (Handle positioning, click → selectNode, dimmed state) but adapted for the new data model.

**Step 2: Commit**

```bash
git add client/src/components/flow/nodes/
git commit -m "ui: add new flow node components for re-architecture"
```

---

## Phase 7: Flow Canvas Rewrite

### Task 7: Rewrite NodeFlowView with new mechanics

**Files:**
- Modify: `client/src/components/flow/NodeFlowView.tsx`

**Key changes from current implementation:**

1. **Remove in-memory node generation** — nodes/edges now come from the store (which loads from flow_configs)
2. **Pipeline order enforcement** — `isValidConnection()` check in `onConnect`
3. **Wire colors** — custom edge component that renders green or orange based on source node type
4. **Auto-suggest dropdown** — on connection drop to empty canvas, show valid next node types
5. **Multi-select + bulk wire** — custom drag handler for multi-selection wiring
6. **Context menu** — updated to create any of the new node types
7. **Hide previous** — filter visible nodes based on group `hidePrevious` flags

**Custom edge component for wire colors:**

```typescript
// client/src/components/flow/ColoredEdge.tsx
// Green edge for camera paths, orange for group paths
// Reads source node type to determine color
```

**Auto-suggest on connection drop:**

Use React Flow's `onConnectEnd` callback. If the connection was dropped on empty canvas (no target), show a positioned dropdown with valid next node types based on the source node's type and pipeline order.

**Step 1: Implement the rewritten NodeFlowView**

**Step 2: Commit**

```bash
git add client/src/components/flow/NodeFlowView.tsx client/src/components/flow/ColoredEdge.tsx
git commit -m "ui: rewrite NodeFlowView with pipeline enforcement and wire colors"
```

---

## Phase 8: Detail Panel Rewrite

### Task 8: Rewrite DetailPanel with delta editor

**Files:**
- Modify: `client/src/components/detail/DetailPanel.tsx`
- Create: `client/src/components/detail/DeltaEditor.tsx`
- Create: `client/src/components/detail/PresetLibrary.tsx`
- Create: `client/src/components/detail/GroupDetail.tsx`
- Create: `client/src/components/detail/CameraDetail.tsx`
- Create: `client/src/components/detail/OutputDetail.tsx`

**DeltaEditor** — The core reusable component. Given a studio defaults category and a delta object:
- Lists all fields from studio defaults
- Unchanged fields: greyed out, showing default value
- Changed fields (in delta): highlighted, showing overridden value
- Click a field → edit it → adds to delta
- Reset button on each field → removes from delta (reverts to default)
- Field types: int (number input), float (slider + input), bool (toggle), enum (dropdown), color (color picker), string (text input)
- Uses the parameter definitions from `docs/max-parameters.json` for type/min/max/options

**PresetLibrary** — Modal/sidebar tab:
- Browse presets by node type (tabs or filter)
- Create / duplicate / rename / delete presets
- Click a preset → opens its DeltaEditor
- Shows which graph nodes reference each preset

**GroupDetail** — Shows: label editor, path count, member list (cameras/groups feeding in), hide previous toggle

**CameraDetail** — Shows: name, max_handle, max_class (read-only from Max), warning if deleted

**OutputDetail** — Shows: computed filename preview, enable/disable toggle, format selector

**Step 1: Implement all detail components**

**Step 2: Commit**

```bash
git add client/src/components/detail/
git commit -m "ui: add detail panel with delta editor and preset library"
```

---

## Phase 9: Output Preview Panel

### Task 9: Build output preview panel

**Files:**
- Create: `client/src/components/output/OutputPreviewPanel.tsx`
- Modify: `client/src/pages/BrumFlow/BrumFlowPage.tsx`

**OutputPreviewPanel** — Bottom panel (collapsible) or sidebar tab:
- Calls `resolvePaths()` from store whenever graph changes
- Table columns: Enable toggle | Filename | Camera | Groups | Rev | Status
- Header shows: "3 / 17 renders active"
- Bulk actions: Enable All, Disable All
- Filter/sort by group, camera, rev
- Each row clickable → highlights the path on the canvas (wire animation)

**BrumFlowPage updates:**
- Add Play/Render button to toolbar
- Add Output Preview toggle button to toolbar
- Wire Play button to send enabled paths to render (Deadline MongoDB or local TCP)
- Update toolbar to create new node types (current toolbar buttons are placeholders)

**Step 1: Implement OutputPreviewPanel**

**Step 2: Update BrumFlowPage toolbar**

**Step 3: Commit**

```bash
git add client/src/components/output/ client/src/pages/BrumFlow/BrumFlowPage.tsx
git commit -m "ui: add output preview panel with enable/disable and render button"
```

---

## Phase 10: Matrix/List View Update

### Task 10: Update MatrixView for new data model

**Files:**
- Modify: `client/src/components/matrix/MatrixView.tsx`

The list view should show the resolved output paths as a table — same data as the output preview panel but as the full-page view (instead of the flow canvas).

Columns: Enable | Filename | Camera | Light Setup | Tone Mapping | Layer Setup | Aspect Ratio | Stage Rev | Deadline/Local | Output Format

**Step 1: Rewrite MatrixView**

**Step 2: Commit**

```bash
git add client/src/components/matrix/MatrixView.tsx
git commit -m "ui: update MatrixView for new pipeline data model"
```

---

## Phase 11: Integration — Push to Max & Render

### Task 11: Push to Max feature

**Files:**
- Create: `server/src/services/tcp-bridge.ts` (if not exists)
- Modify: `server/src/routes/index.ts` (add `/push-to-max` endpoint)

**Endpoint:** `POST /push-to-max`
- Body: `{ scene_id, path_index }` (which resolved path to push)
- Server resolves the full config for that path
- Sends config to 3ds Max via TCP bridge
- 3ds Max applies: camera, layers, lights, tone mapping, resolution, etc.

### Task 12: Deadline submission

**Files:**
- Create: `server/src/services/deadline.ts`
- Modify: `server/src/routes/index.ts` (add `/submit-render` endpoint)

**Endpoint:** `POST /submit-render`
- Body: `{ scene_id, path_indices }` (which enabled paths to render)
- For each path:
  - If target = "deadline": inject render job into Deadline MongoDB (same pattern as existing Brum backend)
  - If target = "local": send render command via TCP bridge

**Note:** Both tasks require the TCP bridge Python script and Deadline MongoDB connection details from the existing Brum setup. Reference the existing `brum` repo for the MongoDB injection pattern.

**Step 1: Implement TCP bridge service**

**Step 2: Implement Deadline service**

**Step 3: Add server routes**

**Step 4: Commit**

```bash
git add server/src/services/ server/src/routes/index.ts
git commit -m "feat: add Push to Max and Deadline render submission"
```

---

## Phase 12: Seed Data & Testing

### Task 13: Create seed data for development

**Files:**
- Create: `db/seeds/001_dev_seed.sql`

Seed data should demonstrate the full pipeline:
- 1 scene (Apartment_LuxuryPenthouse.max)
- 8 cameras (matching current seed data names)
- Studio defaults populated with reasonable Corona defaults
- Node config presets: 2 Light Setups (DAY, NIGHT), 2 Tone Mappings (WARM, COOL), 2 Layer Setups (EXT, INT), 2 Aspect Ratios (16:9, 2:1), 3 Stage Revs (Rev A, Rev B, Rev C), 1 Deadline (London Farm), 1 Output (EXR 32-bit)
- A sample flow_config with nodes and edges demonstrating the pipeline

**Step 1: Write seed SQL**

**Step 2: Run seeds**

**Step 3: Commit**

```bash
git add db/seeds/
git commit -m "db: add development seed data for flow re-architecture"
```

---

## Task Dependency Graph

```
Task 1 (DB Migration)
  └→ Task 2 (Shared Types)
       └→ Task 3 (Server Routes)
            └→ Task 4 (Client API)
                 └→ Task 5 (Client Store)
                      ├→ Task 6 (Node Components)
                      │    └→ Task 7 (Flow Canvas)
                      │         └→ Task 9 (Output Preview)
                      ├→ Task 8 (Detail Panel)
                      └→ Task 10 (Matrix View)
Task 13 (Seed Data) — can run after Task 1

Task 11 (Push to Max) — can run after Task 3
Task 12 (Deadline) — can run after Task 3
```

**Critical path:** Tasks 1 → 2 → 3 → 4 → 5 → 6 → 7 → 9

**Parallelizable after Task 5:** Tasks 6/8/10 can be built in parallel. Tasks 11/12 can be built in parallel with frontend work.

---

## Verification Checklist

After each phase, verify with:

```bash
# Backend compiles
cd server && npx tsc --noEmit

# Frontend compiles
cd client && npx tsc --noEmit

# Dev server starts
cd client && npx vite --host --port 5174

# Lightpanda check
lightpanda fetch --dump http://192.168.0.51:5174/ 2>/dev/null
```

After full implementation:
- [ ] Pipeline enforces strict left-to-right order
- [ ] Group nodes collect cameras, show path count
- [ ] Wire colors: green for cameras, orange for groups
- [ ] Delta editor shows only changed fields
- [ ] Output preview shows computed filenames
- [ ] Enable/disable toggles work on output paths
- [ ] Auto-suggest dropdown appears on wire drop to empty canvas
- [ ] "Hide previous nodes" toggle works with reference counting
- [ ] Override nodes (red) can patch any upstream setting
- [ ] Studio defaults are pre-populated and editable
- [ ] Preset library allows create/edit/delete of node configs
- [ ] Push to Max sends resolved config via TCP
- [ ] Deadline submission injects into MongoDB
