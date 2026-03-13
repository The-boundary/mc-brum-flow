import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Layers,
  RotateCcw,
} from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';
import type { EditableFieldSpec, ParameterDefinition, ParameterGroupDefinition } from './types';
import {
  NODE_PARAMETER_GROUPS,
  NODE_TYPE_LABELS,
  PARAMETER_GROUP_LABELS,
  STAGE_REV_FIELDS,
  TONE_MAPPING_FIELDS,
} from './types';
import {
  areValuesEqual,
  formatValue,
  getEffectiveFieldValue,
  getEffectiveParameterValue,
  getFieldDefinition,
  isRecord,
  normalizeParameterDefinitions,
} from './utils';
import { EmptyPanel, NodeHeader, ParameterEditorRow, Section } from './components';

const STAGE_REV_PRESETS = [
  { label: 'Rev A', longestEdge: 1500 },
  { label: 'Rev B', longestEdge: 3000 },
  { label: 'Rev C', longestEdge: 6000 },
] as const;

const DEADLINE_TARGETS = [
  { label: 'Local', pool: 'local' },
  { label: 'Deadline Local', pool: 'deadline-local' },
  { label: 'Deadline Cloud', pool: 'deadline-cloud' },
] as const;

const ASPECT_RATIOS = [
  { label: '16:9', width: 3840, height: 2160 },
  { label: '4:3', width: 4000, height: 3000 },
  { label: '3:2', width: 4500, height: 3000 },
  { label: '2:1', width: 4096, height: 2048 },
  { label: '1:1', width: 3000, height: 3000 },
  { label: '9:16', width: 2160, height: 3840 },
  { label: '21:9', width: 5040, height: 2160 },
  { label: '2.39:1', width: 5040, height: 2109 },
] as const;

const TONE_MAPPING_PRESETS = [
  { label: 'WARM', delta: { whiteBalance: 5500, saturation: 1.1, contrast: 1.05 } },
  { label: 'COOL', delta: { whiteBalance: 7500, saturation: 0.95, contrast: 1 } },
  { label: 'NEUTRAL', delta: { whiteBalance: 6500, saturation: 1, contrast: 1 } },
  { label: 'HI-CON', delta: { whiteBalance: 6500, saturation: 1.2, contrast: 1.3 } },
  { label: 'DESAT', delta: { whiteBalance: 6500, saturation: 0.5, contrast: 1 } },
] as const;

const LIGHT_SETUP_PRESETS = [
  { label: 'DAY', delta: { skyType: 'Corona Sun + Sky', skyIntensity: 1, sunAngle: 45 } },
  { label: 'NIGHT', delta: { skyType: 'HDRI', skyIntensity: 0.3, iblMap: 'city_night_01.hdr' } },
  { label: 'OVERCAST', delta: { skyType: 'HDRI', skyIntensity: 0.7, iblMap: 'overcast_01.hdr' } },
  { label: 'SUNSET', delta: { skyType: 'Corona Sun + Sky', skyIntensity: 0.8, sunAngle: 10 } },
  { label: 'STUDIO', delta: { skyType: 'None', skyIntensity: 0, groundPlane: false } },
] as const;

