-- Development seed data for flow re-architecture
-- For the full canonical studio defaults payload, run:
--   npm run seed:studio-defaults --workspace=server
-- This file keeps lightweight local defaults for quick bootstrapping.
SET search_path TO brum_flow;

-- ── Scene ──

INSERT INTO scenes (id, name, file_path, instance_host) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Apartment_LuxuryPenthouse.max', 'C:\Projects\Apartment_LuxuryPenthouse.max', '192.168.0.51')
ON CONFLICT DO NOTHING;

-- ── Cameras ──

INSERT INTO cameras (id, scene_id, name, max_handle, max_class) VALUES
  ('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'CAM_Living_01', 1001, 'Physical'),
  ('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'CAM_Living_02', 1002, 'Physical'),
  ('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'CAM_Kitchen_01', 1003, 'Physical'),
  ('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'CAM_Kitchen_02', 1004, 'Physical'),
  ('c0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'CAM_Bedroom_01', 1005, 'Physical'),
  ('c0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'CAM_Bathroom_01', 1006, 'Physical'),
  ('c0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'CAM_Terrace_01', 1007, 'Free'),
  ('c0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'CAM_Terrace_02', 1008, 'Free')
ON CONFLICT (scene_id, max_handle) DO UPDATE SET name = EXCLUDED.name, max_class = EXCLUDED.max_class;

-- ── Studio Defaults (populate with reasonable Corona defaults) ──

UPDATE studio_defaults SET settings = '{
  "renderer": "Corona",
  "passLimit": 0,
  "noiseLevel": 3,
  "denoiser": "Intel OIDN",
  "gi_engine": "UHD Cache",
  "gi_bounces": 25,
  "lightSolver": "modern"
}'::jsonb WHERE category = 'corona_renderer';

UPDATE studio_defaults SET settings = '{
  "operator": "ACES",
  "whiteBalance": 6500,
  "exposure": 0,
  "contrast": 1,
  "highlightCompression": 1,
  "saturation": 1
}'::jsonb WHERE category = 'tone_mapping';

UPDATE studio_defaults SET settings = '{
  "width": 3840,
  "height": 2160,
  "aspectRatio": "16:9",
  "outputFormat": "EXR",
  "bitDepth": 32
}'::jsonb WHERE category = 'scene_output';

UPDATE studio_defaults SET settings = '{
  "skyType": "Corona Sun + Sky",
  "skyIntensity": 1,
  "groundPlane": true,
  "iblMap": ""
}'::jsonb WHERE category = 'environment';

-- ── Node Configs (presets) ──

INSERT INTO node_configs (id, node_type, label, delta) VALUES
  -- Light Setups
  ('a0000000-0000-0000-0000-000000000001', 'lightSetup', 'DAY', '{"skyType":"Corona Sun + Sky","skyIntensity":1,"sunAngle":45}'::jsonb),
  ('a0000000-0000-0000-0000-000000000002', 'lightSetup', 'NIGHT', '{"skyType":"HDRI","skyIntensity":0.3,"iblMap":"city_night_01.hdr"}'::jsonb),

  -- Tone Mappings
  ('a0000000-0000-0000-0000-000000000003', 'toneMapping', 'WARM', '{"whiteBalance":5500,"saturation":1.1,"contrast":1.05}'::jsonb),
  ('a0000000-0000-0000-0000-000000000004', 'toneMapping', 'COOL', '{"whiteBalance":7500,"saturation":0.95,"contrast":1}'::jsonb),

  -- Layer Setups
  ('a0000000-0000-0000-0000-000000000005', 'layerSetup', 'EXT', '{"layers":["exterior_walls","windows","landscaping","sky"]}'::jsonb),
  ('a0000000-0000-0000-0000-000000000006', 'layerSetup', 'INT', '{"layers":["interior_walls","furniture","lighting_fixtures","decor"]}'::jsonb),

  -- Aspect Ratios
  ('a0000000-0000-0000-0000-000000000007', 'aspectRatio', '16:9', '{"width":3840,"height":2160}'::jsonb),
  ('a0000000-0000-0000-0000-000000000008', 'aspectRatio', '2:1', '{"width":4096,"height":2048}'::jsonb),

  -- Stage Revs
  ('a0000000-0000-0000-0000-000000000009', 'stageRev', 'Rev A', '{}'::jsonb),
  ('a0000000-0000-0000-0000-000000000010', 'stageRev', 'Rev B', '{}'::jsonb),
  ('a0000000-0000-0000-0000-000000000011', 'stageRev', 'Rev C', '{}'::jsonb),

  -- Deadline
  ('a0000000-0000-0000-0000-000000000012', 'deadline', 'London Farm', '{"pool":"london","priority":50}'::jsonb),

  -- Output
  ('a0000000-0000-0000-0000-000000000013', 'output', 'EXR 32-bit', '{"format":"EXR","bitDepth":32}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── Flow Config (sample pipeline) ──

INSERT INTO flow_configs (scene_id, nodes, edges, viewport) VALUES (
  '00000000-0000-0000-0000-000000000001',
  -- Nodes: 2 cameras → 1 group → light → tone → layer → aspect → stageRev → deadline → output
  '[
    {"id":"n1","type":"camera","label":"CAM_Living_01","position":{"x":0,"y":0},"camera_id":"c0000000-0000-0000-0000-000000000001"},
    {"id":"n2","type":"camera","label":"CAM_Living_02","position":{"x":0,"y":120},"camera_id":"c0000000-0000-0000-0000-000000000002"},
    {"id":"n3","type":"group","label":"Living Room","position":{"x":250,"y":60},"hide_previous":false},
    {"id":"n4","type":"lightSetup","label":"DAY","position":{"x":450,"y":60},"config_id":"a0000000-0000-0000-0000-000000000001"},
    {"id":"n5","type":"toneMapping","label":"WARM","position":{"x":650,"y":60},"config_id":"a0000000-0000-0000-0000-000000000003"},
    {"id":"n6","type":"layerSetup","label":"INT","position":{"x":850,"y":60},"config_id":"a0000000-0000-0000-0000-000000000006"},
    {"id":"n7","type":"aspectRatio","label":"16:9","position":{"x":1050,"y":60},"config_id":"a0000000-0000-0000-0000-000000000007"},
    {"id":"n8","type":"stageRev","label":"Rev A","position":{"x":1250,"y":60},"config_id":"a0000000-0000-0000-0000-000000000009"},
    {"id":"n9","type":"deadline","label":"London Farm","position":{"x":1450,"y":60},"config_id":"a0000000-0000-0000-0000-000000000012"},
    {"id":"n10","type":"output","label":"Output","position":{"x":1650,"y":60},"config_id":"a0000000-0000-0000-0000-000000000013","enabled":true}
  ]'::jsonb,
  -- Edges: linear pipeline
  '[
    {"id":"e1","source":"n1","target":"n3"},
    {"id":"e2","source":"n2","target":"n3"},
    {"id":"e3","source":"n3","target":"n4"},
    {"id":"e4","source":"n4","target":"n5"},
    {"id":"e5","source":"n5","target":"n6"},
    {"id":"e6","source":"n6","target":"n7"},
    {"id":"e7","source":"n7","target":"n8"},
    {"id":"e8","source":"n8","target":"n9"},
    {"id":"e9","source":"n9","target":"n10"}
  ]'::jsonb,
  '{"x":0,"y":0,"zoom":0.8}'::jsonb
)
ON CONFLICT (scene_id) DO UPDATE SET nodes = EXCLUDED.nodes, edges = EXCLUDED.edges, viewport = EXCLUDED.viewport;
