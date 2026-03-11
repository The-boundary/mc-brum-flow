import { useFlowStore, type ResolvedPath } from '@/stores/flowStore';
import { ToggleLeft, ToggleRight, FileOutput } from 'lucide-react';

export function OutputPreviewPanel() {
  const resolvedPaths = useFlowStore((s) => s.resolvedPaths);
  const pathCount = useFlowStore((s) => s.pathCount);
  const selectNode = useFlowStore((s) => s.selectNode);
  const setResolvedPathEnabled = useFlowStore((s) => s.setResolvedPathEnabled);
  const setAllResolvedPathsEnabled = useFlowStore((s) => s.setAllResolvedPathsEnabled);

  const enabledCount = resolvedPaths.filter((p) => p.enabled).length;

  return (
    <div className="h-full flex flex-col bg-surface-100">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <FileOutput className="w-3.5 h-3.5 text-fuchsia-400" />
          <span className="text-xs font-medium text-foreground">Output Preview</span>
          <span className="text-[10px] text-fg-dim">
            {enabledCount} / {pathCount} renders active
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => void setAllResolvedPathsEnabled(true)}
            className="px-2 py-0.5 rounded text-[10px] text-fg-muted hover:text-foreground hover:bg-surface-300 transition"
          >
            Enable All
          </button>
          <button
            onClick={() => void setAllResolvedPathsEnabled(false)}
            className="px-2 py-0.5 rounded text-[10px] text-fg-muted hover:text-foreground hover:bg-surface-300 transition"
          >
            Disable All
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {resolvedPaths.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-fg-dim">No output paths. Add camera → ... → output nodes to see paths.</span>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-surface-200 z-10">
              <tr className="border-b border-border">
                <th className="text-left px-3 py-1.5 text-[10px] text-fg-dim font-medium w-10">On</th>
                <th className="text-left px-3 py-1.5 text-[10px] text-fg-dim font-medium">Filename</th>
                <th className="text-left px-3 py-1.5 text-[10px] text-fg-dim font-medium w-28">Camera</th>
              </tr>
            </thead>
            <tbody>
              {resolvedPaths.map((path) => (
                <OutputRow
                  key={path.pathKey}
                  path={path}
                  onSelect={() => selectNode(path.outputNodeId)}
                  onToggle={() => void setResolvedPathEnabled(path.pathKey, path.outputNodeId, !path.enabled)}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function OutputRow({
  path, onSelect, onToggle,
}: {
  path: ResolvedPath; onSelect: () => void; onToggle: () => void;
}) {
  return (
    <tr
      className={`border-b border-border/30 cursor-pointer hover:bg-surface-200/50 transition ${
        !path.enabled ? 'opacity-40' : ''
      }`}
    >
      <td className="px-3 py-1.5">
        <button onClick={(e) => { e.stopPropagation(); onToggle(); }} className="p-0.5">
          {path.enabled
            ? <ToggleRight className="w-4 h-4 text-emerald-400" />
            : <ToggleLeft className="w-4 h-4 text-fg-dim" />
          }
        </button>
      </td>
      <td className="px-3 py-1.5 font-mono text-[10px] text-foreground truncate max-w-[400px]" onClick={onSelect}>
        {path.filename}
      </td>
      <td className="px-3 py-1.5 text-fg-muted" onClick={onSelect}>
        {path.cameraName || '—'}
      </td>
    </tr>
  );
}
