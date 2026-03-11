import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { FileOutput, ToggleLeft, ToggleRight } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';

interface OutputFlowData {
  label: string;
  enabled?: boolean;
  config_id?: string;
  [key: string]: unknown;
}

export const OutputFlowNode = memo(({ id, data }: NodeProps & { data: OutputFlowData }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectedNodeId = useFlowStore((s) => s.selectedNodeId);
  const toggleOutputEnabled = useFlowStore((s) => s.toggleOutputEnabled);
  const nodeConfigs = useFlowStore((s) => s.nodeConfigs);
  const isSelected = selectedNodeId === id;
  const enabled = data.enabled !== false;

  const config = data.config_id ? nodeConfigs.find((c) => c.id === data.config_id) : null;
  const format = (config?.delta?.format as string) ?? 'EXR';

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[160px] cursor-pointer transition-all ${
        isSelected
          ? 'border-fuchsia-400 bg-fuchsia-400/10 shadow-[0_0_12px_rgba(232,121,249,0.25)]'
          : enabled
          ? 'border-border bg-surface-200 hover:border-fuchsia-400/50'
          : 'border-border/40 bg-surface-200/40 opacity-50'
      }`}
      onClick={(e) => { e.stopPropagation(); selectNode(id); }}
    >
      <div className="flex items-center gap-2">
        <FileOutput className="w-3.5 h-3.5 text-fuchsia-400 shrink-0" />
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
        <button
          className="ml-auto p-0.5 rounded hover:bg-surface-300 transition-colors"
          onClick={(e) => { e.stopPropagation(); toggleOutputEnabled(id); }}
          title={enabled ? 'Disable output' : 'Enable output'}
        >
          {enabled
            ? <ToggleRight className="w-4 h-4 text-emerald-400" />
            : <ToggleLeft className="w-4 h-4 text-fg-dim" />
          }
        </button>
      </div>
      <div className="mt-1">
        <span className="text-[9px] px-1.5 py-0.5 rounded bg-fuchsia-400/15 text-fuchsia-300 font-mono">
          {format}
        </span>
      </div>
      <Handle
        type="target"
        position={Position.Left}
        className="!w-2.5 !h-2.5 !bg-fuchsia-400 !border-fuchsia-600"
      />
    </div>
  );
});

OutputFlowNode.displayName = 'OutputFlowNode';
