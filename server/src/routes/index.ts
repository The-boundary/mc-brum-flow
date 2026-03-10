import { Router, type Request, type Response } from 'express';
import { dbQuery } from '../services/supabase.js';
import { requireAuth } from '../middleware/auth.js';
import { logger } from '../utils/logger.js';

const router = Router();

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

// ── Containers ──
router.get('/containers', async (_req: Request, res: Response) => {
  try {
    const result = await dbQuery('SELECT * FROM containers ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, 'Failed to load containers');
    res.status(500).json({ success: false, error: 'Failed to load containers' });
  }
});

// ── Shots ──
router.get('/shots', async (_req: Request, res: Response) => {
  try {
    const result = await dbQuery('SELECT * FROM shots ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, 'Failed to load shots');
    res.status(500).json({ success: false, error: 'Failed to load shots' });
  }
});

// ── Cameras ──
router.get('/cameras', async (_req: Request, res: Response) => {
  try {
    const result = await dbQuery('SELECT * FROM cameras ORDER BY name');
    res.json({ success: true, data: result.rows });
  } catch (err) {
    logger.error({ err }, 'Failed to load cameras');
    res.status(500).json({ success: false, error: 'Failed to load cameras' });
  }
});

// ── Flow Config (node positions / edges for the node flow view) ──
router.get('/flow-config', async (_req: Request, res: Response) => {
  try {
    const result = await dbQuery('SELECT nodes, edges, viewport FROM flow_configs LIMIT 1');
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
    const nodesJson = JSON.stringify(nodes || []);
    const edgesJson = JSON.stringify(edges || []);
    const viewportJson = viewport ? JSON.stringify(viewport) : null;
    await dbQuery(
      `INSERT INTO flow_configs (id, nodes, edges, viewport)
       VALUES ('default', $1::jsonb, $2::jsonb, $3::jsonb)
       ON CONFLICT (id) DO UPDATE
         SET nodes = EXCLUDED.nodes, edges = EXCLUDED.edges, viewport = EXCLUDED.viewport, updated_at = NOW()`,
      [nodesJson, edgesJson, viewportJson]
    );
    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, 'Failed to save flow config');
    res.status(500).json({ success: false, error: 'Failed to save flow config' });
  }
});

export default router;
