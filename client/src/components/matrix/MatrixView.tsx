import { ToggleLeft, ToggleRight } from 'lucide-react';
import { useFlowStore, type ResolvedPath } from '@/stores/flowStore';

export function MatrixView() {
  const resolvedPaths = useFlowStore((s) => s.resolvedPaths);
  const selectNode = useFlowStore((s) => s.selectNode);
  const toggleOutputEnabled = useFlowStore((s) => s.toggleOutputEnabled);
  const pathCount = useFlowStore((s) => s.pathCount);

  const enabledCount = resolvedPaths.filter((p) => p.enabled).length;

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-3 py-2 border-b border-border bg-surface-100/50 flex items-center gap-2 text-xs text-fg-dim shrink-0">
        <span>{enabledCount} / {pathCount} renders active</span>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[40px_minmax(200px,1fr)_120px_120px_120px_120px_120px_100px_80px] gap-px border-b border-border bg-surface-75 text-[10px] font-medium text-fg-dim uppercase tracking-wider shrink-0">
        <div className="px-2 py-2">On</div>
        <div className="px-3 py-2">Filename</div>
        <div className="px-3 py-2">Camera</div>
        <div className="px-3 py-2">Light Setup</div>
        <div className="px-3 py-2">Tone Mapping</div>
        <div className="px-3 py-2">Layer Setup</div>
        <div className="px-3 py-2">Aspect Ratio</div>
        <div className="px-3 py-2">Stage Rev</div>
        <div className="px-3 py-2">Format</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {resolvedPaths.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-fg-dim">No output paths. Build a pipeline in the Flow view.</span>
          </div>
        ) : (
          resolvedPaths.map((path, i) => (
            <PathRow
              key={i}
              path={path}
              onSelect={() => {
                const outputNodeId = path.nodeIds[path.nodeIds.length - 1];
                selectNode(outputNodeId);
              }}
              onToggle={() => {
                const outputNodeId = path.nodeIds[path.nodeIds.length - 1];
                toggleOutputEnabled(outputNodeId);
              }}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PathRow({ path, onSelect, onToggle }: { path: ResolvedPath; onSelect: () => void; onToggle: () => void }) {
  // Extract per-stage labels from resolvedConfig
  const lightSetup = (path.resolvedConfig?.lightSetup as string) ?? '—';
  const toneMapping = (path.resolvedConfig?.toneMapping as string) ?? '—';
  const layerSetup = (path.resolvedConfig?.layerSetup as string) ?? '—';
  const aspectRatio = (path.resolvedConfig?.aspectRatio as string) ?? '—';
  const stageRev = (path.resolvedConfig?.stageRev as string) ?? '—';
  const format = (path.resolvedConfig?.format as string) ?? 'EXR';

  return (
    <div
      className={`grid grid-cols-[40px_minmax(200px,1fr)_120px_120px_120px_120px_120px_100px_80px] gap-px border-b border-border-muted cursor-pointer transition-colors hover:bg-surface-300/30 ${
        !path.enabled ? 'opacity-40' : ''
      }`}
    >
      <div className="px-2 py-1.5 flex items-center">
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="p-0.5">
          {path.enabled
            ? <ToggleRight className="w-4 h-4 text-emerald-400" />
            : <ToggleLeft className="w-4 h-4 text-fg-dim" />
          }
        </button>
      </div>
      <div className="px-3 py-1.5 text-xs text-foreground font-mono truncate" onClick={onSelect}>
        {path.filename}
      </div>
      <div className="px-3 py-1.5 text-xs text-fg-muted" onClick={onSelect}>{path.cameraName || '—'}</div>
      <div className="px-3 py-1.5 text-xs text-fg-muted" onClick={onSelect}>{lightSetup}</div>
      <div className="px-3 py-1.5 text-xs text-fg-muted" onClick={onSelect}>{toneMapping}</div>
      <div className="px-3 py-1.5 text-xs text-fg-muted" onClick={onSelect}>{layerSetup}</div>
      <div className="px-3 py-1.5 text-xs text-fg-muted" onClick={onSelect}>{aspectRatio}</div>
      <div className="px-3 py-1.5 text-xs text-fg-muted" onClick={onSelect}>{stageRev}</div>
      <div className="px-3 py-1.5 text-xs text-fg-muted" onClick={onSelect}>{format}</div>
    </div>
  );
}
