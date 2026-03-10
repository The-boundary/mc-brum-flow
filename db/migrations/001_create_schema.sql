-- Brum Flow schema — separate from the legacy 'brum' schema
-- Run against the Supabase Postgres instance

CREATE SCHEMA IF NOT EXISTS brum_flow;

SET search_path TO brum_flow;

-- Scene States (presets): stores everything EXCEPT camera and resolution
CREATE TABLE IF NOT EXISTS scene_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  environment TEXT NOT NULL DEFAULT '',
  lighting TEXT NOT NULL DEFAULT '',
  render_passes INTEGER NOT NULL DEFAULT 20,
  noise_threshold NUMERIC(4,3) NOT NULL DEFAULT 0.200,
  denoiser TEXT NOT NULL DEFAULT 'Intel OIDN',
  layers TEXT[] NOT NULL DEFAULT '{}',
  render_elements TEXT[] NOT NULL DEFAULT '{}',
  color TEXT NOT NULL DEFAULT 'teal',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Cameras
CREATE TABLE IF NOT EXISTS cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  fov INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Containers (map to disk folders)
CREATE TABLE IF NOT EXISTS containers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_id UUID REFERENCES containers(id) ON DELETE SET NULL,
  scene_state_id UUID NOT NULL REFERENCES scene_states(id),
  output_path_template TEXT NOT NULL DEFAULT '/renders/{container}/{shot}/',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Shots (individual render jobs)
CREATE TABLE IF NOT EXISTS shots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  container_id UUID NOT NULL REFERENCES containers(id) ON DELETE CASCADE,
  camera_id UUID NOT NULL REFERENCES cameras(id),
  resolution_width INTEGER NOT NULL DEFAULT 3840,
  resolution_height INTEGER NOT NULL DEFAULT 2160,
  scene_state_id UUID REFERENCES scene_states(id),  -- NULL = inherit from container
  overrides JSONB NOT NULL DEFAULT '{}',
  output_path TEXT NOT NULL DEFAULT '',
  output_format TEXT NOT NULL DEFAULT 'EXR',
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Flow config (node positions + edges for the node graph view)
CREATE TABLE IF NOT EXISTS flow_configs (
  id TEXT PRIMARY KEY DEFAULT 'default',
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  viewport JSONB,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_shots_container ON shots(container_id);
CREATE INDEX IF NOT EXISTS idx_containers_parent ON containers(parent_id);
CREATE INDEX IF NOT EXISTS idx_containers_state ON containers(scene_state_id);
