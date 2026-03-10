import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import { Maximize2 } from 'lucide-react';

export const ResolutionNode = memo(({ data }: { data: { label: string; resolution: string; dimmed?: boolean } }) => {
  return (
    <div className={`rounded-lg border border-border bg-surface-200 px-3 py-2 min-w-[120px] transition-all ${data.dimmed ? 'opacity-35' : ''}`}>
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
