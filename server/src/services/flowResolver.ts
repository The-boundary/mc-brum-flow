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
  const resolvedConfig = { ...defaults };

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
