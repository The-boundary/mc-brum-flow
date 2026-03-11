interface FlowRow {
  nodes: any[];
  edges: any[];
}

interface ResolveFlowPathsInput {
  flow: FlowRow;
  configs: Record<string, any>;
  cameras: Record<string, any>;
  defaults: Record<string, any>;
}

export interface ResolvedFlowPath {
  pathKey: string;
  nodeIds: string[];
  outputNodeId: string;
  cameraName: string;
  filename: string;
  resolvedConfig: Record<string, unknown>;
  enabled: boolean;
  stageLabels: Partial<Record<'lightSetup' | 'toneMapping' | 'layerSetup' | 'aspectRatio' | 'stageRev' | 'deadline' | 'override', string>>;
}

const STAGE_LABEL_TYPES = new Set([
  'lightSetup',
  'toneMapping',
  'layerSetup',
  'aspectRatio',
  'stageRev',
  'deadline',
  'override',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function flattenDefaultSettings(defaults: Record<string, any>): Record<string, unknown> {
  const flatDefaults: Record<string, unknown> = {};

  for (const group of Object.values(defaults)) {
    if (!isRecord(group) || !isRecord(group.parameters)) {
      continue;
    }

    for (const [key, parameter] of Object.entries(group.parameters)) {
      if (!isRecord(parameter) || !('default' in parameter)) {
        continue;
      }

      flatDefaults[key] = parameter.default;
    }
  }

  return flatDefaults;
}

function parseAspectRatio(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  const colonMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/);
  if (colonMatch) {
    const width = Number.parseFloat(colonMatch[1]);
    const height = Number.parseFloat(colonMatch[2]);
    return width > 0 && height > 0 ? width / height : null;
  }

  const slashMatch = normalized.match(/^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/);
  if (slashMatch) {
    const width = Number.parseFloat(slashMatch[1]);
    const height = Number.parseFloat(slashMatch[2]);
    return width > 0 && height > 0 ? width / height : null;
  }

  const singleValue = Number.parseFloat(normalized);
  return Number.isFinite(singleValue) && singleValue > 0 ? singleValue : null;
}

function normalizeOutputResolution(resolvedConfig: Record<string, unknown>) {
  const longestEdge = resolvedConfig.longest_edge;
  const ratio = parseAspectRatio(resolvedConfig.ratio);
  const currentWidth = typeof resolvedConfig.renderWidth === 'number' ? resolvedConfig.renderWidth : null;
  const currentHeight = typeof resolvedConfig.renderHeight === 'number' ? resolvedConfig.renderHeight : null;
  const fallbackRatio = currentWidth && currentHeight && currentHeight > 0 ? currentWidth / currentHeight : null;
  const effectiveRatio = ratio ?? fallbackRatio;

  if (typeof longestEdge === 'number' && Number.isFinite(longestEdge) && longestEdge > 0 && effectiveRatio && effectiveRatio > 0) {
    if (effectiveRatio >= 1) {
      resolvedConfig.renderWidth = Math.round(longestEdge);
      resolvedConfig.renderHeight = Math.max(1, Math.round(longestEdge / effectiveRatio));
    } else {
      resolvedConfig.renderWidth = Math.max(1, Math.round(longestEdge * effectiveRatio));
      resolvedConfig.renderHeight = Math.round(longestEdge);
    }
  }

  delete resolvedConfig.longest_edge;
  delete resolvedConfig.ratio;
}

export function resolveFlowPaths({
  flow,
  configs,
  cameras,
  defaults,
}: ResolveFlowPathsInput): ResolvedFlowPath[] {
  const nodes = new Map<string, any>();
  const outgoing = new Map<string, string[]>();

  for (const node of flow.nodes ?? []) {
    nodes.set(node.id, node);
  }

  for (const edge of flow.edges ?? []) {
    const targets = outgoing.get(edge.source) ?? [];
    targets.push(edge.target);
    outgoing.set(edge.source, targets);
  }

  const cameraNodes = (flow.nodes ?? []).filter((node: any) => node.type === 'camera');
  const paths: ResolvedFlowPath[] = [];

  const visit = (nodeId: string, trail: string[]) => {
    if (trail.includes(nodeId)) return;

    const node = nodes.get(nodeId);
    if (!node) return;

    const nextTrail = [...trail, nodeId];

    if (node.type === 'output') {
      paths.push(resolveSinglePath(nextTrail, nodes, configs, cameras, defaults));
    }

    for (const targetId of outgoing.get(nodeId) ?? []) {
      visit(targetId, nextTrail);
    }
  };

  for (const cameraNode of cameraNodes) {
    visit(cameraNode.id, []);
  }

  return paths;
}

function resolveSinglePath(
  nodeIds: string[],
  nodes: Map<string, any>,
  configs: Record<string, any>,
  cameras: Record<string, any>,
  defaults: Record<string, any>
): ResolvedFlowPath {
  const pathKey = nodeIds.join('>');
  const outputNodeId = nodeIds[nodeIds.length - 1];
  const outputNode = nodes.get(outputNodeId) ?? {};
  const groupLabels: string[] = [];
  const stageLabels: ResolvedFlowPath['stageLabels'] = {};
  let cameraName = '';
  let revLabel = '';
  const resolvedConfig = flattenDefaultSettings(defaults);

  for (const nodeId of nodeIds) {
    const node = nodes.get(nodeId);
    if (!node) continue;

    if (node.type === 'camera' && node.camera_id) {
      cameraName = cameras[node.camera_id]?.name ?? node.label;
    }

    if (node.type === 'group') {
      groupLabels.push(node.label);
    }

    if (STAGE_LABEL_TYPES.has(node.type)) {
      stageLabels[node.type as keyof ResolvedFlowPath['stageLabels']] = node.label;
    }

    if (node.type === 'stageRev') {
      revLabel = node.label;
    }

    if (node.config_id && configs[node.config_id]) {
      Object.assign(resolvedConfig, configs[node.config_id].delta);
    }
  }

  normalizeOutputResolution(resolvedConfig);

  const format = outputNode.config_id
    ? (configs[outputNode.config_id]?.delta?.format ?? 'EXR')
    : 'EXR';
  const explicitEnabled = outputNode.path_states?.[pathKey];
  const enabled = explicitEnabled ?? (outputNode.enabled !== false);

  return {
    pathKey,
    nodeIds,
    outputNodeId,
    cameraName,
    filename: [...groupLabels, cameraName, revLabel].filter(Boolean).join(' - ') + `.${String(format).toLowerCase()}`,
    resolvedConfig,
    enabled,
    stageLabels,
  };
}
