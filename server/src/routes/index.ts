import { Router, type Request, type Response, type NextFunction } from 'express';
import { dbQuery } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';

const router = Router();

// ── Health (no auth) ──

router.get('/health', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    await dbQuery('SELECT 1');
    res.json({ success: true, status: 'healthy' });
  } catch (e) { next(e); }
});

// All routes below require auth
router.use(requireAuth);

// ── Scenes ──

router.get('/scenes', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await dbQuery('SELECT * FROM scenes ORDER BY created_at');
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/scenes', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { name, file_path = '', instance_host = '' } = req.body;
    const { rows } = await dbQuery(
      'INSERT INTO scenes (name, file_path, instance_host) VALUES ($1, $2, $3) RETURNING *',
      [name, file_path, instance_host]
    );
    req.app.get('io')?.emit('scene:created', rows[0]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/scenes/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await dbQuery('DELETE FROM scenes WHERE id = $1', [req.params.id]);
    req.app.get('io')?.emit('scene:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Studio Defaults ──

router.get('/studio-defaults', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const { rows } = await dbQuery('SELECT * FROM studio_defaults ORDER BY category');
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.put('/studio-defaults/:category', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { settings } = req.body;
    const { rows } = await dbQuery(
      'UPDATE studio_defaults SET settings = $1, updated_at = NOW() WHERE category = $2 RETURNING *',
      [JSON.stringify(settings), req.params.category]
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Category not found' });
    req.app.get('io')?.emit('studio-defaults:updated', rows[0]);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

// ── Node Configs (presets) ──

router.get('/node-configs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { node_type } = req.query;
    const where = node_type ? 'WHERE node_type = $1' : '';
    const params = node_type ? [node_type] : [];
    const { rows } = await dbQuery(`SELECT * FROM node_configs ${where} ORDER BY node_type, label`, params);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/node-configs', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { node_type, label, delta = {} } = req.body;
    const { rows } = await dbQuery(
      'INSERT INTO node_configs (node_type, label, delta) VALUES ($1, $2, $3) RETURNING *',
      [node_type, label, JSON.stringify(delta)]
    );
    req.app.get('io')?.emit('node-config:created', rows[0]);
    res.status(201).json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.put('/node-configs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { label, delta } = req.body;
    const sets: string[] = [];
    const params: unknown[] = [];
    let i = 1;
    if (label !== undefined) { sets.push(`label = $${i++}`); params.push(label); }
    if (delta !== undefined) { sets.push(`delta = $${i++}`); params.push(JSON.stringify(delta)); }
    sets.push(`updated_at = NOW()`);
    params.push(req.params.id);
    const { rows } = await dbQuery(
      `UPDATE node_configs SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
      params
    );
    if (rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    req.app.get('io')?.emit('node-config:updated', rows[0]);
    res.json({ success: true, data: rows[0] });
  } catch (e) { next(e); }
});

router.delete('/node-configs/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await dbQuery('DELETE FROM node_configs WHERE id = $1', [req.params.id]);
    req.app.get('io')?.emit('node-config:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Cameras ──

router.get('/cameras', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scene_id } = req.query;
    const where = scene_id ? 'WHERE scene_id = $1' : '';
    const params = scene_id ? [scene_id] : [];
    const { rows } = await dbQuery(`SELECT * FROM cameras ${where} ORDER BY name`, params);
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

router.post('/cameras', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scene_id, name, max_handle, max_class = '' } = req.body;
    const { rows } = await dbQuery(
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

router.delete('/cameras/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    await dbQuery('DELETE FROM cameras WHERE id = $1', [req.params.id]);
    req.app.get('io')?.emit('camera:deleted', { id: req.params.id });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ── Flow Config ──

router.get('/flow-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scene_id } = req.query;
    if (!scene_id) return res.status(400).json({ success: false, error: 'scene_id required' });
    const { rows } = await dbQuery('SELECT * FROM flow_configs WHERE scene_id = $1', [scene_id]);
    res.json({ success: true, data: rows[0] ?? null });
  } catch (e) { next(e); }
});

router.post('/flow-config', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scene_id, nodes, edges, viewport } = req.body;
    const { rows } = await dbQuery(
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

router.post('/resolve-paths', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scene_id } = req.body;
    if (!scene_id) return res.status(400).json({ success: false, error: 'scene_id required' });

    const [flowResult, configsResult, camerasResult, defaultsResult] = await Promise.all([
      dbQuery('SELECT * FROM flow_configs WHERE scene_id = $1', [scene_id]),
      dbQuery('SELECT * FROM node_configs'),
      dbQuery('SELECT * FROM cameras WHERE scene_id = $1', [scene_id]),
      dbQuery('SELECT * FROM studio_defaults'),
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

export default router;
