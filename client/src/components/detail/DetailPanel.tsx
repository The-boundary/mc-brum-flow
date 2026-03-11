import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  Contrast,
  Eye,
  EyeOff,
  FileOutput,
  FolderOpen,
  Gauge,
  Layers,
  RectangleHorizontal,
  RotateCcw,
  Server,
  Sun,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import type { NodeType } from '@shared/types';
import { useFlowStore } from '@/stores/flowStore';

const NODE_TYPE_LABELS: Record<NodeType, { label: string; color: string; icon: typeof Camera }> = {
  camera: { label: 'Camera', color: 'text-emerald-400', icon: Camera },
  group: { label: 'Group', color: 'text-orange-400', icon: FolderOpen },
  lightSetup: { label: 'Light Setup', color: 'text-amber-400', icon: Sun },
  toneMapping: { label: 'Tone Mapping', color: 'text-blue-400', icon: Contrast },
  layerSetup: { label: 'Layer Setup', color: 'text-cyan-400', icon: Layers },
  aspectRatio: { label: 'Aspect Ratio', color: 'text-teal-400', icon: RectangleHorizontal },
  stageRev: { label: 'Stage Rev', color: 'text-green-400', icon: Gauge },
  override: { label: 'Override', color: 'text-red-400', icon: AlertTriangle },
  deadline: { label: 'Deadline', color: 'text-purple-400', icon: Server },
  output: { label: 'Output', color: 'text-fuchsia-400', icon: FileOutput },
};

type ParameterKind = 'int' | 'float' | 'bool' | 'string' | 'enum' | 'color' | 'ref';

interface ParameterDefinition {
  key: string;
  label: string;
  type: ParameterKind;
  defaultValue: unknown;
  min?: number;
  max?: number;
  options?: string[];
}

interface ParameterGroupDefinition {
  category: string;
  label: string;
  definitions: ParameterDefinition[];
}

interface EditableFieldSpec {
  label: string;
  candidates: string[];
  fallbackKey: string;
  type: 'int' | 'float';
  min?: number;
  max?: number;
  step?: number;
  defaultValue: number;
}

interface MarqueeRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const STAGE_REV_PRESETS = [
  { label: 'Rev A', longestEdge: 1500 },
  { label: 'Rev B', longestEdge: 3000 },
  { label: 'Rev C', longestEdge: 6000 },
] as const;

const STAGE_REV_FIELDS: EditableFieldSpec[] = [
  {
    label: 'Longest Edge',
    candidates: ['longest_edge'],
    fallbackKey: 'longest_edge',
    type: 'int',
    min: 1,
    max: 12000,
    step: 100,
    defaultValue: 3000,
  },
];

const TONE_MAPPING_FIELDS: EditableFieldSpec[] = [
  {
    label: 'Contrast',
    candidates: ['ContrastOperatorPlugin.colorMappingOperator_contrast', 'contrast'],
    fallbackKey: 'ContrastOperatorPlugin.colorMappingOperator_contrast',
    type: 'float',
    min: 0,
    max: 10,
    step: 0.05,
    defaultValue: 1,
  },
  {
    label: 'Saturation',
    candidates: ['SaturationOperatorPlugin.colorMappingOperator_saturation', 'saturation'],
    fallbackKey: 'SaturationOperatorPlugin.colorMappingOperator_saturation',
    type: 'float',
    min: -1,
    max: 1,
    step: 0.05,
    defaultValue: 0,
  },
  {
    label: 'White Balance',
    candidates: ['WhiteBalanceImprovedOperatorPlugin.colorMappingOperator_colorTemperature', 'whiteBalance'],
    fallbackKey: 'WhiteBalanceImprovedOperatorPlugin.colorMappingOperator_colorTemperature',
    type: 'float',
    min: 1000,
    max: 40000,
    step: 100,
    defaultValue: 6500,
  },
  {
    label: 'Green / Magenta Tint',
    candidates: ['GreenMagentaTintOperatorPlugin.colorMappingOperator_greenMagentaTint', 'greenMagentaTint'],
    fallbackKey: 'GreenMagentaTintOperatorPlugin.colorMappingOperator_greenMagentaTint',
    type: 'float',
    min: -1,
    max: 1,
    step: 0.01,
    defaultValue: 0,
  },
  {
    label: 'Exposure',
    candidates: ['SimpleExposureOperatorPlugin.colorMappingOperator_simpleExposure', 'exposure'],
    fallbackKey: 'SimpleExposureOperatorPlugin.colorMappingOperator_simpleExposure',
    type: 'float',
    min: -10,
    max: 10,
    step: 0.05,
    defaultValue: 0,
  },
];

