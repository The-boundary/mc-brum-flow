import { useFlowStore } from '@/stores/flowStore';
import { Camera, FolderOpen, Palette, RotateCcw, RefreshCcw, Maximize2, FileOutput, Box } from 'lucide-react';

export function DetailPanel() {
  const { selectionKind, selectionId } = useFlowStore();

  if (!selectionKind || !selectionId) return <EmptyPanel />;

  switch (selectionKind) {
    case 'shot': return <ShotDetail />;
    case 'container': return <ContainerDetail />;
    case 'camera': return <CameraDetail />;
    case 'sceneState': return <SceneStateDetail />;
    case 'resolution': return <ResolutionDetail />;
    case 'output': return <OutputDetail />;
    default: return <EmptyPanel />;
  }
}

// ── Shot Detail ──

function ShotDetail() {
  const {
    selectionId, shots, containers, cameras,
    getResolvedState, setOverride, clearOverride,
  } = useFlowStore();

  const shot = shots.find((s) => s.id === selectionId);
  if (!shot) return <EmptyPanel />;

  const cam = cameras.find((c) => c.id === shot.cameraId);
  const container = containers.find((c) => c.id === shot.containerId);
  const resolved = getResolvedState(shot);
  const hasOverride = (field: string) => field in shot.overrides;

  return (
    <div className="p-4 space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <Box className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-foreground">{shot.name}</h2>
        </div>
        <div className="flex items-center gap-1.5 mt-1 text-[11px] text-fg-dim">
          <FolderOpen className="w-3 h-3" />
          <span>{container?.name}</span>
          <span className="mx-1">·</span>
          <Camera className="w-3 h-3" />
          <span>{cam?.name}</span>
        </div>
      </div>

      <div className="aspect-video rounded-lg bg-surface-300 border border-border flex items-center justify-center">
        <span className="text-xs text-fg-dim">No render preview</span>
      </div>

      <Section title="Resolution">
        <div className="text-xs text-foreground">{shot.resolutionWidth} × {shot.resolutionHeight}</div>
      </Section>

      <Section title="Scene State">
        <Field label="Environment" value={resolved.environment} inherited={!hasOverride('environment')}
          onOverride={() => setOverride(shot.id, 'environment', resolved.environment)}
          onReset={() => clearOverride(shot.id, 'environment')} />
        <Field label="Lighting" value={resolved.lighting} inherited={!hasOverride('lighting')}
          onOverride={() => setOverride(shot.id, 'lighting', resolved.lighting)}
          onReset={() => clearOverride(shot.id, 'lighting')} />
        <Field label="Render Passes" value={String(resolved.renderPasses)} inherited={!hasOverride('renderPasses')}
          onOverride={() => setOverride(shot.id, 'renderPasses', resolved.renderPasses)}
          onReset={() => clearOverride(shot.id, 'renderPasses')} />
        <Field label="Noise Threshold" value={String(resolved.noiseThreshold)} inherited={!hasOverride('noiseThreshold')}
          onOverride={() => setOverride(shot.id, 'noiseThreshold', resolved.noiseThreshold)}
          onReset={() => clearOverride(shot.id, 'noiseThreshold')} />
        <Field label="Denoiser" value={resolved.denoiser} inherited={!hasOverride('denoiser')}
          onOverride={() => setOverride(shot.id, 'denoiser', resolved.denoiser)}
          onReset={() => clearOverride(shot.id, 'denoiser')} />
      </Section>

      <Section title="Layers">
        <TagList items={resolved.layers} />
      </Section>

      <Section title="Render Elements">
        <TagList items={resolved.renderElements} />
      </Section>

      <Section title="Output">
        <div className="text-xs text-fg-muted font-mono">{shot.outputPath}</div>
        <div className="text-xs text-fg-dim mt-1">Format: {shot.outputFormat}</div>
      </Section>
    </div>
  );
}

// ── Camera Detail ──

function CameraDetail() {
  const { selectionId, cameras, shots } = useFlowStore();
  const camera = cameras.find((c) => c.id === selectionId);
  if (!camera) return <EmptyPanel />;

  const usingShots = shots.filter((s) => s.cameraId === camera.id);

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Camera className="w-4 h-4 text-amber-400" />
        <h2 className="text-sm font-semibold text-foreground">{camera.name}</h2>
      </div>

      {camera.fov != null && (
        <Section title="Field of View">
          <div className="text-xs text-foreground">{camera.fov}°</div>
        </Section>
      )}

      <Section title={`Used by ${usingShots.length} shot${usingShots.length !== 1 ? 's' : ''}`}>
        {usingShots.map((shot) => (
          <ShotRef key={shot.id} shot={shot} />
        ))}
      </Section>
    </div>
  );
}

// ── Scene State Detail ──

function SceneStateDetail() {
  const { selectionId, sceneStates, containers, shots } = useFlowStore();
  const state = sceneStates.find((s) => s.id === selectionId);
  if (!state) return <EmptyPanel />;

  const usingContainers = containers.filter((c) => c.sceneStateId === state.id);
  const usingShots = shots.filter((s) => s.sceneStateId === state.id);

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Palette className="w-4 h-4 text-teal-400" />
        <h2 className="text-sm font-semibold text-foreground">{state.name}</h2>
      </div>

      <Section title="Settings">
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-fg-dim">Environment</span><span className="text-foreground">{state.environment}</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Lighting</span><span className="text-foreground">{state.lighting}</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Render Passes</span><span className="text-foreground">{state.renderPasses}</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Noise Threshold</span><span className="text-foreground">{state.noiseThreshold}</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Denoiser</span><span className="text-foreground">{state.denoiser}</span></div>
        </div>
      </Section>

      <Section title="Layers">
        <TagList items={state.layers} />
      </Section>

      <Section title="Render Elements">
        <TagList items={state.renderElements} />
      </Section>

      <Section title={`Used by ${usingContainers.length} container${usingContainers.length !== 1 ? 's' : ''}`}>
        {usingContainers.map((c) => (
          <div key={c.id} className="text-xs text-fg-muted py-0.5">
            <FolderOpen className="w-3 h-3 inline mr-1.5 text-fg-dim" />{c.name}
          </div>
        ))}
      </Section>

      {usingShots.length > 0 && (
        <Section title={`${usingShots.length} shot${usingShots.length !== 1 ? 's' : ''} with direct override`}>
          {usingShots.map((shot) => (
            <ShotRef key={shot.id} shot={shot} />
          ))}
        </Section>
      )}
    </div>
  );
}

