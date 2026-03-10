import { Router, type Request, type Response } from 'express';
import { dbQuery } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';
import type { Server as SocketServer } from 'socket.io';

const router = Router();

function getIO(req: Request): SocketServer {
  return req.app.get('io') as SocketServer;
}

router.get('/health', async (_req, res) => {
  let database: 'not_configured' | 'ok' | 'error' = 'not_configured';
  try {
    await dbQuery('SELECT 1');
    database = 'ok';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    database = msg.includes('not configured') ? 'not_configured' : 'error';
  }
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime(), database });
});

// All routes below require auth
router.use(requireAuth);

// ── Scenes (3ds Max instances) ──

router.get('/scenes', async (_req: Request, res: Response) => {
  try {
    const result = await dbQuery('SELECT * FROM scenes ORDER BY created_at');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, 'Failed to load scenes');
    res.status(500).json({ success: false, error: 'Failed to load scenes' });
  }
});

router.post('/scenes', async (req: Request, res: Response) => {
  const { name, file_path, instance_host } = req.body;
  try {
    const result = await dbQuery(
      `INSERT INTO scenes (name, file_path, instance_host) VALUES ($1,$2,$3) RETURNING *`,
      [name, file_path || '', instance_host || '']
    );
    getIO(req).emit('scene:created', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error({ err }, 'Failed to create scene');
    res.status(500).json({ success: false, error: 'Failed to create scene' });
  }
});

router.delete('/scenes/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await dbQuery('DELETE FROM scenes WHERE id=$1', [id]);
    getIO(req).emit('scene:deleted', { id });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete scene');
    res.status(500).json({ success: false, error: 'Failed to delete scene' });
  }
});

// ── Scene States ──