const PARAMETER_GROUP_LABELS: Record<string, string> = {
  corona_renderer: 'Corona Renderer',
  tone_mapping: 'Tone Mapping',
  scene_output: 'Scene Output',
  environment: 'Environment',
  color_management: 'Color Management',
  gamma_color: 'Color Management',
  physical_camera: 'Physical Camera',
  free_camera: 'Free Camera',
  corona_camera_mod: 'Corona Camera Modifier',
  layers: 'Layers',
};

const NODE_PARAMETER_GROUPS: Partial<Record<NodeType, string[]>> = {
  lightSetup: ['environment'],
  toneMapping: ['tone_mapping'],
  aspectRatio: ['scene_output'],
  stageRev: ['scene_output', 'corona_renderer'],
  override: [
    'corona_renderer',
    'tone_mapping',
    'scene_output',
    'environment',
    'color_management',
    'physical_camera',
    'free_camera',
    'corona_camera_mod',
  ],
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inferParameterKind(value: unknown): ParameterKind {
  if (Array.isArray(value)) return 'color';
  if (typeof value === 'boolean') return 'bool';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float';
  return 'string';
}

function normalizeParameterDefinitions(settings: Record<string, unknown>): ParameterDefinition[] {
  const source = isRecord(settings.parameters) ? settings.parameters : settings;

  return Object.entries(source).map(([key, rawValue]) => {
    if (isRecord(rawValue) && 'default' in rawValue) {
      const typeValue = typeof rawValue.type === 'string' ? rawValue.type : null;
      const normalizedType: ParameterKind =
        typeValue === 'int'
        || typeValue === 'float'
        || typeValue === 'bool'
        || typeValue === 'string'
        || typeValue === 'enum'
        || typeValue === 'color'
        || typeValue === 'ref'
          ? typeValue
          : inferParameterKind(rawValue.default);

      return {
        key,
        label: typeof rawValue.label === 'string' ? rawValue.label : key,
        type: normalizedType,
        defaultValue: rawValue.default,
        min: typeof rawValue.min === 'number' ? rawValue.min : undefined,
        max: typeof rawValue.max === 'number' ? rawValue.max : undefined,
        options: Array.isArray(rawValue.options)
          ? rawValue.options.filter((option): option is string => typeof option === 'string')
          : undefined,
      };
    }

    return {
      key,
      label: key,
      type: inferParameterKind(rawValue),
      defaultValue: rawValue,
    };
  });
}

function getFieldDefinition(definitions: ParameterDefinition[], spec: EditableFieldSpec): ParameterDefinition {
  const definition = definitions.find((entry) => spec.candidates.includes(entry.key));
  if (definition) return definition;

  return {
    key: spec.fallbackKey,
    label: spec.label,
    type: spec.type,
    defaultValue: spec.defaultValue,
    min: spec.min,
    max: spec.max,
  };
}

function getEffectiveFieldValue(
  delta: Record<string, unknown>,
  definition: ParameterDefinition,
  spec: EditableFieldSpec
): number {
  for (const key of [definition.key, ...spec.candidates]) {
    const value = delta[key];
    if (typeof value === 'number') {
      return value;
    }
  }

  return typeof definition.defaultValue === 'number' ? definition.defaultValue : spec.defaultValue;
}

function areValuesEqual(left: unknown, right: unknown): boolean {
  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((value, index) => areValuesEqual(value, right[index]));
  }

  if (isRecord(left) && isRecord(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every((key) => areValuesEqual(left[key], right[key]));
  }

  if (typeof left === 'number' && typeof right === 'number') {
    return Math.abs(left - right) < 0.0001;
  }

  return left === right;
}

function formatValue(value: unknown): string {
  if (Array.isArray(value) || isRecord(value)) {
    return JSON.stringify(value);
  }

  if (value === null || value === undefined) {
    return '';
  }

  return String(value);
}

function getEffectiveParameterValue(delta: Record<string, unknown>, definition: ParameterDefinition): unknown {
  return Object.prototype.hasOwnProperty.call(delta, definition.key)
    ? delta[definition.key]
    : definition.defaultValue;
}

function parseParameterInputValue(rawValue: string, definition: ParameterDefinition): unknown | null {
  if (definition.type === 'int') {
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (definition.type === 'float') {
    const parsed = Number.parseFloat(rawValue);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (definition.type === 'color') {
    const trimmed = rawValue.trim();
    if (!trimmed) return definition.defaultValue;

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // Fall back to comma-separated RGB parsing.
    }

    const channelValues = trimmed
      .split(',')
      .map((value) => Number.parseFloat(value.trim()));
    if (channelValues.length === 3 && channelValues.every((value) => Number.isFinite(value))) {
      return channelValues;
    }

    return trimmed;
  }

  return rawValue;
}

function formatInputValue(value: unknown, definition: ParameterDefinition): string {
  if (definition.type === 'color' && Array.isArray(value)) {
    return value.join(', ');
  }

  return formatValue(value);
}

function normalizeMarquee(start: { x: number; y: number }, current: { x: number; y: number }): MarqueeRect {
  return {
    x: Math.min(start.x, current.x),
    y: Math.min(start.y, current.y),
    width: Math.abs(current.x - start.x),
    height: Math.abs(current.y - start.y),
  };
}

function intersectsRect(a: MarqueeRect, b: MarqueeRect) {
  return a.x < b.x + b.width
    && a.x + a.width > b.x
    && a.y < b.y + b.height
    && a.y + a.height > b.y;
}

export function DetailPanel() {
  const selectedNodeId = useFlowStore((state) => state.selectedNodeId);
  const flowNodes = useFlowStore((state) => state.flowNodes);

  if (!selectedNodeId) {
    return <EmptyPanel />;
  }

  const node = flowNodes.find((entry) => entry.id === selectedNodeId);
  if (!node) {
    return <EmptyPanel />;
  }

  switch (node.type) {
    case 'camera':
      return <CameraDetail nodeId={node.id} />;
    case 'group':
      return <GroupDetail nodeId={node.id} />;
    case 'output':
      return <OutputDetail nodeId={node.id} />;
    default:
      return <ProcessingDetail nodeId={node.id} />;
  }
}

function CameraDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((state) => state.flowNodes.find((entry) => entry.id === nodeId));
  const cameras = useFlowStore((state) => state.cameras);
  const updateNodeLabel = useFlowStore((state) => state.updateNodeLabel);

  if (!node) {
    return <EmptyPanel />;
  }

  const camera = node.camera_id ? cameras.find((entry) => entry.id === node.camera_id) : null;

  return (
    <div className="p-4 space-y-5">
      <NodeHeader label={camera?.name ?? node.label} type="camera" />

      {camera && (
        <Section title="Camera Info">
          <div className="space-y-1.5 text-xs">
            <Row label="Name" value={camera.name} />
            <Row label="Max Handle" value={String(camera.max_handle)} />
            {camera.max_class && <Row label="Class" value={camera.max_class} />}
          </div>
        </Section>
      )}

      {!camera && node.camera_id && (
        <div className="flex items-center gap-2 rounded border border-red-400/30 bg-red-400/10 p-2">
          <AlertTriangle className="h-3.5 w-3.5 text-red-400" />
          <span className="text-xs text-red-300">Camera has been removed from the scene</span>
        </div>
      )}

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(event) => updateNodeLabel(nodeId, event.target.value)}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>
    </div>
  );
}

function GroupDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((state) => state.flowNodes.find((entry) => entry.id === nodeId));
  const flowEdges = useFlowStore((state) => state.flowEdges);
  const flowNodes = useFlowStore((state) => state.flowNodes);
  const resolvedPaths = useFlowStore((state) => state.resolvedPaths);
  const toggleHidePrevious = useFlowStore((state) => state.toggleHidePrevious);
  const updateNodeLabel = useFlowStore((state) => state.updateNodeLabel);

  if (!node) {
    return <EmptyPanel />;
  }

  const incomingNodes = flowEdges
    .filter((edge) => edge.target === nodeId)
    .map((edge) => flowNodes.find((entry) => entry.id === edge.source))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  const pathsThrough = resolvedPaths.filter((path) => path.nodeIds.includes(nodeId));

  return (
    <div className="p-4 space-y-5">
      <NodeHeader label={node.label} type="group" />

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(event) => updateNodeLabel(nodeId, event.target.value)}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>

      <Section title="Visibility">
        <button
          type="button"
          onClick={() => toggleHidePrevious(nodeId)}
          className="flex w-full items-center gap-2 rounded border border-border bg-surface-300 px-2 py-1.5 text-xs transition hover:bg-surface-400"
        >
          {node.hide_previous ? (
            <>
              <EyeOff className="h-3.5 w-3.5 text-fg-dim" />
              <span>Previous nodes hidden</span>
            </>
          ) : (
            <>
              <Eye className="h-3.5 w-3.5 text-fg-dim" />
              <span>Previous nodes visible</span>
            </>
          )}
        </button>
      </Section>

      <Section title={`Inputs (${incomingNodes.length})`}>
        {incomingNodes.length === 0 && <span className="text-[10px] text-fg-dim">No inputs connected</span>}
        {incomingNodes.map((entry) => (
          <NodeRef key={entry.id} nodeId={entry.id} label={entry.label} type={entry.type} />
        ))}
      </Section>

      <Section title={`Paths through (${pathsThrough.length})`}>
        {pathsThrough.length === 0 && <span className="text-[10px] text-fg-dim">No paths through this group</span>}
        {pathsThrough.slice(0, 10).map((path) => (
          <div key={path.pathKey} className="truncate py-0.5 font-mono text-[10px] text-fg-muted">
            {path.filename}
          </div>
        ))}
        {pathsThrough.length > 10 && (
          <div className="text-[10px] text-fg-dim">+{pathsThrough.length - 10} more</div>
        )}
      </Section>
    </div>
  );
}

function ProcessingDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((state) => state.flowNodes.find((entry) => entry.id === nodeId));
  const nodeConfigs = useFlowStore((state) => state.nodeConfigs);
  const studioDefaults = useFlowStore((state) => state.studioDefaults);
  const assignNodeConfig = useFlowStore((state) => state.assignNodeConfig);
  const createNodeConfig = useFlowStore((state) => state.createNodeConfig);
  const updateNodeConfig = useFlowStore((state) => state.updateNodeConfig);
  const updateNodeLabel = useFlowStore((state) => state.updateNodeLabel);
  const nodeType = node?.type ?? 'override';
  const parameterGroupKeys = NODE_PARAMETER_GROUPS[nodeType] ?? [];
  const [settingsFilter, setSettingsFilter] = useState('');

  const configsForType = useMemo(
    () => nodeConfigs.filter((entry) => entry.node_type === nodeType),
    [nodeConfigs, nodeType]
  );
  const config = node?.config_id ? configsForType.find((entry) => entry.id === node.config_id) ?? null : null;
  const delta = useMemo(
    () => (config?.delta && isRecord(config.delta) ? config.delta : {}),
    [config]
  );
  const deltaEntries = Object.entries(delta);
  const parameterGroups = useMemo<ParameterGroupDefinition[]>(
    () => parameterGroupKeys
      .map((category) => {
        const defaults = studioDefaults.find((entry) => entry.category === category);
        const settings = defaults?.settings && isRecord(defaults.settings) ? defaults.settings : {};

        return {
          category,
          label: PARAMETER_GROUP_LABELS[category] ?? category,
          definitions: normalizeParameterDefinitions(settings),
        };
      })
      .filter((group) => group.definitions.length > 0),
    [parameterGroupKeys, studioDefaults]
  );
  const parameterDefinitions = useMemo(
    () => parameterGroups.flatMap((group) => group.definitions),
    [parameterGroups]
  );
  const editableFields = useMemo(() => {
    if (nodeType === 'toneMapping') {
      return TONE_MAPPING_FIELDS;
    }
    if (nodeType === 'stageRev') {
      return STAGE_REV_FIELDS;
    }
    return [];
  }, [nodeType]);
  const currentStageRevValue = useMemo(() => {
    const spec = STAGE_REV_FIELDS[0];
    if (!spec) return null;
    const definition = getFieldDefinition(parameterDefinitions, spec);
    return getEffectiveFieldValue(delta, definition, spec);
  }, [delta, parameterDefinitions]);
  const filteredParameterGroups = useMemo(() => {
    const normalizedFilter = settingsFilter.trim().toLowerCase();
    if (!normalizedFilter) {
      return parameterGroups;
    }

    return parameterGroups
      .map((group) => ({
        ...group,
        definitions: group.definitions.filter((definition) =>
          definition.label.toLowerCase().includes(normalizedFilter)
          || definition.key.toLowerCase().includes(normalizedFilter)
        ),
      }))
      .filter((group) => group.definitions.length > 0);
  }, [parameterGroups, settingsFilter]);

  useEffect(() => {
    setSettingsFilter('');
  }, [nodeId]);

  if (!node) {
    return <EmptyPanel />;
  }

  const ensureEditableConfig = async () => {
    if (config) {
      return config;
    }

    const created = await createNodeConfig(node.type, node.label, {});
    if (!created) {
      return null;
    }

    await assignNodeConfig(nodeId, created.id);
    return created;
  };

  const handlePresetChange = async (nextConfigId: string) => {
    await assignNodeConfig(nodeId, nextConfigId || undefined);
  };

  const commitParameterValue = async (definition: ParameterDefinition, nextValue: unknown) => {
    const editableConfig = await ensureEditableConfig();
    if (!editableConfig) {
      return;
    }

    const nextDelta = { ...(editableConfig.delta ?? {}) };
    if (areValuesEqual(nextValue, definition.defaultValue)) {
      delete nextDelta[definition.key];
    } else {
      nextDelta[definition.key] = nextValue;
    }

    await updateNodeConfig(editableConfig.id, { delta: nextDelta });
  };

  const handleFieldChange = async (spec: EditableFieldSpec, rawValue: string) => {
    if (rawValue === '') {
      return;
    }

    const definition = getFieldDefinition(parameterDefinitions, spec);
    const parsedValue = spec.type === 'int'
      ? Number.parseInt(rawValue, 10)
      : Number.parseFloat(rawValue);

    if (Number.isNaN(parsedValue)) {
      return;
    }

    await commitParameterValue(definition, parsedValue);
  };

  const handleStageRevPreset = async (label: string, longestEdge: number) => {
    let preset = configsForType.find((entry) => entry.label === label) ?? null;

    if (!preset) {
      preset = await createNodeConfig('stageRev', label, { longest_edge: longestEdge });
    } else {
      preset = await updateNodeConfig(preset.id, {
        label,
        delta: {
          ...(preset.delta ?? {}),
          longest_edge: longestEdge,
        },
      });
    }

    if (preset) {
      await assignNodeConfig(nodeId, preset.id);
    }
  };

  return (
    <div className="p-4 space-y-5">
      <NodeHeader label={node.label} type={node.type} />

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(event) => updateNodeLabel(nodeId, event.target.value)}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>

      <Section title="Preset">
        <div className="space-y-2">
          <select
            value={node.config_id ?? ''}
            onChange={(event) => {
              void handlePresetChange(event.target.value);
            }}
            className="w-full rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
          >
            <option value="">No preset assigned</option>
            {configsForType.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
          <div className="text-[10px] text-fg-dim">
            {config
              ? `${deltaEntries.length} override${deltaEntries.length === 1 ? '' : 's'} from studio defaults`
              : 'Assign or create a preset to make this node editable.'}
          </div>
        </div>
      </Section>

      {node.type === 'stageRev' && (
        <Section title="Standard Revs">
          <div className="grid grid-cols-3 gap-2">
            {STAGE_REV_PRESETS.map((preset) => {
              const isActive =
                config?.label === preset.label
                || node.label === preset.label
                || currentStageRevValue === preset.longestEdge;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    void handleStageRevPreset(preset.label, preset.longestEdge);
                  }}
                  className={`rounded border px-2 py-1.5 text-xs transition ${
                    isActive
                      ? 'border-green-400 bg-green-400/10 text-green-300'
                      : 'border-border bg-surface-300 text-foreground hover:bg-surface-400'
                  }`}
                >
                  {preset.label}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {editableFields.length > 0 && (
        <Section title="Quick Controls">
          <div className="space-y-3">
            {editableFields.map((spec) => {
              const definition = getFieldDefinition(parameterDefinitions, spec);
              const value = getEffectiveFieldValue(delta, definition, spec);
              return (
                <label key={spec.label} className="block">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-foreground">{spec.label}</span>
                    <span className="text-fg-dim">Default: {formatValue(definition.defaultValue)}</span>
                  </div>
                  <input
                    type="number"
                    min={definition.min ?? spec.min}
                    max={definition.max ?? spec.max}
                    step={spec.step ?? 1}
                    value={value}
                    onChange={(event) => {
                      void handleFieldChange(spec, event.target.value);
                    }}
                    className="w-full rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
                  />
                </label>
              );
            })}
          </div>
        </Section>
      )}

      {parameterGroups.length > 0 && (
        <Section title="All Settings">
          <div className="space-y-3">
            <input
              type="text"
              value={settingsFilter}
              onChange={(event) => setSettingsFilter(event.target.value)}
              placeholder="Filter settings by name or key"
              className="w-full rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
            />

            {filteredParameterGroups.length === 0 && (
              <div className="text-[10px] text-fg-dim">No settings match this filter.</div>
            )}

            {filteredParameterGroups.map((group, groupIndex) => (
              <details
                key={group.category}
                open={settingsFilter.trim().length > 0 || groupIndex === 0}
                className="rounded border border-border bg-surface-200/40 p-3"
              >
                <summary className="cursor-pointer list-none text-xs font-medium text-foreground">
                  <div className="flex items-center justify-between gap-3">
                    <span>{group.label}</span>
                    <span className="rounded bg-surface-300 px-1.5 py-0.5 text-[10px] text-fg-dim">
                      {group.definitions.length}
                    </span>
                  </div>
                </summary>
                <div className="mt-3 space-y-3 border-t border-border/40 pt-3">
                  {group.definitions.map((definition) => (
                    <ParameterEditorRow
                      key={definition.key}
                      definition={definition}
                      value={getEffectiveParameterValue(delta, definition)}
                      isOverridden={Object.prototype.hasOwnProperty.call(delta, definition.key)}
                      onChange={(nextValue) => {
                        void commitParameterValue(definition, nextValue);
                      }}
                    />
                  ))}
                </div>
              </details>
            ))}
          </div>
        </Section>
      )}

      <Section title="Overrides">
        {!config && deltaEntries.length === 0 && (
          <div className="text-[10px] text-fg-dim">No preset assigned yet.</div>
        )}
        {config && deltaEntries.length === 0 && (
          <div className="text-[10px] text-fg-dim">Using studio defaults with no overrides.</div>
        )}
        {deltaEntries.map(([key, value]) => {
          const definition = parameterDefinitions.find((entry) => entry.key === key);
          const isOverridden = definition ? !areValuesEqual(definition.defaultValue, value) : true;
          return (
            <div key={key} className="flex items-center justify-between border-b border-border/30 py-1">
              <div className="flex items-center gap-2">
                <span className="w-32 truncate text-[11px] text-fg-dim">
                  {definition?.label ?? key}
                </span>
                <span className={`text-xs ${isOverridden ? 'font-medium text-foreground' : 'text-fg-dim'}`}>
                  {typeof value === 'boolean' ? (value ? 'true' : 'false') : formatValue(value)}
                </span>
              </div>
              {isOverridden && definition && (
                <span className="text-[9px] text-fg-dim" title={`Default: ${formatValue(definition.defaultValue)}`}>
                  <RotateCcw className="inline h-3 w-3" />
                </span>
              )}
            </div>
          );
        })}
      </Section>

      {parameterGroups.length === 0 && (
        <Section title="Settings">
          <div className="text-[10px] text-fg-dim">
            No parameter metadata is mapped to this node type yet.
          </div>
        </Section>
      )}
    </div>
  );
}

function OutputDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((state) => state.flowNodes.find((entry) => entry.id === nodeId));
  const nodeConfigs = useFlowStore((state) => state.nodeConfigs);
  const resolvedPaths = useFlowStore((state) => state.resolvedPaths);
  const setResolvedPathEnabled = useFlowStore((state) => state.setResolvedPathEnabled);
  const setOutputPathsEnabled = useFlowStore((state) => state.setOutputPathsEnabled);
  const updateNodeLabel = useFlowStore((state) => state.updateNodeLabel);

  const listRef = useRef<HTMLDivElement | null>(null);
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const dragOriginRef = useRef<{ x: number; y: number } | null>(null);
  const draggedRef = useRef(false);
  const [selectedPathKeys, setSelectedPathKeys] = useState<Set<string>>(new Set());
  const [marqueeRect, setMarqueeRect] = useState<MarqueeRect | null>(null);

  const config = node?.config_id ? nodeConfigs.find((entry) => entry.id === node.config_id) ?? null : null;
  const format = (config?.delta?.format as string) ?? 'EXR';
  const pathsToThis = useMemo(
    () => resolvedPaths.filter((path) => path.outputNodeId === nodeId),
    [nodeId, resolvedPaths]
  );
  const enabledCount = pathsToThis.filter((path) => path.enabled).length;
  const selectedCount = selectedPathKeys.size;

  useEffect(() => {
    setSelectedPathKeys(new Set());
    setMarqueeRect(null);
  }, [nodeId]);

  useEffect(() => {
    setSelectedPathKeys((previous) => {
      const next = new Set([...previous].filter((pathKey) => pathsToThis.some((path) => path.pathKey === pathKey)));
      if (next.size !== previous.size) {
        return next;
      }

      for (const pathKey of previous) {
        if (!next.has(pathKey)) {
          return next;
        }
      }

      return previous;
    });
  }, [pathsToThis]);

  if (!node) {
    return <EmptyPanel />;
  }

  const updateMarqueeSelection = (currentPoint: { x: number; y: number }) => {
    if (!listRef.current || !dragOriginRef.current) {
      return;
    }

    const nextRect = normalizeMarquee(dragOriginRef.current, currentPoint);
    setMarqueeRect(nextRect);

    const containerRect = listRef.current.getBoundingClientRect();
    const nextSelection = new Set<string>();

    for (const path of pathsToThis) {
      const item = itemRefs.current[path.pathKey];
      if (!item) {
        continue;
      }

      const itemRect = item.getBoundingClientRect();
      const relativeRect: MarqueeRect = {
        x: itemRect.left - containerRect.left,
        y: itemRect.top - containerRect.top,
        width: itemRect.width,
        height: itemRect.height,
      };

      if (intersectsRect(nextRect, relativeRect)) {
        nextSelection.add(path.pathKey);
      }
    }

    setSelectedPathKeys(nextSelection);
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !listRef.current) {
      return;
    }

    const target = event.target as HTMLElement;
    if (target.closest('[data-toggle-button="true"]')) {
      return;
    }

    event.preventDefault();
    const rect = listRef.current.getBoundingClientRect();
    dragOriginRef.current = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
    draggedRef.current = false;
    setMarqueeRect({
      x: dragOriginRef.current.x,
      y: dragOriginRef.current.y,
      width: 0,
      height: 0,
    });
    listRef.current.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragOriginRef.current || !listRef.current) {
      return;
    }

    const rect = listRef.current.getBoundingClientRect();
    const currentPoint = {
      x: Math.max(0, Math.min(rect.width, event.clientX - rect.left)),
      y: Math.max(0, Math.min(rect.height, event.clientY - rect.top)),
    };
    draggedRef.current = true;
    updateMarqueeSelection(currentPoint);
  };

  const clearMarqueeState = (pointerId?: number) => {
    if (listRef.current && pointerId !== undefined && listRef.current.hasPointerCapture(pointerId)) {
      listRef.current.releasePointerCapture(pointerId);
    }
    dragOriginRef.current = null;
    draggedRef.current = false;
    setMarqueeRect(null);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;

    if (!draggedRef.current) {
      const row = target.closest<HTMLElement>('[data-path-key]');
      if (row?.dataset.pathKey) {
        setSelectedPathKeys(new Set([row.dataset.pathKey]));
      }
    }

    clearMarqueeState(event.pointerId);
  };

  const handlePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    clearMarqueeState(event.pointerId);
  };

  const handleBulkToggle = async (enabled: boolean) => {
    if (selectedPathKeys.size === 0) {
      return;
    }

    await setOutputPathsEnabled(nodeId, [...selectedPathKeys], enabled);
  };

  return (
    <div className="p-4 space-y-5">
      <NodeHeader label={node.label} type="output" />

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(event) => updateNodeLabel(nodeId, event.target.value)}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>

      <Section title="Resolved Paths">
        <div className="flex items-center justify-between gap-3 text-xs text-fg-dim">
          <span>
            {enabledCount} / {pathsToThis.length} active
          </span>
          <span>{selectedCount} selected</span>
        </div>
      </Section>

      <Section title="Output Format">
        <div className="font-mono text-xs text-foreground">{format}</div>
      </Section>

      <Section title={`Output Paths (${pathsToThis.length})`}>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                void handleBulkToggle(true);
              }}
              disabled={selectedCount === 0}
              className="rounded border border-border bg-surface-300 px-2 py-1 text-[10px] text-foreground hover:bg-surface-400 disabled:opacity-40 disabled:hover:bg-surface-300"
            >
              Enable Selected
            </button>
            <button
              type="button"
              onClick={() => {
                void handleBulkToggle(false);
              }}
              disabled={selectedCount === 0}
              className="rounded border border-border bg-surface-300 px-2 py-1 text-[10px] text-foreground hover:bg-surface-400 disabled:opacity-40 disabled:hover:bg-surface-300"
            >
              Disable Selected
            </button>
            <button
              type="button"
              onClick={() => setSelectedPathKeys(new Set())}
              disabled={selectedCount === 0}
              className="rounded px-2 py-1 text-[10px] text-fg-dim hover:text-foreground disabled:opacity-40"
            >
              Clear
            </button>
          </div>

          <div className="text-[10px] text-fg-dim">
            Drag across the list to marquee-select multiple outputs.
          </div>

          <div
            ref={listRef}
            className="relative space-y-1.5 rounded border border-border bg-surface-200/40 p-2 select-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerCancel}
          >
            {pathsToThis.map((path) => {
              const isSelected = selectedPathKeys.has(path.pathKey);

              return (
                <div
                  key={path.pathKey}
                  ref={(element) => {
                    itemRefs.current[path.pathKey] = element;
                  }}
                  data-path-key={path.pathKey}
                  className={`flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left transition ${
                    isSelected
                      ? 'border-brand bg-brand/10'
                      : path.enabled
                        ? 'border-border bg-surface-300 hover:bg-surface-400'
                        : 'border-border/50 bg-surface-300/50 text-fg-dim hover:bg-surface-400/60'
                  }`}
                >
                  <button
                    type="button"
                    data-toggle-button="true"
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      void setResolvedPathEnabled(path.pathKey, nodeId, !path.enabled);
                    }}
                    className="shrink-0"
                  >
                    {path.enabled ? (
                      <ToggleRight className="h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <ToggleLeft className="h-4 w-4 shrink-0 text-fg-dim" />
                    )}
                  </button>
                  <div className="min-w-0">
                    <div className="truncate font-mono text-[10px]">{path.filename}</div>
                    <div className="truncate text-[10px] text-fg-dim">{path.cameraName || '—'}</div>
                  </div>
                </div>
              );
            })}

            {marqueeRect && (
              <div
                className="pointer-events-none absolute border border-brand bg-brand/10"
                style={{
                  left: marqueeRect.x,
                  top: marqueeRect.y,
                  width: marqueeRect.width,
                  height: marqueeRect.height,
                }}
              />
            )}
          </div>
        </div>

        {pathsToThis.length === 0 && (
          <div className="text-[10px] text-fg-dim">No paths reach this output.</div>
        )}
      </Section>
    </div>
  );
}