// ── Resolution Detail ──

function ResolutionDetail() {
  const { selectionId, shots } = useFlowStore();
  if (!selectionId) return <EmptyPanel />;

  const [w, h] = selectionId.split('x').map(Number);
  const matchingShots = shots.filter((s) => s.resolutionWidth === w && s.resolutionHeight === h);
  const aspectRatio = gcd(w, h);

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <Maximize2 className="w-4 h-4 text-green-400" />
        <h2 className="text-sm font-semibold text-foreground">{w} × {h}</h2>
      </div>

      <Section title="Details">
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-fg-dim">Width</span><span className="text-foreground">{w} px</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Height</span><span className="text-foreground">{h} px</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Aspect Ratio</span><span className="text-foreground">{w / aspectRatio}:{h / aspectRatio}</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Megapixels</span><span className="text-foreground">{((w * h) / 1_000_000).toFixed(1)} MP</span></div>
        </div>
      </Section>

      <Section title={`Used by ${matchingShots.length} shot${matchingShots.length !== 1 ? 's' : ''}`}>
        {matchingShots.map((shot) => (
          <ShotRef key={shot.id} shot={shot} />
        ))}
      </Section>
    </div>
  );
}

// ── Output Detail ──

function OutputDetail() {
  const { selectionId, shots, containers, cameras } = useFlowStore();
  const shot = shots.find((s) => s.id === selectionId);
  if (!shot) return <EmptyPanel />;

  const container = containers.find((c) => c.id === shot.containerId);
  const cam = cameras.find((c) => c.id === shot.cameraId);

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <FileOutput className="w-4 h-4 text-purple-400" />
        <h2 className="text-sm font-semibold text-foreground">{shot.name}.{shot.outputFormat.toLowerCase()}</h2>
      </div>

      <Section title="Output Settings">
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-fg-dim">Format</span><span className="text-foreground">{shot.outputFormat}</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Path</span><span className="text-foreground font-mono text-[10px]">{shot.outputPath || '—'}</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Resolution</span><span className="text-foreground">{shot.resolutionWidth} × {shot.resolutionHeight}</span></div>
        </div>
      </Section>

      <Section title="Source">
        <div className="space-y-1.5 text-xs">
          <div className="flex justify-between"><span className="text-fg-dim">Shot</span><span className="text-foreground">{shot.name}</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Container</span><span className="text-foreground">{container?.name ?? '—'}</span></div>
          <div className="flex justify-between"><span className="text-fg-dim">Camera</span><span className="text-foreground">{cam?.name ?? '—'}</span></div>
        </div>
      </Section>

      <Section title="Output Path Template">
        <div className="text-xs text-fg-muted font-mono">{container?.outputPathTemplate ?? '—'}</div>
      </Section>
    </div>
  );
}

// ── Container Detail ──

function ContainerDetail() {
  const { selectionId, containers, sceneStates, shots } = useFlowStore();
  const container = containers.find((c) => c.id === selectionId);
  if (!container) return <EmptyPanel />;

  const state = sceneStates.find((s) => s.id === container.sceneStateId);
  const containerShots = shots.filter((s) => s.containerId === container.id);

  return (
    <div className="p-4 space-y-5">
      <div className="flex items-center gap-2">
        <FolderOpen className="w-4 h-4 text-brand" />
        <h2 className="text-sm font-semibold text-foreground">{container.name}</h2>
      </div>
      <div className="text-[11px] text-fg-dim">
        {containerShots.length} shot{containerShots.length !== 1 ? 's' : ''}
      </div>

      <Section title="Scene State">
        <div className="flex items-center gap-2">
          <Palette className="w-3.5 h-3.5 text-teal-400" />
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
          <ShotRef key={shot.id} shot={shot} />
        ))}
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-[11px] font-medium text-fg-dim uppercase tracking-wider mb-2">{title}</h3>
      {children}
    </div>
  );
}

function TagList({ items }: { items: string[] }) {
  if (!items.length) return <span className="text-[10px] text-fg-dim">None</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item) => (
        <span key={item} className="px-1.5 py-0.5 rounded bg-surface-300 border border-border text-[10px] text-fg-muted">
          {item}
        </span>
      ))}
    </div>
  );
}

function ShotRef({ shot }: { shot: { id: string; name: string } }) {
  const selectNode = useFlowStore((s) => s.selectNode);
  return (
    <button
      onClick={() => selectNode('shot', shot.id)}
      className="flex items-center gap-1.5 w-full text-left text-xs text-fg-muted py-0.5 hover:text-brand transition-colors"
    >
      <Box className="w-3 h-3 text-brand/60" />
      {shot.name}
    </button>
  );
}

function Field({
  label, value, inherited, onOverride, onReset,
}: {
  label: string; value: string; inherited: boolean; onOverride: () => void; onReset: () => void;
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
        {inherited ? <RefreshCcw className="w-3 h-3" /> : <RotateCcw className="w-3 h-3" />}
      </button>
    </div>
  );
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}
