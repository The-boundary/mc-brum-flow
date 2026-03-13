import { useState } from 'react';
import { useFlowStore, type ResolvedPath } from '@/stores/flowStore';
import { ToggleLeft, ToggleRight, FileOutput, Send, Upload, Loader2, AlertTriangle } from 'lucide-react';

export function OutputPreviewPanel() {
  const resolvedPaths = useFlowStore((s) => s.resolvedPaths);
  const pathCount = useFlowStore((s) => s.pathCount);
  const selectNode = useFlowStore((s) => s.selectNode);
  const setResolvedPathEnabled = useFlowStore((s) => s.setResolvedPathEnabled);
  const setAllResolvedPathsEnabled = useFlowStore((s) => s.setAllResolvedPathsEnabled);
  const pushToMax = useFlowStore((s) => s.pushToMax);
  const submitRender = useFlowStore((s) => s.submitRender);
  const showToast = useFlowStore((s) => s.showToast);
  const pathResolutionError = useFlowStore((s) => s.pathResolutionError);
  const syncLog = useFlowStore((s) => s.syncLog);

  const enabledCount = resolvedPaths.filter((p) => p.enabled).length;
  const enabledIndices = resolvedPaths
    .map((p, i) => (p.enabled ? i : -1))
    .filter((i) => i >= 0);

  const [pushing, setPushing] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handlePushToMax = async (pathKey: string) => {
    setPushing(true);
    try {
      const result = await pushToMax(pathKey);
      if (result.ok) {
        showToast('Pushed to 3ds Max', 'success');
      } else if (result.reason === 'error') {
        showToast(result.message ?? 'Push to 3ds Max failed', 'error');
      }
    } finally {
      setPushing(false);
    }
  };

  const handleSubmitRender = async () => {
    if (enabledIndices.length === 0) return;
    setSubmitting(true);
    try {
      const success = await submitRender(enabledIndices);
      if (success) {
        showToast(`Submitted ${enabledIndices.length} render${enabledIndices.length > 1 ? 's' : ''} to Deadline`, 'success');
      } else {
        showToast('Render submission failed', 'error');
      }
    } finally {
      setSubmitting(false);
    }
  };

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
          {enabledCount > 0 && (
            <button
              onClick={handleSubmitRender}
              disabled={submitting || pathResolutionError}
              className="flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-brand/15 text-brand hover:bg-brand/25 transition disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Submit {enabledCount} to Deadline
            </button>
          )}
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
                <th className="text-right px-3 py-1.5 text-[10px] text-fg-dim font-medium w-16">Push</th>
              </tr>
            </thead>
            <tbody>
              {resolvedPaths.map((path) => (
                <OutputRow
                  key={path.pathKey}
                  path={path}
                  onSelect={() => selectNode(path.outputNodeId)}
                  onToggle={() => void setResolvedPathEnabled(path.pathKey, path.outputNodeId, !path.enabled)}
                  onPush={() => handlePushToMax(path.pathKey)}
                  pushing={pushing || pathResolutionError}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Sync activity log */}
      {syncLog.length > 0 && (
        <div className="border-t border-border shrink-0 max-h-[120px] overflow-y-auto">
          <div className="px-3 py-1 text-[10px] text-fg-dim uppercase tracking-wider sticky top-0 bg-surface-100">Activity</div>
          {syncLog.slice(0, 10).map((entry) => (
            <div
              key={entry.id}
              className="flex items-center gap-2 px-3 py-1 text-[10px] border-t border-border/30"
            >
              <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                entry.status === 'success' ? 'bg-emerald-400' :
                entry.status === 'error' ? 'bg-red-400' :
                entry.status === 'syncing' ? 'bg-amber-400' : 'bg-fg-dim'
              }`} />
              <span className="text-fg-muted truncate flex-1">
                {entry.reason}
                {entry.cameraName && ` · ${entry.cameraName}`}
              </span>
              <span className="text-fg-dim shrink-0">
                {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OutputRow({
  path, onSelect, onToggle, onPush, pushing,
}: {
  path: ResolvedPath; onSelect: () => void; onToggle: () => void; onPush: () => void; pushing: boolean;
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
        <span className="flex items-center gap-1">
          {path.filename}
          {path.warnings && path.warnings.length > 0 && (
            <span title={path.warnings.join('\n')}>
              <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
            </span>
          )}
        </span>
      </td>
      <td className="px-3 py-1.5 text-fg-muted" onClick={onSelect}>
        {path.cameraName || '—'}
      </td>
      <td className="px-3 py-1.5 text-right">
        {path.enabled && (
          <button
            onClick={(e) => { e.stopPropagation(); onPush(); }}
            disabled={pushing}
            className="p-0.5 rounded text-fg-dim hover:text-brand hover:bg-brand/10 transition disabled:opacity-50"
            title="Push to 3ds Max"
          >
            <Upload className="w-3.5 h-3.5" />
          </button>
        )}
      </td>
    </tr>
  );
}
