import fallbackStudioDefaults from '../data/max-parameters.json' assert { type: 'json' };

import type { MaxSyncState } from '../../../shared/types/index.js';

import { config } from '../config.js';
import { logger } from '../utils/logger.js';
import { resolveFlowPaths, type ResolvedFlowPath } from './flowResolver.js';
import { executeMaxMcpScript } from './max-mcp-client.js';
import { emitSocketEvent } from './socket-events.js';
import { dbQuery } from './supabase.js';

function emitMaxLog(entry: {
  level: 'info' | 'error' | 'warn';
  summary: string;
  detail?: string;
}) {
  emitSocketEvent('max:log', {
    id: `mlog_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    direction: 'system' as const,
    ...entry,
  });
}

interface QueueSceneSyncInput {
  sceneId: string;
  reason: string;
  preferredPathKey?: string | null;
  preferredPathIndex?: number;
  force?: boolean;
}

interface SyncSceneNowInput extends QueueSceneSyncInput {}

interface SceneSyncContext {
  scene: Record<string, unknown> | null;
  flow: { nodes: unknown[]; edges: unknown[] } | null;
  configs: Record<string, any>;
  cameras: Record<string, any>;
  defaults: Record<string, any>;
  syncState: MaxSyncState | null;
}

interface ParameterDefinition {
  type?: string;
  options?: unknown[];
}

interface AssignmentInstruction {
  category: string;
  key: string;
  target: 'renderer' | 'tone_mapping' | 'scene_output' | 'environment' | 'gamma_color' | 'camera' | 'camera_modifier' | 'layers';
  propertyName?: string;
  operatorClass?: string;
  valueExpr?: string;
}

export interface MaxSceneCameraInfo {
  name: string;
  max_handle: number;
  max_class?: string;
}

export class MaxCameraNotFoundError extends Error {
  code = 'max_camera_not_found';
  requestedCameraName: string;
  availableCameras: MaxSceneCameraInfo[];

  constructor(requestedCameraName: string, availableCameras: MaxSceneCameraInfo[]) {
    super(`Camera not found in 3ds Max: ${requestedCameraName}`);
    this.name = 'MaxCameraNotFoundError';
    this.requestedCameraName = requestedCameraName;
    this.availableCameras = availableCameras;
  }
}

const FALLBACK_GROUPS = fallbackStudioDefaults as Record<string, any>;
const GROUP_ALIASES: Record<string, string> = {
  color_management: 'gamma_color',
};
const MAX_SYNC_SELECT_ALL_SCENES_SQL = 'SELECT scene_id FROM flow_configs';
const IGNORED_CONFIG_KEYS = new Set([
  'format',
  'bitDepth',
  'target',
  'repo',
  'pool',
  'priority',
]);

interface PendingSceneSync extends QueueSceneSyncInput {
  timer?: ReturnType<typeof setTimeout>;
}

const pendingSceneSyncs = new Map<string, PendingSceneSync>();
const sceneSyncLocks = new Map<string, Promise<void>>();

export function buildImportCamerasScript() {
  return `(
fn bfEscJson s = (
  local out = ""
  for i = 1 to s.count do (
    local c = s[i]
    case c of (
      "\\\\": out += "\\\\\\\\"
      "\\"": out += "\\\\\\""
      "\\n": out += "\\\\n"
      "\\r": out += "\\\\r"
      "\\t": out += "\\\\t"
      default: out += c
    )
  )
  out
)
local cameraJson = #()
for cam in cameras where (superClassOf cam == camera) do (
  local camName = try (cam.name as string) catch ""
  local camClass = try ((classOf cam) as string) catch ""
  local camHandle = try ((getHandleByAnim cam) as integer) catch 0
  append cameraJson ("{\\\"name\\\":\\\"" + bfEscJson camName + "\\\",\\\"max_handle\\\":" + (camHandle as string) + ",\\\"max_class\\\":\\\"" + bfEscJson camClass + "\\\"}")
)
local joined = ""
for i = 1 to cameraJson.count do (
  if i > 1 do joined += ","
  joined += cameraJson[i]
)
"[" + joined + "]"
)`;
}

function getMissingCameraName(message: string): string | null {
  const match = message.match(/Camera not found:\s*(.+)$/i);
  return match?.[1]?.trim() ?? null;
}

async function getSceneCamerasFromMax(host?: string) {
  const response = await executeMaxMcpScript(buildImportCamerasScript(), 30_000, { host });
  let parsed: MaxSceneCameraInfo[];
  try {
    parsed = JSON.parse(response.result || '[]');
  } catch {
    logger.error({ raw: response.result?.slice(0, 500) }, 'Failed to parse camera JSON from 3ds Max');
    return [];
  }
  return Array.isArray(parsed) ? parsed.filter((camera) => typeof camera?.name === 'string') : [];
}

export async function getMaxSyncState(sceneId: string): Promise<MaxSyncState | null> {
  const { rows } = await dbQuery<MaxSyncState>('SELECT * FROM max_sync_state WHERE scene_id = $1', [sceneId]);
  return rows[0] ?? null;
}

export async function queueSceneSync(input: QueueSceneSyncInput) {
  const pending = pendingSceneSyncs.get(input.sceneId);
  if (pending?.timer) {
    clearTimeout(pending.timer);
  }

  const merged: PendingSceneSync = {
    ...pending,
    ...input,
    preferredPathKey: input.preferredPathKey ?? pending?.preferredPathKey ?? null,
    force: input.force ?? pending?.force ?? false,
  };

  const queuedState = await upsertMaxSyncState(input.sceneId, {
    status: 'queued',
    last_reason: input.reason,
    ...(merged.preferredPathKey ? { active_path_key: merged.preferredPathKey } : {}),
  });
  emitSyncState(queuedState);

  merged.timer = setTimeout(() => {
    const snapshot = pendingSceneSyncs.get(input.sceneId);
    pendingSceneSyncs.delete(input.sceneId);
    if (!snapshot) {
      return;
    }

    const previous = sceneSyncLocks.get(input.sceneId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        try {
          await syncSceneToMaxNow(snapshot);
        } catch (error) {
          logger.error({ err: error, sceneId: input.sceneId }, 'Queued Max sync failed');
        }
      })
      .finally(() => {
        if (sceneSyncLocks.get(input.sceneId) === next) {
          sceneSyncLocks.delete(input.sceneId);
        }
      });

    sceneSyncLocks.set(input.sceneId, next);
  }, config.maxSyncDebounceMs);

  pendingSceneSyncs.set(input.sceneId, merged);
}

export async function queueAllScenesSync(reason: string) {
  const { rows } = await dbQuery<{ scene_id: string }>(MAX_SYNC_SELECT_ALL_SCENES_SQL);
  await Promise.all(rows.map((row) => queueSceneSync({ sceneId: row.scene_id, reason })));
}

export async function queueScenesUsingNodeConfig(configId: string, reason: string) {
  const { rows } = await dbQuery<{ scene_id: string; nodes: unknown[] }>('SELECT scene_id, nodes FROM flow_configs');
  const sceneIds = rows
    .filter((row) => Array.isArray(row.nodes) && row.nodes.some((node) => isRecord(node) && node.config_id === configId))
    .map((row) => row.scene_id);

  await Promise.all(sceneIds.map((sceneId) => queueSceneSync({ sceneId, reason })));
}

export async function syncSceneToMaxNow(input: SyncSceneNowInput): Promise<MaxSyncState | null> {
  emitMaxLog({ level: 'info', summary: `sync:start — ${input.reason}`, detail: `scene=${input.sceneId} force=${!!input.force} pathKey=${input.preferredPathKey ?? '(auto)'}` });
  const context = await loadSceneSyncContext(input.sceneId);
  if (!context.scene) {
    emitMaxLog({ level: 'error', summary: `sync:abort — scene not found`, detail: input.sceneId });
    throw new Error(`Scene ${input.sceneId} not found`);
  }

  const syncingState = await upsertMaxSyncState(input.sceneId, {
    status: 'syncing',
    last_reason: input.reason,
    ...(input.preferredPathKey ? { active_path_key: input.preferredPathKey } : {}),
  });
  emitSyncState(syncingState);

  const flow = context.flow;
  if (!flow) {
    const idleState = await upsertMaxSyncState(input.sceneId, {
      status: 'idle',
      active_path_key: null,
      active_camera_name: null,
      last_error: null,
      last_reason: input.reason,
    });
    emitSyncState(idleState);
    return idleState;
  }

  const paths = resolveFlowPaths({
    flow,
    configs: context.configs,
    cameras: context.cameras,
    defaults: context.defaults,
  });

  const target = resolveTargetPath(paths, context.syncState, input);
  if (!target) {
    const idleState = await upsertMaxSyncState(input.sceneId, {
      status: 'idle',
      active_path_key: null,
      active_camera_name: null,
      last_error: null,
      last_reason: input.reason,
    });
    emitSyncState(idleState);
    return idleState;
  }

  if (target.path.warnings.length > 0) {
    for (const warning of target.path.warnings) {
      emitMaxLog({ level: 'warn', summary: 'sync:path-warning', detail: warning });
    }
  }

  if (!target.path.enabled && input.force) {
    throw new Error(`Cannot sync disabled path ${target.path.pathKey}`);
  }

  const previousConfig = isRecord(context.syncState?.last_synced_config)
    ? (context.syncState?.last_synced_config as Record<string, unknown>)
    : {};
  const changedConfig = diffConfig(previousConfig, target.path.resolvedConfig);
  const sameCamera = context.syncState?.active_camera_name === target.path.cameraName;
  const needsApply = input.force || !sameCamera || Object.keys(changedConfig).length > 0;

  if (!needsApply) {
    emitMaxLog({ level: 'info', summary: `sync:skip — no changes`, detail: `camera=${target.path.cameraName} pathKey=${target.path.pathKey}` });
    const successState = await upsertMaxSyncState(input.sceneId, {
      status: 'success',
      active_path_key: target.path.pathKey,
      active_camera_name: target.path.cameraName,
      last_reason: input.reason,
      last_error: null,
    });
    emitSyncState(successState);
    return successState;
  }

  emitMaxLog({
    level: 'info',
    summary: `sync:apply — ${target.path.cameraName} (${Object.keys(changedConfig).length} props)`,
    detail: `pathKey=${target.path.pathKey}\nchangedKeys: ${Object.keys(changedConfig).join(', ') || '(full config)'}`,
  });

  const maxscript = buildApplyResolvedConfigScript({
    cameraName: target.path.cameraName,
    resolvedConfig: needsApply && Object.keys(changedConfig).length > 0 ? changedConfig : target.path.resolvedConfig,
    defaults: context.defaults,
  });

  try {
    const maxHost = typeof context.scene.instance_host === 'string' && context.scene.instance_host.trim().length > 0
      ? context.scene.instance_host.trim()
      : undefined;
    const response = await executeMaxMcpScript(maxscript, 30_000, { host: maxHost });
    emitMaxLog({ level: 'info', summary: `sync:success — ${target.path.cameraName}`, detail: response.result?.slice(0, 500) || undefined });
    const successState = await upsertMaxSyncState(input.sceneId, {
      status: 'success',
      active_path_key: target.path.pathKey,
      active_camera_name: target.path.cameraName,
      last_synced_config: target.path.resolvedConfig,
      last_request_id: response.requestId,
      last_reason: input.reason,
      last_error: null,
      last_synced_at: new Date().toISOString(),
    });
    emitSyncState(successState);
    return successState;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown Max sync error';
    emitMaxLog({ level: 'error', summary: `sync:error — ${message.slice(0, 100)}`, detail: message });
    const missingCameraName = getMissingCameraName(message);
    const failureState = await upsertMaxSyncState(input.sceneId, {
      status: 'error',
      active_path_key: target.path.pathKey,
      active_camera_name: target.path.cameraName,
      last_reason: input.reason,
      last_error: message,
    });
    emitSyncState(failureState);
    if (missingCameraName) {
      const maxHost = typeof context.scene.instance_host === 'string' && context.scene.instance_host.trim().length > 0
        ? context.scene.instance_host.trim()
        : undefined;
      const availableCameras = await getSceneCamerasFromMax(maxHost).catch(() => []);
      throw new MaxCameraNotFoundError(missingCameraName, availableCameras);
    }
    throw error;
  }
}

export function resolveTargetPath(
  paths: ResolvedFlowPath[],
  syncState: MaxSyncState | null,
  input: SyncSceneNowInput,
) {
  let path: ResolvedFlowPath | undefined;
  let resolvedVia = 'none';

  if (input.preferredPathKey) {
    path = paths.find((candidate) => candidate.pathKey === input.preferredPathKey);
    if (path) resolvedVia = 'preferredPathKey';
  }

  if (!path && input.preferredPathIndex !== undefined) {
    path = paths[input.preferredPathIndex];
    if (path) resolvedVia = 'preferredPathIndex';
  }

  if (!path && syncState?.active_path_key) {
    path = paths.find((candidate) => candidate.pathKey === syncState.active_path_key);
    if (path) resolvedVia = 'syncState.active_path_key';
  }

  if (!path) {
    path = paths.find((candidate) => candidate.enabled);
    if (path) resolvedVia = 'firstEnabled';
  }

  if (!path) {
    logger.debug({ pathCount: paths.length }, 'resolveTargetPath: no viable path found');
    return null;
  }

  if (!path.enabled && !input.force) {
    const original = path;
    path = paths.find((candidate) => candidate.enabled);
    if (path) {
      logger.info(
        { originalPathKey: original.pathKey, substitutedPathKey: path.pathKey },
        'resolveTargetPath: disabled path substituted with enabled alternative'
      );
      emitMaxLog({
        level: 'warn',
        summary: `sync:path-substituted — requested path is disabled`,
        detail: `Original: ${original.pathKey}\nSubstituted: ${path.pathKey}`,
      });
      resolvedVia = `substituted(was:${resolvedVia})`;
    }
  }

  logger.debug({ resolvedVia, pathKey: path?.pathKey }, 'resolveTargetPath: resolved');
  return path ? { path } : null;
}

async function loadSceneSyncContext(sceneId: string): Promise<SceneSyncContext> {
  const [sceneResult, flowResult, configsResult, camerasResult, defaultsResult, syncStateResult] = await Promise.all([
    dbQuery('SELECT * FROM scenes WHERE id = $1', [sceneId]),
    dbQuery('SELECT * FROM flow_configs WHERE scene_id = $1', [sceneId]),
    dbQuery('SELECT * FROM node_configs'),
    dbQuery('SELECT * FROM cameras WHERE scene_id = $1', [sceneId]),
    dbQuery('SELECT * FROM studio_defaults'),
    dbQuery<MaxSyncState>('SELECT * FROM max_sync_state WHERE scene_id = $1', [sceneId]),
  ]);

  const configs: Record<string, any> = {};
  for (const row of configsResult.rows) {
    configs[row.id] = row;
  }

  const cameras: Record<string, any> = {};
  for (const row of camerasResult.rows) {
    cameras[row.id] = row;
  }

  const defaults: Record<string, any> = {};
  for (const row of defaultsResult.rows) {
    defaults[row.category] = row.settings;
  }

  return {
    scene: sceneResult.rows[0] ?? null,
    flow: flowResult.rows[0] ?? null,
    configs,
    cameras,
    defaults,
    syncState: syncStateResult.rows[0] ?? null,
  };
}

function diffConfig(previous: Record<string, unknown>, next: Record<string, unknown>) {
  const diff: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(next)) {
    if (!areValuesEqual(previous[key], value)) {
      diff[key] = value;
    }
  }
  return diff;
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (left === right) {
    return true;
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return left.length === right.length && left.every((value, index) => areValuesEqual(value, right[index]));
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    return leftKeys.length === rightKeys.length && leftKeys.every((key) => areValuesEqual(left[key], right[key]));
  }

  return false;
}

function buildApplyResolvedConfigScript(input: {
  cameraName: string;
  resolvedConfig: Record<string, unknown>;
  defaults: Record<string, any>;
}) {
  const assignments = buildAssignments(input.resolvedConfig, input.defaults);

  const lines = [
    '(',
    'local applied = #()',
    'local failed = #()',
    'fn bfEsc value = (if MCP_Server != undefined then MCP_Server.escapeJsonString (value as string) else (value as string))',
    'fn bfRecordApplied key = append applied key',
    'fn bfRecordFailed key = append failed (key + ": " + (getCurrentException() as string))',
    'fn bfSetProperty target propName value key = (',
    '  try (',
    '    setProperty target (propName as name) value',
    '    bfRecordApplied key',
    '    true',
    '  ) catch (',
    '    bfRecordFailed key',
    '    false',
    '  )',
    ')',
    'fn bfExecuteAssignment expr key = (',
    '  try (',
    '    execute expr',
    '    bfRecordApplied key',
    '    true',
    '  ) catch (',
    '    bfRecordFailed key',
    '    false',
    '  )',
    ')',
    'fn bfFindToneMappingOperator rootOp className = (',
    '  local current = rootOp',
    '  local guard = 0',
    '  while current != undefined and guard < 64 do (',
    '    if ((classOf current) as string) == className do return current',
    '    current = try(current.colorMappingOperator_nextOperator) catch undefined',
    '    guard += 1',
    '  )',
    '  undefined',
    ')',
    `local cameraNode = getNodeByName ${toMaxScriptString(input.cameraName)}`,
    `if cameraNode == undefined then throw ("Camera not found: " + ${toMaxScriptString(input.cameraName)})`,
    'try(viewport.setCamera cameraNode) catch()',
    'try(select cameraNode) catch()',
    'local rendererTarget = renderers.current',
    'local toneMappingRoot = try(renderers.current.colorMap_pipeline) catch undefined',
    'local coronaCameraModifier = try(cameraNode.modifiers[#CoronaCameraMod]) catch undefined',
  ];

  for (const assignment of assignments) {
    const key = `${assignment.category}.${assignment.key}`;
    if (!assignment.valueExpr) {
      continue;
    }

    if (assignment.target === 'renderer') {
      lines.push(`bfSetProperty rendererTarget ${toMaxScriptString(assignment.propertyName ?? assignment.key)} ${assignment.valueExpr} ${toMaxScriptString(key)}`);
      continue;
    }

    if (assignment.target === 'camera') {
      lines.push(`bfSetProperty cameraNode ${toMaxScriptString(assignment.propertyName ?? assignment.key)} ${assignment.valueExpr} ${toMaxScriptString(key)}`);
      continue;
    }

    if (assignment.target === 'camera_modifier') {
      lines.push(`if coronaCameraModifier != undefined then (bfSetProperty coronaCameraModifier ${toMaxScriptString(assignment.propertyName ?? assignment.key)} ${assignment.valueExpr} ${toMaxScriptString(key)}) else append failed (${toMaxScriptString(key)} + ": Missing CoronaCameraMod")`);
      continue;
    }

    if (assignment.target === 'tone_mapping') {
      lines.push(`local toneOperator_${sanitizeIdentifier(key)} = if toneMappingRoot != undefined then bfFindToneMappingOperator toneMappingRoot ${toMaxScriptString(assignment.operatorClass ?? '')} else undefined`);
      lines.push(`if toneOperator_${sanitizeIdentifier(key)} != undefined then (bfSetProperty toneOperator_${sanitizeIdentifier(key)} ${toMaxScriptString(assignment.propertyName ?? assignment.key)} ${assignment.valueExpr} ${toMaxScriptString(key)}) else append failed (${toMaxScriptString(key)} + ": Missing tone mapping operator")`);
      continue;
    }

    if (assignment.target === 'layers') {
      lines.push(`bfExecuteAssignment ${toMaxScriptString(`(
  local layerRef = LayerManager.getLayerFromName ${toMaxScriptString(assignment.propertyName ?? '')}
  if layerRef == undefined then throw ("Layer not found: " + ${toMaxScriptString(assignment.propertyName ?? '')})
  layerRef.on = ${assignment.valueExpr}
)`)} ${toMaxScriptString(key)}`);
      continue;
    }

    if (assignment.target === 'scene_output' || assignment.target === 'environment' || assignment.target === 'gamma_color') {
      lines.push(`bfExecuteAssignment ${toMaxScriptString(`${assignment.propertyName ?? assignment.key} = ${assignment.valueExpr}`)} ${toMaxScriptString(key)}`);
    }
  }

  lines.push(
    'local appliedJson = ""',
    'for i = 1 to applied.count do (',
    '  if i > 1 do appliedJson += ","',
    '  appliedJson += "\\\"" + bfEsc applied[i] + "\\\""',
    ')',
    'local failedJson = ""',
    'for i = 1 to failed.count do (',
    '  if i > 1 do failedJson += ","',
    '  failedJson += "\\\"" + bfEsc failed[i] + "\\\""',
    ')',
    `"{" + "\\\"camera\\\":\\\"" + bfEsc ${toMaxScriptString(input.cameraName)} + "\\\"," + "\\\"applied\\\":[" + appliedJson + "]," + "\\\"failed\\\":[" + failedJson + "]}"`,
    ')',
  );

  return lines.join('\n');
}

function buildAssignments(
  resolvedConfig: Record<string, unknown>,
  defaults: Record<string, any>,
): AssignmentInstruction[] {
  const keyTargets = buildKeyTargets(defaults);
  const assignments: AssignmentInstruction[] = [];

  for (const [key, value] of Object.entries(resolvedConfig)) {
    if (IGNORED_CONFIG_KEYS.has(key)) {
      continue;
    }

    const targets = keyTargets.get(key);
    if (!targets || targets.length === 0) {
      continue;
    }

    for (const target of targets) {
      const valueExpr = toMaxScriptLiteral(value, target.definition);
      if (!valueExpr) {
        continue;
      }

      if (target.category === 'tone_mapping') {
        const [operatorClass, propertyName] = key.split('.', 2);
        if (!operatorClass || !propertyName) {
          continue;
        }

        assignments.push({
          category: target.category,
          key,
          target: 'tone_mapping',
          operatorClass,
          propertyName,
          valueExpr,
        });
        continue;
      }

      if (target.category === 'scene_output') {
        assignments.push({
          category: target.category,
          key,
          target: 'scene_output',
          propertyName: key,
          valueExpr,
        });
        continue;
      }

      if (target.category === 'environment') {
        assignments.push({
          category: target.category,
          key,
          target: 'environment',
          propertyName: key,
          valueExpr,
        });
        continue;
      }

      if (target.category === 'gamma_color') {
        assignments.push({
          category: target.category,
          key,
          target: 'gamma_color',
          propertyName: key,
          valueExpr,
        });
        continue;
      }

      if (target.category === 'corona_renderer') {
        assignments.push({
          category: target.category,
          key,
          target: 'renderer',
          propertyName: key,
          valueExpr,
        });
        continue;
      }

      if (target.category === 'physical_camera' || target.category === 'free_camera' || target.category === 'target_camera') {
        assignments.push({
          category: target.category,
          key,
          target: 'camera',
          propertyName: key,
          valueExpr,
        });
        continue;
      }

      if (target.category === 'corona_camera_mod') {
        assignments.push({
          category: target.category,
          key,
          target: 'camera_modifier',
          propertyName: key,
          valueExpr,
        });
        continue;
      }

      if (target.category === 'layers' && isRecord(value)) {
        for (const [layerName, layerEnabled] of Object.entries(value)) {
          const layerValueExpr = toMaxScriptLiteral(layerEnabled, { type: 'bool' });
          if (!layerValueExpr) {
            continue;
          }

          assignments.push({
            category: target.category,
            key,
            target: 'layers',
            propertyName: layerName,
            valueExpr: layerValueExpr,
          });
        }
      }
    }
  }

  return assignments;
}

function buildKeyTargets(defaults: Record<string, any>) {
  const index = new Map<string, Array<{ category: string; definition: ParameterDefinition }>>();

  const addGroup = (category: string, group: Record<string, unknown>) => {
    if (!isRecord(group.parameters)) {
      return;
    }

    for (const [key, definition] of Object.entries(group.parameters)) {
      if (!isRecord(definition)) {
        continue;
      }

      const entries = index.get(key) ?? [];
      entries.push({ category, definition });
      index.set(key, entries);
    }
  };

  for (const [category, group] of Object.entries(defaults)) {
    if (isRecord(group)) {
      addGroup(category, group);
    }
  }

  for (const [rawCategory, group] of Object.entries(FALLBACK_GROUPS)) {
    const category = GROUP_ALIASES[rawCategory] ?? rawCategory;
    if (isRecord(group)) {
      addGroup(category, group);
    }
  }

  return index;
}

function toMaxScriptLiteral(value: unknown, definition?: ParameterDefinition): string | null {
  if (value === undefined || value === null) {
    return 'undefined';
  }

  if (definition?.type === 'ref') {
    return value === null || value === '' ? 'undefined' : null;
  }

  if (definition?.type === 'color') {
    if (Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === 'number')) {
      return `(color ${Math.round(value[0])} ${Math.round(value[1])} ${Math.round(value[2])})`;
    }
    return null;
  }

  if (definition?.type === 'enum') {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${Math.round(value)}`;
    }
    if (typeof value === 'string' && Array.isArray(definition.options)) {
      const optionIndex = definition.options.findIndex((option) => option === value);
      if (optionIndex >= 0) {
        return `${optionIndex}`;
      }
    }
    return null;
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }

  if (typeof value === 'number') {
    return Number.isFinite(value) ? `${value}` : null;
  }

  if (typeof value === 'string') {
    return toMaxScriptString(value);
  }

  return null;
}