router.get('/scene-states', async (_req: Request, res: Response) => {
  try {
    const result = await dbQuery('SELECT * FROM scene_states ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, 'Failed to load scene states');
    res.status(500).json({ success: false, error: 'Failed to load scene states' });
  }
});

router.post('/scene-states', async (req: Request, res: Response) => {
  const { name, environment, lighting, render_passes, noise_threshold, denoiser, layers, render_elements, color } = req.body;
  try {
    const result = await dbQuery(
      `INSERT INTO scene_states (name, environment, lighting, render_passes, noise_threshold, denoiser, layers, render_elements, color)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [name, environment || '', lighting || '', render_passes || 20, noise_threshold || 0.2, denoiser || 'Intel OIDN', layers || '{}', render_elements || '{}', color || 'teal']
    );
    const row = result.rows[0];
    getIO(req).emit('scene-state:created', row);
    res.json({ success: true, data: row });
  } catch (err) {
    logger.error({ err }, 'Failed to create scene state');
    res.status(500).json({ success: false, error: 'Failed to create scene state' });
  }
});

router.put('/scene-states/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, environment, lighting, render_passes, noise_threshold, denoiser, layers, render_elements, color } = req.body;
  try {
    const result = await dbQuery(
      `UPDATE scene_states SET name=$1, environment=$2, lighting=$3, render_passes=$4, noise_threshold=$5, denoiser=$6, layers=$7, render_elements=$8, color=$9, updated_at=NOW()
       WHERE id=$10 RETURNING *`,
      [name, environment, lighting, render_passes, noise_threshold, denoiser, layers, render_elements, color, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    getIO(req).emit('scene-state:updated', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error({ err }, 'Failed to update scene state');
    res.status(500).json({ success: false, error: 'Failed to update scene state' });
  }
});

// ── Cameras ──

router.get('/cameras', async (req: Request, res: Response) => {
  const sceneId = req.query.scene_id as string | undefined;
  try {
    const result = sceneId
      ? await dbQuery('SELECT * FROM cameras WHERE scene_id=$1 ORDER BY name', [sceneId])
      : await dbQuery('SELECT * FROM cameras ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, 'Failed to load cameras');
    res.status(500).json({ success: false, error: 'Failed to load cameras' });
  }
});

// ── Containers ──

router.get('/containers', async (req: Request, res: Response) => {
  const sceneId = req.query.scene_id as string | undefined;
  try {
    const result = sceneId
      ? await dbQuery('SELECT * FROM containers WHERE scene_id=$1 ORDER BY sort_order, name', [sceneId])
      : await dbQuery('SELECT * FROM containers ORDER BY sort_order, name');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, 'Failed to load containers');
    res.status(500).json({ success: false, error: 'Failed to load containers' });
  }
});

router.post('/containers', async (req: Request, res: Response) => {
  const { name, parent_id, scene_state_id, output_path_template, sort_order } = req.body;
  try {
    const result = await dbQuery(
      `INSERT INTO containers (name, parent_id, scene_state_id, output_path_template, sort_order)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [name, parent_id || null, scene_state_id, output_path_template || '/renders/{container}/{shot}/', sort_order || 0]
    );
    getIO(req).emit('container:created', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error({ err }, 'Failed to create container');
    res.status(500).json({ success: false, error: 'Failed to create container' });
  }
});

router.put('/containers/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, parent_id, scene_state_id, output_path_template, sort_order } = req.body;
  try {
    const result = await dbQuery(
      `UPDATE containers SET name=$1, parent_id=$2, scene_state_id=$3, output_path_template=$4, sort_order=$5, updated_at=NOW()
       WHERE id=$6 RETURNING *`,
      [name, parent_id, scene_state_id, output_path_template, sort_order, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    getIO(req).emit('container:updated', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error({ err }, 'Failed to update container');
    res.status(500).json({ success: false, error: 'Failed to update container' });
  }
});

router.delete('/containers/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await dbQuery('DELETE FROM containers WHERE id=$1', [id]);
    getIO(req).emit('container:deleted', { id });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete container');
    res.status(500).json({ success: false, error: 'Failed to delete container' });
  }
});

// ── Shots ──

router.get('/shots', async (req: Request, res: Response) => {
  const sceneId = req.query.scene_id as string | undefined;
  try {
    const result = sceneId
      ? await dbQuery(
          `SELECT s.* FROM shots s JOIN containers c ON s.container_id = c.id WHERE c.scene_id=$1 ORDER BY s.sort_order, s.name`,
          [sceneId]
        )
      : await dbQuery('SELECT * FROM shots ORDER BY sort_order, name');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, 'Failed to load shots');
    res.status(500).json({ success: false, error: 'Failed to load shots' });
  }
});

router.post('/shots', async (req: Request, res: Response) => {
  const { name, container_id, camera_id, resolution_width, resolution_height, scene_state_id, overrides, output_path, output_format, enabled, sort_order } = req.body;
  try {
    const result = await dbQuery(
      `INSERT INTO shots (name, container_id, camera_id, resolution_width, resolution_height, scene_state_id, overrides, output_path, output_format, enabled, sort_order)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11) RETURNING *`,
      [name, container_id, camera_id, resolution_width || 3840, resolution_height || 2160, scene_state_id || null, JSON.stringify(overrides || {}), output_path || '', output_format || 'EXR', enabled !== false, sort_order || 0]
    );
    getIO(req).emit('shot:created', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error({ err }, 'Failed to create shot');
    res.status(500).json({ success: false, error: 'Failed to create shot' });
  }
});

router.put('/shots/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const { name, container_id, camera_id, resolution_width, resolution_height, scene_state_id, overrides, output_path, output_format, enabled, sort_order } = req.body;
  try {
    const result = await dbQuery(
      `UPDATE shots SET name=$1, container_id=$2, camera_id=$3, resolution_width=$4, resolution_height=$5, scene_state_id=$6, overrides=$7::jsonb, output_path=$8, output_format=$9, enabled=$10, sort_order=$11, updated_at=NOW()
       WHERE id=$12 RETURNING *`,
      [name, container_id, camera_id, resolution_width, resolution_height, scene_state_id, JSON.stringify(overrides || {}), output_path, output_format, enabled, sort_order, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ success: false, error: 'Not found' });
    getIO(req).emit('shot:updated', result.rows[0]);
    res.json({ success: true, data: result.rows[0] });
  } catch (err) {
    logger.error({ err }, 'Failed to update shot');
    res.status(500).json({ success: false, error: 'Failed to update shot' });
  }
});

router.delete('/shots/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    await dbQuery('DELETE FROM shots WHERE id=$1', [id]);
    getIO(req).emit('shot:deleted', { id });
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to delete shot');
    res.status(500).json({ success: false, error: 'Failed to delete shot' });
  }
});

// ── Flow Config ──

router.get('/flow-config', async (req: Request, res: Response) => {
  const sceneId = req.query.scene_id as string | undefined;
  try {
    const result = sceneId
      ? await dbQuery('SELECT nodes, edges, viewport FROM flow_configs WHERE scene_id=$1 LIMIT 1', [sceneId])
      : await dbQuery('SELECT nodes, edges, viewport FROM flow_configs LIMIT 1');
    const row = result.rows[0] || { nodes: [], edges: [], viewport: null };
    res.json({ success: true, data: row });
  } catch (err) {
    logger.error({ err }, 'Failed to load flow config');
    res.status(500).json({ success: false, error: 'Failed to load flow config' });
  }
});

router.post('/flow-config', async (req: Request, res: Response) => {
  const { nodes, edges, viewport } = req.body || {};
  try {
    await dbQuery(
      `INSERT INTO flow_configs (id, nodes, edges, viewport)
       VALUES ('default', $1::jsonb, $2::jsonb, $3::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET nodes = EXCLUDED.nodes, edges = EXCLUDED.edges, viewport = EXCLUDED.viewport, updated_at = NOW()`,
      [JSON.stringify(nodes || []), JSON.stringify(edges || []), viewport ? JSON.stringify(viewport) : null]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to save flow config');
    res.status(500).json({ success: false, error: 'Failed to save flow config' });
  }
});

export default router;
