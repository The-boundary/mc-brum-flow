import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { dbQuery } from '../services/supabase.js';

const CATEGORY_SOURCE: Record<string, string | null> = {
  corona_renderer: 'corona_renderer',
  tone_mapping: 'tone_mapping',
  scene_output: 'scene_output',
  environment: 'environment',
  gamma_color: 'color_management',
  physical_camera: 'physical_camera',
  free_camera: 'free_camera',
  target_camera: null,
  corona_camera_mod: 'corona_camera_mod',
  layers: null,
};

async function main() {
  const sourcePath = await resolveSourcePath(process.argv[2]);
  const payload = JSON.parse(await fs.readFile(sourcePath, 'utf8')) as Record<string, unknown>;

  for (const [category, sourceKey] of Object.entries(CATEGORY_SOURCE)) {
    const settings = sourceKey ? payload[sourceKey] ?? {} : {};
    await dbQuery(
      'UPDATE studio_defaults SET settings = $1, updated_at = NOW() WHERE category = $2',
      [JSON.stringify(settings), category]
    );
  }

  console.log(`Seeded studio_defaults from ${sourcePath}`);
}

async function resolveSourcePath(explicitPath?: string) {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const repoRoot = path.resolve(scriptDir, '../../..');
  const candidates = [
    explicitPath,
    path.join(repoRoot, 'docs', 'max-parameters.json'),
    '/tmp/max-parameters.json',
  ].filter((value): value is string => Boolean(value));

  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error('No max-parameters JSON found. Checked explicit path, docs/max-parameters.json, and /tmp/max-parameters.json.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