export function ProcessingDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((state) => state.flowNodes.find((entry) => entry.id === nodeId));
  const nodeConfigs = useFlowStore((state) => state.nodeConfigs);
  const studioDefaults = useFlowStore((state) => state.studioDefaults);
  const flowEdges = useFlowStore((state) => state.flowEdges);
  const flowNodes = useFlowStore((state) => state.flowNodes);
  const assignNodeConfig = useFlowStore((state) => state.assignNodeConfig);
  const createNodeConfig = useFlowStore((state) => state.createNodeConfig);
  const updateNodeConfig = useFlowStore((state) => state.updateNodeConfig);
  const updateNodeLabel = useFlowStore((state) => state.updateNodeLabel);
  const refreshLayersFromMax = useFlowStore((state) => state.refreshLayersFromMax);
  const nodeType = node?.type ?? 'override';

  // For override nodes, determine the upstream node type to scope which settings are editable
  const upstreamNodeType = useMemo(() => {
    if (nodeType !== 'override') return null;
    const incomingEdges = flowEdges.filter((e) => e.target === nodeId);
    if (incomingEdges.length === 0) return null;
    // Find the direct upstream node (should be exactly one for override)
    const upstreamNode = flowNodes.find((n) => n.id === incomingEdges[0].source);
    if (!upstreamNode) return null;
    // If upstream is also an override, walk up to find the original processing node
    if (upstreamNode.type === 'override') {
      const visited = new Set<string>();
      let current = upstreamNode;
      while (current.type === 'override' && !visited.has(current.id)) {
        visited.add(current.id);
        const parentEdge = flowEdges.find((e) => e.target === current.id);
        if (!parentEdge) return null;
        const parent = flowNodes.find((n) => n.id === parentEdge.source);
        if (!parent) return null;
        current = parent;
      }
      return current.type === 'override' ? null : current.type;
    }
    return upstreamNode.type;
  }, [nodeType, nodeId, flowEdges, flowNodes]);

  // Override nodes use the upstream node's parameter groups; unconnected overrides show nothing
  const parameterGroupKeys = nodeType === 'override'
    ? (upstreamNodeType ? (NODE_PARAMETER_GROUPS[upstreamNodeType] ?? []) : [])
    : (NODE_PARAMETER_GROUPS[nodeType] ?? []);

  if (import.meta.env.DEV && nodeType !== 'override' && !(nodeType in NODE_PARAMETER_GROUPS)) {
    console.warn(`NODE_PARAMETER_GROUPS: no entry for node type "${nodeType}"`);
  }

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

  const handleAspectRatio = async (label: string, width: number, height: number) => {
    let preset = configsForType.find((entry) => entry.label === label) ?? null;

    if (!preset) {
      preset = await createNodeConfig('aspectRatio', label, { width, height });
    } else {
      preset = await updateNodeConfig(preset.id, {
        label,
        delta: { ...(preset.delta ?? {}), width, height },
      });
    }

    if (preset) {
      await assignNodeConfig(nodeId, preset.id);
    }
  };

  const handleToneMappingPreset = async (label: string, presetDelta: Record<string, unknown>) => {
    let preset = configsForType.find((entry) => entry.label === label) ?? null;

    if (!preset) {
      preset = await createNodeConfig('toneMapping', label, presetDelta);
    } else {
      preset = await updateNodeConfig(preset.id, {
        label,
        delta: { ...(preset.delta ?? {}), ...presetDelta },
      });
    }

    if (preset) {
      await assignNodeConfig(nodeId, preset.id);
    }
  };

  const handleLightSetupPreset = async (label: string, presetDelta: Record<string, unknown>) => {
    let preset = configsForType.find((entry) => entry.label === label) ?? null;

    if (!preset) {
      preset = await createNodeConfig('lightSetup', label, presetDelta);
    } else {
      preset = await updateNodeConfig(preset.id, {
        label,
        delta: { ...(preset.delta ?? {}), ...presetDelta },
      });
    }

    if (preset) {
      await assignNodeConfig(nodeId, preset.id);
    }
  };

  const handleDeadlineTarget = async (label: string, pool: string) => {
    let preset = configsForType.find((entry) => entry.label === label) ?? null;

    if (!preset) {
      preset = await createNodeConfig('deadline', label, { pool });
    } else {
      preset = await updateNodeConfig(preset.id, {
        label,
        delta: { ...(preset.delta ?? {}), pool },
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

      {/* Override nodes don't have presets */}
      {node.type === 'override' && !upstreamNodeType && (
        <Section title="Status">
          <div className="flex items-center gap-2 rounded border border-border/40 bg-surface-200/40 p-2">
            <AlertTriangle className="h-3.5 w-3.5 text-fg-dim" />
            <span className="text-xs text-fg-dim">Connect to a processing node to configure overrides.</span>
          </div>
        </Section>
      )}

      {node.type === 'override' && upstreamNodeType && (
        <Section title="Overriding">
          <div className="text-[10px] text-fg-dim">
            Overriding {NODE_TYPE_LABELS[upstreamNodeType]?.label ?? upstreamNodeType} settings
            {deltaEntries.length > 0 && ` — ${deltaEntries.length} override${deltaEntries.length === 1 ? '' : 's'}`}
          </div>
        </Section>
      )}

      {node.type !== 'override' && node.type !== 'stageRev' && node.type !== 'layerSetup' && node.type !== 'deadline' && node.type !== 'aspectRatio' && node.type !== 'toneMapping' && node.type !== 'lightSetup' && (
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
      )}

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


      {/* Light Setup: preset selection */}
      {node.type === 'lightSetup' && (
        <Section title="Lighting Preset">
          <div className="grid grid-cols-3 gap-2">
            {LIGHT_SETUP_PRESETS.map((preset) => {
              const isActive = config?.label === preset.label || node.label === preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    void handleLightSetupPreset(preset.label, { ...preset.delta });
                  }}
                  className={`rounded border px-2 py-1.5 text-xs transition ${
                    isActive
                      ? 'border-amber-400 bg-amber-400/10 text-amber-300'
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

      {/* Tone Mapping: preset selection */}
      {node.type === 'toneMapping' && (
        <Section title="Tone Mapping Preset">
          <div className="grid grid-cols-3 gap-2">
            {TONE_MAPPING_PRESETS.map((preset) => {
              const isActive = config?.label === preset.label || node.label === preset.label;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => {
                    void handleToneMappingPreset(preset.label, { ...preset.delta });
                  }}
                  className={`rounded border px-2 py-1.5 text-xs transition ${
                    isActive
                      ? 'border-cyan-400 bg-cyan-400/10 text-cyan-300'
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

      {/* Aspect Ratio: ratio selection */}
      {node.type === 'aspectRatio' && (
        <Section title="Aspect Ratio">
          <div className="grid grid-cols-4 gap-2">
            {ASPECT_RATIOS.map((ar) => {
              const isActive = config?.label === ar.label || node.label === ar.label;
              return (
                <button
                  key={ar.label}
                  type="button"
                  onClick={() => {
                    void handleAspectRatio(ar.label, ar.width, ar.height);
                  }}
                  className={`rounded border px-2 py-1.5 text-xs font-mono transition ${
                    isActive
                      ? 'border-teal-400 bg-teal-400/10 text-teal-300'
                      : 'border-border bg-surface-300 text-foreground hover:bg-surface-400'
                  }`}
                >
                  {ar.label}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* Deadline: render target selection */}
      {node.type === 'deadline' && (
        <Section title="Render Target">
          <div className="grid grid-cols-3 gap-2">
            {DEADLINE_TARGETS.map((target) => {
              const currentPool = (config?.delta?.pool as string) ?? '';
              const isActive = currentPool === target.pool || (!currentPool && target.pool === 'local');
              return (
                <button
                  key={target.pool}
                  type="button"
                  onClick={() => {
                    void handleDeadlineTarget(target.label, target.pool);
                  }}
                  className={`rounded border px-2 py-1.5 text-xs transition ${
                    isActive
                      ? 'border-purple-400 bg-purple-400/10 text-purple-300'
                      : 'border-border bg-surface-300 text-foreground hover:bg-surface-400'
                  }`}
                >
                  {target.label}
                </button>
              );
            })}
          </div>
        </Section>
      )}

      {/* Layer setup: show layers from the assigned config */}
      {node.type === 'layerSetup' && (
        <Section title="Layers">
          <div className="mb-2">
            <button
              type="button"
              onClick={() => { void refreshLayersFromMax(nodeId); }}
              className="flex items-center gap-1.5 rounded border border-border bg-surface-300 px-2 py-1 text-[10px] text-foreground transition hover:bg-surface-400"
            >
              <RotateCcw className="h-3 w-3" />
              Refresh from Max
            </button>
          </div>
          {config && Array.isArray(delta.layers) && (delta.layers as string[]).length > 0 ? (
            <div className="space-y-1">
              {(delta.layers as string[]).map((layer) => (
                <div key={layer} className="flex items-center gap-2 rounded border border-border/30 bg-surface-200/40 px-2 py-1">
                  <Layers className="h-3 w-3 text-cyan-400 shrink-0" />
                  <span className="text-xs text-foreground">{layer}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-fg-dim">No layers assigned. Click refresh to import from Max.</div>
          )}
        </Section>
      )}

      {/* stageRev: show current longest edge value read-only */}
      {node.type === 'stageRev' && config && (
        <Section title="Resolution">
          <div className="flex items-center justify-between rounded border border-border/30 bg-surface-200/40 px-2 py-1.5">
            <span className="text-xs text-fg-dim">Longest Edge</span>
            <span className="text-xs font-medium text-foreground font-mono">
              {typeof delta.longest_edge === 'number' ? delta.longest_edge : '—'}
            </span>
          </div>
          <div className="mt-1 text-[10px] text-fg-dim">
            Use an Override node to change render settings.
          </div>
        </Section>
      )}

      {/* Tone Mapping: dedicated slider section */}
      {node.type === 'toneMapping' && (
        <Section title="Tone Mapping">
          <div className="space-y-3">
            {TONE_MAPPING_FIELDS.map((spec) => {
              const definition = getFieldDefinition(parameterDefinitions, spec);
              const value = getEffectiveFieldValue(delta, definition, spec);
              return (
                <label key={spec.label} className="block">
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="text-foreground">{spec.label}</span>
                    <span className="font-mono text-[10px] text-fg-dim">{typeof value === 'number' ? value.toFixed(spec.step && spec.step < 1 ? 2 : 0) : value}</span>
                  </div>
                  <input
                    type="range"
                    min={definition.min ?? spec.min}
                    max={definition.max ?? spec.max}
                    step={spec.step ?? 1}
                    value={value}
                    onChange={(event) => {
                      void handleFieldChange(spec, event.target.value);
                    }}
                    className="w-full accent-brand"
                  />
                  <div className="flex justify-between text-[9px] text-fg-dim">
                    <span>{definition.min ?? spec.min}</span>
                    <span>{definition.max ?? spec.max}</span>
                  </div>
                </label>
              );
            })}
          </div>
        </Section>
      )}

      {/* All Settings: shown for override nodes and editable processing nodes (not stageRev, not deadline, not toneMapping) */}
      {node.type !== 'stageRev' && node.type !== 'deadline' && node.type !== 'toneMapping' && parameterGroups.length > 0 && (
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

      {/* Overrides summary: shown for non-stageRev, non-override nodes with a config */}
      {node.type !== 'stageRev' && node.type !== 'override' && (
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
      )}
    </div>
  );
}
