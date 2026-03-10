import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { FileOutput } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';

export const OutputNode = memo(({ data }: { data: { label: string; shotId: string; format: string; dimmed?: boolean } }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectionKind = useFlowStore((s) => s.selectionKind);
  const selectionId = useFlowStore((s) => s.selectionId);
  const isSelected = selectionKind === 'output' && selectionId === data.shotId;

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[160px] cursor-pointer transition-all ${
        isSelected
          ? 'border-purple-400 bg-purple-400/10 shadow-[0_0_12px_rgba(192,132,252,0.2)]'
          : data.dimmed
          ? 'border-border/40 bg-surface-200/40 opacity-35'
          : 'border-border bg-surface-200 hover:border-purple-400/50'
      }`}
      onClick={(e) => { e.stopPropagation(); selectNode('output', data.shotId); }}
    >
      <div className="flex items-center gap-2">
        <FileOutput className="w-3.5 h-3.5 text-purple-400" />
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
      </div>
      <div className="text-[10px] text-fg-dim mt-0.5">{data.format}</div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-purple-400 !border-purple-600" />
    </div>
  );
});

OutputNode.displayName = 'OutputNode';
