-- 004_max_live_sync.sql
-- Persistent live-sync state between brum_flow and 3ds Max MCP listener

SET search_path TO brum_flow;

CREATE TABLE IF NOT EXISTS max_sync_state (
  scene_id UUID PRIMARY KEY REFERENCES scenes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'idle',
  active_path_key TEXT,
  active_camera_name TEXT,
  last_synced_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_request_id TEXT,
  last_reason TEXT NOT NULL DEFAULT '',
  last_error TEXT,
  last_synced_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
