import { useFlowStore } from '@/stores/flowStore';
import {
  Camera, FolderOpen, Sun, Contrast, Layers, RectangleHorizontal,
  Gauge, Server, AlertTriangle, FileOutput, RotateCcw, Eye, EyeOff,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import type { NodeType } from '@shared/types';

const NODE_TYPE_LABELS: Record<NodeType, { label: string; color: string; icon: typeof Camera }> = {
  camera:      { label: 'Camera',        color: 'text-emerald-400', icon: Camera },
  group:       { label: 'Group',         color: 'text-orange-400',  icon: FolderOpen },
  lightSetup:  { label: 'Light Setup',   color: 'text-amber-400',   icon: Sun },
  toneMapping: { label: 'Tone Mapping',  color: 'text-blue-400',    icon: Contrast },
  layerSetup:  { label: 'Layer Setup',   color: 'text-cyan-400',    icon: Layers },
  aspectRatio: { label: 'Aspect Ratio',  color: 'text-teal-400',    icon: RectangleHorizontal },
  stageRev:    { label: 'Stage Rev',     color: 'text-green-400',   icon: Gauge },
  override:    { label: 'Override',      color: 'text-red-400',     icon: AlertTriangle },
  deadline:    { label: 'Deadline',      color: 'text-purple-400',  icon: Server },
  output:      { label: 'Output',        color: 'text-fuchsia-400', icon: FileOutput },
};

export function DetailPanel() {
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const flowNodes = useFlowStore((s) => s.flowNodes);

  if (!selectedNodeId) return <EmptyPanel />;
  const node = flowNodes.find((n) => n.id === selectedNodeId);
  if (!node) return <EmptyPanel />;

  switch (node.type) {
    case 'camera':   return <CameraDetail nodeId={node.id} />;
    case 'group':    return <GroupDetail nodeId={node.id} />;
    case 'output':   return <OutputDetail nodeId={node.id} />;
    case 'override': return <ProcessingDetail nodeId={node.id} />;
    default:         return <ProcessingDetail nodeId={node.id} />;
  }
}

// ── Camera Detail ──

function CameraDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((s) => s.flowNodes.find((n) => n.id === nodeId));
  const cameras = useFlowStore((s) => s.cameras);
  const updateNodeLabel = useFlowStore((s) => s.updateNodeLabel);

  if (!node) return <EmptyPanel />;
  const camera = node.camera_id ? cameras.find((c) => c.id === node.camera_id) : null;
  const meta = NODE_TYPE_LABELS.camera;

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
        <div className="flex items-center gap-2 p-2 rounded bg-red-400/10 border border-red-400/30">
          <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
          <span className="text-xs text-red-300">Camera has been removed from the scene</span>
        </div>
      )}

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(e) => updateNodeLabel(nodeId, e.target.value)}
          className="w-full px-2 py-1 rounded bg-surface-300 border border-border text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>
    </div>
  );
}

// ── Group Detail ──

function GroupDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((s) => s.flowNodes.find((n) => n.id === nodeId));
  const flowEdges = useFlowStore((s) => s.flowEdges);
  const flowNodes = useFlowStore((s) => s.flowNodes);
  const updateNodeLabel = useFlowStore((s) => s.updateNodeLabel);
  const toggleHidePrevious = useFlowStore((s) => s.toggleHidePrevious);
  const resolvedPaths = useFlowStore((s) => s.resolvedPaths);

  if (!node) return <EmptyPanel />;

  const incomingEdges = flowEdges.filter((e) => e.target === nodeId);
  const incomingNodes = incomingEdges.map((e) => flowNodes.find((n) => n.id === e.source)).filter(Boolean);
  const pathsThrough = resolvedPaths.filter((p) => p.nodeIds.includes(nodeId));

  return (
    <div className="p-4 space-y-5">
      <NodeHeader label={node.label} type="group" />

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(e) => updateNodeLabel(nodeId, e.target.value)}
          className="w-full px-2 py-1 rounded bg-surface-300 border border-border text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>

      <Section title="Visibility">
        <button
          onClick={() => toggleHidePrevious(nodeId)}
          className="flex items-center gap-2 px-2 py-1.5 rounded bg-surface-300 border border-border text-xs hover:bg-surface-400 transition w-full"
        >
          {node.hide_previous
            ? <><EyeOff className="w-3.5 h-3.5 text-fg-dim" /> <span>Previous nodes hidden</span></>
            : <><Eye className="w-3.5 h-3.5 text-fg-dim" /> <span>Previous nodes visible</span></>
          }
        </button>
      </Section>

      <Section title={`Inputs (${incomingNodes.length})`}>
        {incomingNodes.map((n) => n && (
          <NodeRef key={n.id} nodeId={n.id} label={n.label} type={n.type} />
        ))}
        {incomingNodes.length === 0 && <span className="text-[10px] text-fg-dim">No inputs connected</span>}
      </Section>

      <Section title={`Paths through (${pathsThrough.length})`}>
        {pathsThrough.slice(0, 10).map((p, i) => (
          <div key={i} className="text-[10px] text-fg-muted py-0.5 font-mono truncate">{p.filename}</div>
        ))}
        {pathsThrough.length > 10 && (
          <div className="text-[10px] text-fg-dim">+{pathsThrough.length - 10} more</div>
        )}
      </Section>
    </div>
  );
}

