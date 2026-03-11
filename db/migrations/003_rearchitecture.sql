-- 003_rearchitecture.sql
-- Re-architecture: camera-first pipeline with groups and deltas

SET search_path TO brum_flow;

-- Drop old tables (order matters for FK constraints)
DROP TABLE IF EXISTS shots CASCADE;
DROP TABLE IF EXISTS containers CASCADE;
DROP TABLE IF EXISTS scene_states CASCADE;

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