function toMaxScriptString(value: string) {
  return `"${value
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')}"`;
}

function sanitizeIdentifier(value: string) {
  return value.replace(/[^A-Za-z0-9_]/g, '_');
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type MaxSyncStatePatch = Partial<Omit<MaxSyncState, 'scene_id' | 'updated_at'>>;

async function upsertMaxSyncState(sceneId: string, patch: MaxSyncStatePatch): Promise<MaxSyncState> {
  const columns = ['scene_id'];
  const placeholders = ['$1'];
  const values: unknown[] = [sceneId];
  const updates: string[] = [];
  let index = 2;

  const addField = <K extends keyof MaxSyncStatePatch>(field: K, value: MaxSyncStatePatch[K], serializeJson = false) => {
    const column = String(field);
    columns.push(column);
    placeholders.push(`$${index}`);
    values.push(serializeJson ? JSON.stringify(value ?? {}) : value);
    updates.push(`${column} = EXCLUDED.${column}`);
    index += 1;
  };

  if ('status' in patch) addField('status', patch.status);
  if ('active_path_key' in patch) addField('active_path_key', patch.active_path_key);
  if ('active_camera_name' in patch) addField('active_camera_name', patch.active_camera_name);
  if ('last_synced_config' in patch) addField('last_synced_config', patch.last_synced_config, true);
  if ('last_request_id' in patch) addField('last_request_id', patch.last_request_id);
  if ('last_reason' in patch) addField('last_reason', patch.last_reason);
  if ('last_error' in patch) addField('last_error', patch.last_error);
  if ('last_synced_at' in patch) addField('last_synced_at', patch.last_synced_at);

  const sql = `
    INSERT INTO max_sync_state (${columns.join(', ')}, updated_at)
    VALUES (${placeholders.join(', ')}, NOW())
    ON CONFLICT (scene_id) DO UPDATE SET
      ${updates.length > 0 ? `${updates.join(', ')},` : ''}
      updated_at = NOW()
    RETURNING *
  `;

  const { rows } = await dbQuery<MaxSyncState>(sql, values);
  return rows[0];
}

function emitSyncState(state: MaxSyncState) {
  emitSocketEvent('max-sync:updated', state);
}