// ── Processing Node Detail (Light, ToneMap, Layer, AspectRatio, StageRev, Deadline, Override) ──

function ProcessingDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((s) => s.flowNodes.find((n) => n.id === nodeId));
  const nodeConfigs = useFlowStore((s) => s.nodeConfigs);
  const studioDefaults = useFlowStore((s) => s.studioDefaults);
  const updateNodeLabel = useFlowStore((s) => s.updateNodeLabel);

  if (!node) return <EmptyPanel />;

  const config = node.config_id ? nodeConfigs.find((c) => c.id === node.config_id) : null;
  const delta = config?.delta ?? {};
  const deltaEntries = Object.entries(delta);

  // Find relevant studio defaults category based on node type
  const categoryMap: Partial<Record<NodeType, string>> = {
    lightSetup: 'environment',
    toneMapping: 'tone_mapping',
    layerSetup: 'layers',
    aspectRatio: 'scene_output',
    stageRev: 'scene_output',
    deadline: 'corona_renderer',
    override: 'corona_renderer',
  };

  const defaultCategory = categoryMap[node.type] ?? 'corona_renderer';
  const defaults = studioDefaults.find((d) => d.category === defaultCategory);
  const defaultSettings = defaults?.settings ?? {};

  return (
    <div className="p-4 space-y-5">
      <NodeHeader label={node.label} type={node.type} />

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(e) => updateNodeLabel(nodeId, e.target.value)}
          className="w-full px-2 py-1 rounded bg-surface-300 border border-border text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>

      {config && (
        <Section title={`Preset: ${config.label}`}>
          <div className="text-[10px] text-fg-dim mb-2">
            {deltaEntries.length} override{deltaEntries.length !== 1 ? 's' : ''} from studio defaults
          </div>
        </Section>
      )}

      <Section title="Settings">
        {deltaEntries.length === 0 && !config && (
          <div className="text-[10px] text-fg-dim">No preset assigned. Right-click node to assign one.</div>
        )}
        {deltaEntries.length === 0 && config && (
          <div className="text-[10px] text-fg-dim">Using studio defaults (no overrides)</div>
        )}
        {deltaEntries.map(([key, value]) => {
          const defaultValue = defaultSettings[key];
          const isOverridden = defaultValue !== undefined && defaultValue !== value;
          return (
            <div key={key} className="flex items-center justify-between py-1 border-b border-border/30">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-fg-dim w-32 truncate">{key}</span>
                <span className={`text-xs ${isOverridden ? 'text-foreground font-medium' : 'text-fg-dim'}`}>
                  {typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value)}
                </span>
              </div>
              {isOverridden && (
                <span className="text-[9px] text-fg-dim" title={`Default: ${String(defaultValue)}`}>
                  <RotateCcw className="w-3 h-3 inline" />
                </span>
              )}
            </div>
          );
        })}
      </Section>

      {Object.keys(defaultSettings).length > 0 && (
        <Section title="Studio Defaults">
          <div className="text-[10px] text-fg-dim mb-1">Category: {defaultCategory}</div>
          {Object.entries(defaultSettings).slice(0, 8).map(([key, value]) => (
            <div key={key} className="flex justify-between py-0.5 text-[10px]">
              <span className="text-fg-dim truncate w-32">{key}</span>
              <span className="text-fg-muted">{String(value)}</span>
            </div>
          ))}
          {Object.keys(defaultSettings).length > 8 && (
            <div className="text-[10px] text-fg-dim mt-1">+{Object.keys(defaultSettings).length - 8} more fields</div>
          )}
        </Section>
      )}
    </div>
  );
}

