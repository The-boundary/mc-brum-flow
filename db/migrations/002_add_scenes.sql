-- Add scenes table (each scene = a .max file open in a 3ds Max instance)
SET search_path TO brum_flow;

CREATE TABLE IF NOT EXISTS scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,             -- e.g. 'Apartment_LuxuryPenthouse.max'
  file_path TEXT NOT NULL DEFAULT '',
  instance_host TEXT NOT NULL DEFAULT '',  -- hostname/IP of the 3ds Max workstation
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add scene_id FK to containers (shots inherit via container)
ALTER TABLE containers ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE;

-- Add scene_id FK to cameras (cameras can be per-scene)
ALTER TABLE cameras ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE;

-- Add scene_id to flow_configs so each scene has its own layout
ALTER TABLE flow_configs ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES scenes(id) ON DELETE CASCADE;

-- Insert a default scene for existing data
INSERT INTO scenes (id, name, file_path)
VALUES ('00000000-0000-0000-0000-000000000001', 'Apartment_LuxuryPenthouse.max', 'C:\Projects\Apartment_LuxuryPenthouse.max')
ON CONFLICT DO NOTHING;

-- Backfill existing data to belong to the default scene
UPDATE containers SET scene_id = '00000000-0000-0000-0000-000000000001' WHERE scene_id IS NULL;
UPDATE cameras SET scene_id = '00000000-0000-0000-0000-000000000001' WHERE scene_id IS NULL;
UPDATE flow_configs SET scene_id = '00000000-0000-0000-0000-000000000001' WHERE scene_id IS NULL;

-- Index
CREATE INDEX IF NOT EXISTS idx_containers_scene ON containers(scene_id);
CREATE INDEX IF NOT EXISTS idx_cameras_scene ON cameras(scene_id);
