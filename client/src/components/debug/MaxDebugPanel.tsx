import { useState } from 'react';
import { X, ChevronDown, ChevronRight, ArrowUpRight, ArrowDownLeft, Server, Trash2, ClipboardCopy } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';
import type { MaxDebugLogEntry } from '@/stores/flowStore';

const LEVEL_CLASSES: Record<string, string> = {
  info: 'text-fg-muted',
  warn: 'text-amber-400',
  error: 'text-red-400',
};

const DIRECTION_ICON: Record<string, typeof ArrowUpRight> = {
  outgoing: ArrowUpRight,
  incoming: ArrowDownLeft,
  system: Server,
};

const DIRECTION_CLASSES: Record<string, string> = {
  outgoing: 'text-cyan-400',
  incoming: 'text-emerald-400',
  system: 'text-fg-dim',
};

function LogEntry({ entry }: { entry: MaxDebugLogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = DIRECTION_ICON[entry.direction] ?? Server;
  const hasDetail = !!entry.detail;

  return (
    <div className="border-b border-border/20">
      <button
        onClick={() => hasDetail && setExpanded(!expanded)}
        className={`flex items-start gap-1.5 w-full px-3 py-1.5 text-left text-[11px] hover:bg-surface-200/40 transition ${
          hasDetail ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        {hasDetail ? (
          expanded ? <ChevronDown className="w-3 h-3 text-fg-dim shrink-0 mt-0.5" /> : <ChevronRight className="w-3 h-3 text-fg-dim shrink-0 mt-0.5" />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <Icon className={`w-3 h-3 shrink-0 mt-0.5 ${DIRECTION_CLASSES[entry.direction] ?? ''}`} />
        <span className={`flex-1 break-all ${LEVEL_CLASSES[entry.level] ?? 'text-fg-muted'}`}>
          {entry.summary}
        </span>
        <span className="text-fg-dim shrink-0 tabular-nums ml-2">
          {entry.durationMs != null && (
            <span className="text-fg-dim mr-2">{entry.durationMs}ms</span>
          )}
          {new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </span>
      </button>
      {expanded && entry.detail && (
        <pre className="px-3 pb-2 ml-7 text-[10px] text-fg-dim font-mono whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto">
          {entry.detail}
        </pre>
      )}
    </div>
  );
}

export function MaxDebugPanel({ onClose }: { onClose: () => void }) {
  const maxDebugLog = useFlowStore((s) => s.maxDebugLog);
  const clearMaxDebugLog = useFlowStore((s) => s.clearMaxDebugLog);
  const [copied, setCopied] = useState(false);

  const handleCopyAll = () => {
    const text = maxDebugLog.map((entry) => {
      const time = new Date(entry.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const dir = entry.direction === 'outgoing' ? '>>>' : entry.direction === 'incoming' ? '<<<' : '---';
      const dur = entry.durationMs != null ? ` (${entry.durationMs}ms)` : '';
      const detail = entry.detail ? `\n    ${entry.detail.replace(/\n/g, '\n    ')}` : '';
      return `[${time}] ${dir} [${entry.level}] ${entry.summary}${dur}${detail}`;
    }).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="h-full flex flex-col bg-surface-100">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-2">
          <Server className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-medium text-foreground">Max Debug Log</span>
          <span className="text-[10px] text-fg-dim">{maxDebugLog.length} entries</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleCopyAll}
            className="p-1 rounded text-fg-dim hover:text-foreground hover:bg-surface-300 transition"
            title="Copy all"
          >
            {copied
              ? <span className="text-[10px] text-emerald-400 px-0.5">Copied</span>
              : <ClipboardCopy className="w-3 h-3" />
            }
          </button>
          <button
            onClick={clearMaxDebugLog}
            className="p-1 rounded text-fg-dim hover:text-foreground hover:bg-surface-300 transition"
            title="Clear log"
          >
            <Trash2 className="w-3 h-3" />
          </button>
          <button
            onClick={onClose}
            className="p-1 rounded text-fg-dim hover:text-foreground hover:bg-surface-300 transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {maxDebugLog.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <span className="text-xs text-fg-dim">No Max interactions yet. Push a path or trigger a sync.</span>
          </div>
        ) : (
          maxDebugLog.map((entry) => <LogEntry key={entry.id} entry={entry} />)
        )}
      </div>
    </div>
  );
}