// ── Output Detail ──

function OutputDetail({ nodeId }: { nodeId: string }) {
  const node = useFlowStore((s) => s.flowNodes.find((n) => n.id === nodeId));
  const nodeConfigs = useFlowStore((s) => s.nodeConfigs);
  const setResolvedPathEnabled = useFlowStore((s) => s.setResolvedPathEnabled);
  const updateNodeLabel = useFlowStore((s) => s.updateNodeLabel);
  const resolvedPaths = useFlowStore((s) => s.resolvedPaths);

  if (!node) return <EmptyPanel />;

  const config = node.config_id ? nodeConfigs.find((c) => c.id === node.config_id) : null;
  const format = (config?.delta?.format as string) ?? 'EXR';
  const pathsToThis = resolvedPaths.filter((p) => p.outputNodeId === nodeId);
  const enabledCount = pathsToThis.filter((path) => path.enabled).length;

  return (
    <div className="p-4 space-y-5">
      <NodeHeader label={node.label} type="output" />

      <Section title="Label">
        <input
          type="text"
          value={node.label}
          onChange={(e) => updateNodeLabel(nodeId, e.target.value)}
          className="w-full px-2 py-1 rounded bg-surface-300 border border-border text-xs text-foreground focus:border-brand focus:outline-none"
        />
      </Section>

      <Section title="Resolved Paths">
        <div className="text-xs text-fg-dim">
          {enabledCount} / {pathsToThis.length} active
        </div>
      </Section>

      <Section title="Output Format">
        <div className="text-xs text-foreground font-mono">{format}</div>
      </Section>

      <Section title={`Output Paths (${pathsToThis.length})`}>
        <div className="space-y-1.5">
          {pathsToThis.map((path) => (
            <button
              key={path.pathKey}
              onClick={() => void setResolvedPathEnabled(path.pathKey, nodeId, !path.enabled)}
              className={`flex items-center gap-2 w-full px-2 py-1.5 rounded border text-left transition ${
                path.enabled
                  ? 'border-border bg-surface-300 hover:bg-surface-400'
                  : 'border-border/50 bg-surface-300/50 text-fg-dim hover:bg-surface-400/60'
              }`}
            >
              {path.enabled
                ? <ToggleRight className="w-4 h-4 text-emerald-400 shrink-0" />
                : <ToggleLeft className="w-4 h-4 text-fg-dim shrink-0" />
              }
              <span className="text-[10px] font-mono truncate">{path.filename}</span>
            </button>
          ))}
        </div>
        {pathsToThis.length === 0 && (
          <div className="text-[10px] text-fg-dim">No paths reach this output</div>
        )}
      </Section>
    </div>
  );
}

// ── Shared Components ──

function EmptyPanel() {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <p className="text-xs text-fg-dim text-center">Select a node to view details</p>
    </div>
  );
}

function NodeHeader({ label, type }: { label: string; type: NodeType }) {
  const meta = NODE_TYPE_LABELS[type];
  const Icon = meta.icon;
  return (
    <div>
      <div className="flex items-center gap-2">
        <Icon className={`w-4 h-4 ${meta.color}`} />
        <h2 className="text-sm font-semibold text-foreground">{label}</h2>
      </div>
      <div className="mt-0.5">
        <span className={`text-[10px] ${meta.color} font-medium`}>{meta.label}</span>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-medium text-fg-dim uppercase tracking-wider mb-2">{title}</h3>
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
  const selectNode = useFlowStore((s) => s.selectNode);
  const meta = NODE_TYPE_LABELS[type];
  const Icon = meta.icon;
  return (
    <button
      onClick={() => selectNode(nodeId)}
      className="flex items-center gap-1.5 w-full text-left text-xs text-fg-muted py-0.5 hover:text-brand transition-colors"
    >
      <Icon className={`w-3 h-3 ${meta.color}`} />
      {label}
    </button>
  );
}
