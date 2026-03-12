-- 005_event_handlers.sql
-- Configurable event handlers for 3ds Max callbacks.
-- When a callback fires in Max, the backend looks up the handler here
-- and sends the script back to Max for execution.

SET search_path TO brum_flow;

CREATE TABLE IF NOT EXISTS event_handlers (
  event_type TEXT PRIMARY KEY,
  script TEXT NOT NULL DEFAULT '',
  enabled BOOLEAN NOT NULL DEFAULT true,
  description TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed all known event types (disabled by default, no script yet)
INSERT INTO event_handlers (event_type, description) VALUES
  ('file_opened',        'After a file is opened'),
  ('file_pre_open',      'Before a file is opened'),
  ('file_pre_save',      'Before saving'),
  ('file_saved',         'After saving'),
  ('scene_reset',        'After scene reset (File > Reset)'),
  ('scene_pre_reset',    'Before scene reset'),
  ('file_merged',        'After merging another file'),
  ('render_started',     'Before render starts'),
  ('render_finished',    'After render completes'),
  ('render_frame_start', 'Before each render frame'),
  ('render_frame_end',   'After each render frame'),
  ('render_cancelled',   'Render cancelled by user'),
  ('node_created',       'Object/camera/light created'),
  ('node_deleted',       'Object deleted'),
  ('node_renamed',       'Object renamed'),
  ('selection_changed',  'Selection changed'),
  ('shutting_down',      'Before 3ds Max closes'),
  ('system_started',     'After 3ds Max starts'),
  ('time_changed',       'Timeline slider moved'),
  ('viewport_changed',   'Viewport changed'),
  ('units_changed',      'System units changed'),
  ('layer_changed',      'Layer state changed')
ON CONFLICT (event_type) DO NOTHING;
