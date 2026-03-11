import { Router, type Request, type Response, type NextFunction } from 'express';
import { dbQuery } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { pushConfigToMax } from '../services/tcp-bridge.js';
import { submitDeadlineJob } from '../services/deadline.js';
import { resolveFlowPaths } from '../services/flowResolver.js';

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

    const configs: Record<string, any> = {};
    for (const c of configsResult.rows) configs[c.id] = c;

    const cameras: Record<string, any> = {};
    for (const c of camerasResult.rows) cameras[c.id] = c;

    const defaults: Record<string, any> = {};
    for (const d of defaultsResult.rows) defaults[d.category] = d.settings;

    const paths = resolveFlowPaths({ flow, configs, cameras, defaults });

    res.json({ success: true, data: { paths, count: paths.length } });
  } catch (e) { next(e); }
});

// ── Push to Max ──

router.post('/push-to-max', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scene_id, path_index } = req.body;
    if (!scene_id || path_index === undefined) {
      return res.status(400).json({ success: false, error: 'scene_id and path_index required' });
    }

    // Resolve paths server-side
    const [flowResult, configsResult, camerasResult, defaultsResult, sceneResult] = await Promise.all([
      dbQuery('SELECT * FROM flow_configs WHERE scene_id = $1', [scene_id]),
      dbQuery('SELECT * FROM node_configs'),
      dbQuery('SELECT * FROM cameras WHERE scene_id = $1', [scene_id]),
      dbQuery('SELECT * FROM studio_defaults'),
      dbQuery('SELECT * FROM scenes WHERE id = $1', [scene_id]),
    ]);

    const flow = flowResult.rows[0];
    if (!flow) return res.status(404).json({ success: false, error: 'No flow config found' });

    const configs: Record<string, any> = {};
    for (const c of configsResult.rows) configs[c.id] = c;
    const cameras: Record<string, any> = {};
    for (const c of camerasResult.rows) cameras[c.id] = c;
    const defaults: Record<string, any> = {};
    for (const d of defaultsResult.rows) defaults[d.category] = d.settings;

    const paths = resolveFlowPaths({ flow, configs, cameras, defaults });

    if (path_index >= paths.length) {
      return res.status(400).json({ success: false, error: `Path index ${path_index} out of range (${paths.length} paths)` });
    }

    const targetPath = paths[path_index];
    if (!targetPath.enabled) {
      return res.status(400).json({ success: false, error: 'Selected path is disabled' });
    }
    const result = await pushConfigToMax({
      cameraName: targetPath.cameraName,
      resolvedConfig: targetPath.resolvedConfig,
    });

    res.json({ success: true, data: { message: result } });
  } catch (e) { next(e); }
});

// ── Submit Render ──

router.post('/submit-render', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { scene_id, path_indices } = req.body;
    if (!scene_id || !Array.isArray(path_indices)) {
      return res.status(400).json({ success: false, error: 'scene_id and path_indices[] required' });
    }

    // Resolve paths
    const [flowResult, configsResult, camerasResult, defaultsResult, sceneResult] = await Promise.all([
      dbQuery('SELECT * FROM flow_configs WHERE scene_id = $1', [scene_id]),
      dbQuery('SELECT * FROM node_configs'),
      dbQuery('SELECT * FROM cameras WHERE scene_id = $1', [scene_id]),
      dbQuery('SELECT * FROM studio_defaults'),
      dbQuery('SELECT * FROM scenes WHERE id = $1', [scene_id]),
    ]);

    const flow = flowResult.rows[0];
    const scene = sceneResult.rows[0];
    if (!flow || !scene) return res.status(404).json({ success: false, error: 'Scene or flow not found' });

    const configs: Record<string, any> = {};
    for (const c of configsResult.rows) configs[c.id] = c;
    const cameras: Record<string, any> = {};
    for (const c of camerasResult.rows) cameras[c.id] = c;
    const defaults: Record<string, any> = {};
    for (const d of defaultsResult.rows) defaults[d.category] = d.settings;

    const paths = resolveFlowPaths({ flow, configs, cameras, defaults });

    const jobIds: { jobId: string }[] = [];
    for (const idx of path_indices) {
      if (idx >= paths.length) continue;
      const p = paths[idx];
      if (!p.enabled) continue;
      const result = await submitDeadlineJob({
        jobName: p.filename.replace(/\.[^.]+$/, ''),
        scenePath: scene.file_path,
        cameraName: p.cameraName,
        outputPath: `/renders/${scene.name}/${p.filename}`,
        outputFormat: (p.resolvedConfig.format as string) ?? 'EXR',
        resolvedConfig: p.resolvedConfig,
      });
      jobIds.push(result);
    }

    res.json({ success: true, data: { submitted: jobIds.length, jobs: jobIds } });
  } catch (e) { next(e); }
});

export default router;
