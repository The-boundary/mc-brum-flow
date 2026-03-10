import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';

import { logger } from '../utils/logger.js';

// ============================================================
// Supabase REST client (tower_watch schema — for TowerWatch auth checks)
// ============================================================

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;

const supabase: SupabaseClient<any, any, any> | null =
  supabaseUrl && supabaseKey
    ? createClient(supabaseUrl, supabaseKey, { db: { schema: 'tower_watch' } })
    : null;

if (!supabaseUrl || !supabaseKey) {
  logger.warn('SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set - Supabase API client disabled');
}

export function getAuthSupabaseClient(): SupabaseClient<any, any, any> | null {
  return supabase;
}

// ============================================================
// Direct Postgres pool (brum_flow schema)
// ============================================================

const SCHEMA = 'brum_flow';

const databaseUrl = process.env.DATABASE_URL || process.env.SUPABASE_DATABASE_URL;

const pool = databaseUrl
  ? new pg.Pool({ connectionString: databaseUrl, max: 10 })
  : null;

if (!pool) {
  logger.warn('DATABASE_URL not set - brum_flow direct DB access disabled');
}

/** Run a query against the brum_flow schema. Automatically sets search_path. */
export async function dbQuery<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<pg.QueryResult<T>> {
  if (!pool) throw new Error('Database not configured (DATABASE_URL missing)');
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${SCHEMA}`);
    return await client.query<T>(text, params);
  } finally {
    client.release();
  }
}

/** Run multiple queries in a transaction against brum_flow schema. */
export async function dbTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  if (!pool) throw new Error('Database not configured (DATABASE_URL missing)');
  const client = await pool.connect();
  try {
    await client.query(`SET search_path TO ${SCHEMA}`);
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