function ParameterEditorRow({
  definition,
  value,
  isOverridden,
  onChange,
}: {
  definition: ParameterDefinition;
  value: unknown;
  isOverridden: boolean;
  onChange: (nextValue: unknown) => void;
}) {
  return (
    <div className="space-y-1.5 rounded border border-border/40 bg-surface-300/40 p-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-[11px] font-medium text-foreground">{definition.label}</div>
          <div className="truncate font-mono text-[10px] text-fg-dim">{definition.key}</div>
        </div>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] ${isOverridden ? 'bg-brand/15 text-brand' : 'bg-surface-200 text-fg-dim'}`}>
          {isOverridden ? 'Override' : 'Default'}
        </span>
      </div>

      {(definition.type === 'int' || definition.type === 'float') && (
        <input
          type="number"
          min={definition.min}
          max={definition.max}
          step={definition.type === 'int' ? 1 : 0.01}
          value={typeof value === 'number' ? value : formatInputValue(value, definition)}
          onChange={(event) => {
            const nextValue = parseParameterInputValue(event.target.value, definition);
            if (nextValue !== null) {
              onChange(nextValue);
            }
          }}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      )}

      {definition.type === 'bool' && (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className="flex items-center gap-2 rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground hover:bg-surface-400"
        >
          {value ? (
            <ToggleRight className="h-4 w-4 text-emerald-400" />
          ) : (
            <ToggleLeft className="h-4 w-4 text-fg-dim" />
          )}
          <span>{value ? 'Enabled' : 'Disabled'}</span>
        </button>
      )}

      {definition.type === 'enum' && (
        <select
          value={formatInputValue(value, definition)}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
        >
          {(definition.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      )}

      {(definition.type === 'string' || definition.type === 'ref' || definition.type === 'color') && (
        <input
          type="text"
          value={formatInputValue(value, definition)}
          onChange={(event) => {
            const nextValue = parseParameterInputValue(event.target.value, definition);
            if (nextValue !== null) {
              onChange(nextValue);
            }
          }}
          placeholder={definition.type === 'color' ? '255, 255, 255' : ''}
          className="w-full rounded border border-border bg-surface-300 px-2 py-1.5 text-xs text-foreground focus:border-brand focus:outline-none"
        />
      )}

      <div className="flex items-center justify-between gap-3 text-[10px] text-fg-dim">
        <span>Type: {definition.type}</span>
        <span className="truncate">Default: {formatValue(definition.defaultValue)}</span>
      </div>
    </div>
  );
}

function EmptyPanel() {
  return (
    <div className="flex h-full items-center justify-center p-4">
      <p className="text-center text-xs text-fg-dim">Select a node to view details</p>
    </div>
  );
}

function NodeHeader({ label, type }: { label: string; type: NodeType }) {
  const meta = NODE_TYPE_LABELS[type];
  const Icon = meta.icon;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${meta.color}`} />
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
      </div>
      <div className="mt-0.5">
        <span className={`text-[10px] font-medium ${meta.color}`}>{meta.label}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-[11px] font-medium uppercase tracking-wider text-fg-dim">{title}</h3>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-fg-dim">{label}</span>
      <span className="text-foreground">{value}</span>
    </div>
  );
}

function NodeRef({ nodeId, label, type }: { nodeId: string; label: string; type: NodeType }) {
  const selectNode = useFlowStore((state) => state.selectNode);
  const meta = NODE_TYPE_LABELS[type];
  const Icon = meta.icon;

  return (
    <button
      type="button"
      onClick={() => selectNode(nodeId)}
      className="flex w-full items-center gap-1.5 py-0.5 text-left text-xs text-fg-muted transition-colors hover:text-brand"
    >
      <Icon className={`h-3 w-3 ${meta.color}`} />
      {label}
    </button>
  );
}
