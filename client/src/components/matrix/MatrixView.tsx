import { ChevronRight, ChevronDown, FolderOpen, Folder } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';

const STATE_COLORS: Record<string, string> = {
  amber: 'bg-amber-400/15 text-amber-300 border-amber-400/30',
  blue: 'bg-blue-400/15 text-blue-300 border-blue-400/30',
  teal: 'bg-teal-400/15 text-teal-300 border-teal-400/30',
  purple: 'bg-purple-400/15 text-purple-300 border-purple-400/30',
};

export function MatrixView() {
  const {
    shots, containers, cameras, sceneStates,
    selectedShotId, selectedContainerId,
    selectShot, selectContainer, toggleContainer,
    getResolvedState,
  } = useFlowStore();

  return (
    <div className="h-full flex flex-col">
      {/* Column headers */}
      <div className="grid grid-cols-[minmax(240px,1fr)_140px_120px_100px_80px_80px_80px] gap-px border-b border-border bg-surface-75 text-[11px] font-medium text-fg-dim uppercase tracking-wider">
        <div className="px-3 py-2">Name</div>
        <div className="px-3 py-2">Camera</div>
        <div className="px-3 py-2">Resolution</div>
        <div className="px-3 py-2">State</div>
        <div className="px-3 py-2">Passes</div>
        <div className="px-3 py-2">Noise</div>
        <div className="px-3 py-2">Format</div>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {containers.map((container) => {
          const state = sceneStates.find((s) => s.id === container.sceneStateId);
          const stateColor = STATE_COLORS[state?.color ?? 'teal'] ?? STATE_COLORS.teal;
          const containerShots = shots.filter((s) => s.containerId === container.id);
          const isSelected = selectedContainerId === container.id;

          return (
            <div key={container.id}>
              {/* Container row */}
              <div
                className={`grid grid-cols-[minmax(240px,1fr)_140px_120px_100px_80px_80px_80px] gap-px border-b border-border-muted cursor-pointer transition-colors ${
                  isSelected ? 'bg-brand/8' : 'hover:bg-surface-300/50'
                }`}
                onClick={() => selectContainer(container.id)}
              >
                <div className="px-3 py-1.5 flex items-center gap-2">
                  <span
                    className="cursor-pointer p-0.5 rounded hover:bg-surface-400"
                    onClick={(e) => { e.stopPropagation(); toggleContainer(container.id); }}
                  >
                    {container.expanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-fg-dim" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-fg-dim" />
                    )}
                  </span>
                  {container.expanded ? (
                    <FolderOpen className="w-3.5 h-3.5 text-brand" />
                  ) : (
                    <Folder className="w-3.5 h-3.5 text-brand" />
                  )}
                  <span className="text-xs font-medium text-foreground">{container.name}</span>
                  <span className="text-[10px] text-fg-dim">({containerShots.length})</span>
                </div>
                <div className="px-3 py-1.5" />
                <div className="px-3 py-1.5" />
                <div className="px-3 py-1.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${stateColor}`}>
                    {state?.name ?? '—'}
                  </span>
                </div>
                <div className="px-3 py-1.5 text-xs text-fg-dim">{state?.renderPasses ?? '—'}</div>
                <div className="px-3 py-1.5 text-xs text-fg-dim">{state?.noiseThreshold ?? '—'}</div>
                <div className="px-3 py-1.5" />
              </div>

              {/* Shot rows */}
              {container.expanded && containerShots.map((shot) => {
                const cam = cameras.find((c) => c.id === shot.cameraId);
                const resolved = getResolvedState(shot);
                const isShotSelected = selectedShotId === shot.id;
                const hasOverride = (field: string) => field in shot.overrides;

                return (
                  <div
                    key={shot.id}
                    className={`grid grid-cols-[minmax(240px,1fr)_140px_120px_100px_80px_80px_80px] gap-px border-b border-border-muted cursor-pointer transition-colors ${
                      isShotSelected ? 'bg-brand/8' : 'hover:bg-surface-300/30'
                    }`}
                    onClick={() => selectShot(shot.id)}
                  >
                    <div className="px-3 py-1.5 pl-10 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={shot.enabled}
                        onChange={(e) => e.stopPropagation()}
                        className="w-3 h-3 rounded border-border accent-brand"
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className="text-xs text-foreground">{shot.name}</span>
                    </div>
                    <div className="px-3 py-1.5 text-xs text-fg-muted">{cam?.name ?? '—'}</div>
                    <div className="px-3 py-1.5 text-xs text-fg-muted">{shot.resolutionWidth}×{shot.resolutionHeight}</div>
                    <div className="px-3 py-1.5">
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium border ${stateColor}`}>
                        {state?.name ?? '—'}
                      </span>
                    </div>
                    <div className={`px-3 py-1.5 text-xs ${hasOverride('renderPasses') ? 'text-foreground' : 'text-fg-dim'}`}>
                      {resolved.renderPasses}
                    </div>
                    <div className={`px-3 py-1.5 text-xs ${hasOverride('noiseThreshold') ? 'text-foreground' : 'text-fg-dim'}`}>
                      {resolved.noiseThreshold}
                    </div>
                    <div className="px-3 py-1.5 text-xs text-fg-muted">{shot.outputFormat}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
