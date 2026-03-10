import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Maximize2 } from 'lucide-react';
import { useFlowStore } from '@/stores/flowStore';

export const ResolutionNode = memo(({ data }: { data: { label: string; resolution: string; dimmed?: boolean } }) => {
  const selectNode = useFlowStore((s) => s.selectNode);
  const selectionKind = useFlowStore((s) => s.selectionKind);
  const selectionId = useFlowStore((s) => s.selectionId);
  const isSelected = selectionKind === 'resolution' && selectionId === data.resolution;

  return (
    <div
      className={`rounded-lg border px-3 py-2 min-w-[120px] cursor-pointer transition-all ${
        isSelected
          ? 'border-green-400 bg-green-400/10 shadow-[0_0_12px_rgba(74,222,128,0.2)]'
          : data.dimmed
          ? 'border-border/40 bg-surface-200/40 opacity-35'
          : 'border-border bg-surface-200 hover:border-green-400/50'
      }`}
      onClick={(e) => { e.stopPropagation(); selectNode('resolution', data.resolution); }}
    >
      <div className="flex items-center gap-2">
        <Maximize2 className="w-3.5 h-3.5 text-green-400" />
        <span className="text-xs font-medium text-foreground truncate">{data.label}</span>
      </div>
      <Handle type="target" position={Position.Left} className="!w-2 !h-2 !bg-green-400 !border-green-600" />
      <Handle type="source" position={Position.Right} className="!w-2 !h-2 !bg-green-400 !border-green-600" />
    </div>
  );
});

ResolutionNode.displayName = 'ResolutionNode';
