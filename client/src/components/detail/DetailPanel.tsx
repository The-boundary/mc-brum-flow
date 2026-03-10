import { useFlowStore } from '@/stores/flowStore';
import { Camera, FolderOpen, Palette, RotateCcw, RefreshCcw } from 'lucide-react';

export function DetailPanel() {
  const {
    selectedShotId, selectedContainerId,
    shots, containers, cameras, sceneStates,
    getResolvedState, setOverride, clearOverride,
  } = useFlowStore();

  // Shot detail
  if (selectedShotId) {
    const shot = shots.find((s) => s.id === selectedShotId);
    if (!shot) return <EmptyPanel />;

    const cam = cameras.find((c) => c.id === shot.cameraId);
    const container = containers.find((c) => c.id === shot.containerId);
    const resolved = getResolvedState(shot);
    const hasOverride = (field: string) => field in shot.overrides;

    return (
      <div className="p-4 space-y-5">
        {/* Header */}
        <div>
          <h2 className="text-sm font-semibold text-foreground">{shot.name}</h2>
          <div className="flex items-center gap-1.5 mt-1 text-[11px] text-fg-dim">
            <FolderOpen className="w-3 h-3" />
            <span>{container?.name}</span>
            <span className="mx-1">·</span>
            <Camera className="w-3 h-3" />
            <span>{cam?.name}</span>
          </div>
        </div>

        {/* Thumbnail placeholder */}
        <div className="aspect-video rounded-lg bg-surface-300 border border-border flex items-center justify-center">
          <span className="text-xs text-fg-dim">No render preview</span>
        </div>

        {/* Resolution */}
        <Section title="Resolution">
          <div className="text-xs text-foreground">{shot.resolutionWidth} × {shot.resolutionHeight}</div>
        </Section>

        {/* Scene State fields */}
        <Section title="Scene State">
          <Field
            label="Environment"
            value={resolved.environment}
            inherited={!hasOverride('environment')}
            onOverride={() => setOverride(shot.id, 'environment', resolved.environment)}
            onReset={() => clearOverride(shot.id, 'environment')}
          />
          <Field
            label="Lighting"
            value={resolved.lighting}
            inherited={!hasOverride('lighting')}
            onOverride={() => setOverride(shot.id, 'lighting', resolved.lighting)}
            onReset={() => clearOverride(shot.id, 'lighting')}
          />
          <Field
            label="Render Passes"
            value={String(resolved.renderPasses)}
            inherited={!hasOverride('renderPasses')}
            onOverride={() => setOverride(shot.id, 'renderPasses', resolved.renderPasses)}
            onReset={() => clearOverride(shot.id, 'renderPasses')}
          />
          <Field
            label="Noise Threshold"
            value={String(resolved.noiseThreshold)}
            inherited={!hasOverride('noiseThreshold')}
            onOverride={() => setOverride(shot.id, 'noiseThreshold', resolved.noiseThreshold)}
            onReset={() => clearOverride(shot.id, 'noiseThreshold')}
          />
          <Field
            label="Denoiser"
            value={resolved.denoiser}
            inherited={!hasOverride('denoiser')}
            onOverride={() => setOverride(shot.id, 'denoiser', resolved.denoiser)}
            onReset={() => clearOverride(shot.id, 'denoiser')}
          />
        </Section>

        {/* Layers */}
        <Section title="Layers">
          <div className="flex flex-wrap gap-1">
            {resolved.layers.map((layer) => (
              <span key={layer} className="px-1.5 py-0.5 rounded bg-surface-300 border border-border text-[10px] text-fg-muted">
                {layer}
              </span>
            ))}
          </div>
        </Section>

        {/* Render Elements */}
        <Section title="Render Elements">
          <div className="flex flex-wrap gap-1">
            {resolved.renderElements.map((el) => (
              <span key={el} className="px-1.5 py-0.5 rounded bg-surface-300 border border-border text-[10px] text-fg-muted">
                {el}
              </span>
            ))}
          </div>
        </Section>

        {/* Output */}
        <Section title="Output">
          <div className="text-xs text-fg-muted font-mono">{shot.outputPath}</div>
          <div className="text-xs text-fg-dim mt-1">Format: {shot.outputFormat}</div>
        </Section>
      </div>
    );
  }

  // Container detail
  if (selectedContainerId) {
    const container = containers.find((c) => c.id === selectedContainerId);
    if (!container) return <EmptyPanel />;

    const state = sceneStates.find((s) => s.id === container.sceneStateId);
    const containerShots = shots.filter((s) => s.containerId === container.id);

    return (
      <div className="p-4 space-y-5">
        <div>
          <h2 className="text-sm font-semibold text-foreground">{container.name}</h2>
          <div className="text-[11px] text-fg-dim mt-1">
            {containerShots.length} shot{containerShots.length !== 1 ? 's' : ''}
          </div>
        </div>

        <Section title="Scene State">
          <div className="flex items-center gap-2">
            <Palette className="w-3.5 h-3.5 text-brand" />
            <span className="text-xs text-foreground font-medium">{state?.name ?? 'None'}</span>
          </div>
          {state && (
            <div className="mt-2 space-y-1.5 text-xs text-fg-muted">
              <div>Environment: {state.environment}</div>
              <div>Lighting: {state.lighting}</div>
              <div>Passes: {state.renderPasses}</div>
              <div>Noise: {state.noiseThreshold}</div>
              <div>Denoiser: {state.denoiser}</div>
            </div>
          )}
        </Section>

        <Section title="Output Path Template">
          <div className="text-xs text-fg-muted font-mono">{container.outputPathTemplate}</div>
        </Section>

        <Section title="Shots">
          {containerShots.map((shot) => (
            <div key={shot.id} className="text-xs text-fg-muted py-0.5">{shot.name}</div>
          ))}
        </Section>
      </div>
    );
  }

  return <EmptyPanel />;
}

function EmptyPanel() {
  return (
    <div className="h-full flex items-center justify-center p-4">
      <p className="text-xs text-fg-dim text-center">Select a shot or container to view details</p>
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

function Field({
  label,
  value,
  inherited,
  onOverride,
  onReset,
}: {
  label: string;
  value: string;
  inherited: boolean;
  onOverride: () => void;
  onReset: () => void;
}) {
  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-fg-dim w-28">{label}</span>
        <span className={`text-xs ${inherited ? 'text-fg-dim' : 'text-foreground'}`}>{value}</span>
      </div>
      <button
        onClick={inherited ? onOverride : onReset}
        className="p-0.5 rounded text-fg-dim hover:text-brand hover:bg-surface-400 transition"
        title={inherited ? 'Override this field' : 'Reset to inherited'}
      >
        {inherited ? (
          <RefreshCcw className="w-3 h-3" />
        ) : (
          <RotateCcw className="w-3 h-3" />
        )}
      </button>
    </div>
  );
}
