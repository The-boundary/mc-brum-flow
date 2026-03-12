import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import pg from 'pg';
import { config } from '../config.js';

// ============================================================
// Supabase REST client (tower_watch schema — for TowerWatch auth checks)
// ============================================================

const supabase: SupabaseClient<any, any, any> = createClient(
  config.supabaseUrl,
  config.supabaseServiceRoleKey,
  { db: { schema: 'tower_watch' } },
);

export function getAuthSupabaseClient(): SupabaseClient<any, any, any> {
  return supabase;
}

// ============================================================
// Direct Postgres pool (brum_flow schema)
// ============================================================

const SCHEMA = 'brum_flow';

const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });

/** Run a query against the brum_flow schema. Automatically sets search_path. */
export async function dbQuery<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[],
): Promise<pg.QueryResult<T>> {
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
